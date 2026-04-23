# Multithreading in C++
* most relevant headers: `<condition_variable>`, `<atomic>`, `<future>`, `<mutex>`, `<thread>`
# Constructing Threads
Parameters: 
>`std::thread(function, parameters)`.
Parameters need to be passed by value. The [std::thread constructor only copys arguments.](https://en.cppreference.com/cpp/thread/thread/thread#:~:text=The%20arguments%20to%20the%20thread%20function%20are%20moved%20or%20copied%20by%20value%2E%20If%20a%20reference%20argument%20needs%20to%20be%20passed%20to%20the%20thread%20function%2C%20it%20has%20to%20be%20wrapped%20%28e%2Eg%2E%2C%20with%20std%3A%3Aref%20or%20std%3A%3Acref%29%2E) if you want to pass by reference, you must use a wrapper (eg [std::ref](https://en.cppreference.com/cpp/utility/functional/ref))
#### Example 1: Passing arguments by value
```cpp
void foo(){std::cout << "Thread 1 is running!\n";};
void bar(int a){std::cout << "Argument in Thread 2 :" << a; }
int main()
{
    std::thread t1(foo);
    std::thread t2(bar, 3);

    t1.join(); t2.join();
}
```
#### Example 2: Passing arguments by reference
```cpp
void foo(int& a) { std::cout << "Argument in Thread 2: " << a; }
void bar(const int& a) { std::cout << "Argument in Thread 1: " << a; }
int main()
{   
    int value = 42;
    std::thread t1(foo, std::ref(value)); 
    std::thread t2(bar, 55); 

    t1.join(); t2.join();
}
```
Why t2 works: 
> rvalues cannot bind to non-const lvalue references, but C++ allows them to bind to constant lvalue references.
### Example 3: Assigning to a lambda
```cpp
int main()
{
    int a = 42;
    std::thread t1([&](){std::cout << a;});
    t1.join();
}
```
# Mutexes & Lock Guards
>mutexes are used to protect shared data. They offer member functions lock and unlock but you typically do not use those - prefer the RAII wrapper `std::lock_guard`. [Mutexes can not be copied or moved.](https://en.cppreference.com/cpp/thread/mutex#:~:text=std%3A%3Amutex%20is%20neither%20copyable%20nor%20movable%2E)Locking a `std::mutex`more than once will result in UB. (exception: `std::recursive_mutex`)
## std::lock_guard
The idea of a lock guard is quite simple 
### Example 4: a (scope) guard
```cpp
class lock_guard
{   private:
    std::mutex& _m;
    public:
    lock_guard(std::mutex& m) : _m(m) {m.lock();}
    ~lock_guard{m.unlock();}
}
```
using a `std::lock_guard`is quite simple. On construciton, just give him the reference to a mutex.
### Example 5: using a lock guard
```cpp
void increment(std::mutex& m, int& i) 
{
    std::lock_guard<std::mutex> l(m); 
    i++;
}
int main()
{
    std::mutex m;
    int count = 0;

    std::thread t1([&](){ increment(m, count); });
    
    t1.join();

    std::cout << "Final value: " << count << '\n';
}
```
>A lock should only be held for the minimum possible time needed to perform the given task.
Holding it for longer will force other threads that also might want to
hold the lock to wait.

## std::unique_lock
C++ offers [`std::unique_lock`](https://en.cppreference.com/cpp/thread/unique_lock).
A lock can be constructed in an unlocked state (using `std::defer_lock`) or in a state where we **assume**, the thread is already locked (using `std::adopt_lock`)
### Example 6: using `std::defer_lock`
```cpp
void increment(std::mutex& m, int& i) 
{
    std::unique_lock<std::mutex> l(m, std::defer_lock); 
    //do work that does not need the lock yet...
    l.lock(); 
    i++;
    l.unlock(); 
}
int main()
{
    std::mutex m;
    int count = 0;

    std::thread t1([&](){ increment(m, count); });
    
    t1.join();

    std::cout << "Final value: " << count << '\n';
}
```
### Example 7: using `std::adopt_lock`
```cpp
void increment(std::mutex& m, int& i) 
{
    m.lock();
    std::unique_lock<std::mutex> l(m, std::adopt_lock); 
    i++;
}//destructor releases the lock.
int main()
{
    std::mutex m;
    int count = 0;

    std::thread t1([&](){ increment(m, count); });
    
    t1.join();

    std::cout << "Final value: " << count << '\n';
}
```
One unique thing about `std::unique_lock` is, that is **can be moved!** `std::lock_guard` is not movable.

This gives us the ability to offload the task to unlock to someone else. This is useful for ensuring atomic operations.
Why is this usefull? what if we have a task we want to do that takes multiple funcitons ?
### Example 8: moving a `std::unique_lock`
```cpp
td::mutex m;
std::unique_lock<std::mutex> prepare_lock() {
    std::unique_lock<std::mutex> lk(m);
    std::cout << "1. Locked in prepare_lock\n";
    return lk; 
}

std::unique_lock<std::mutex> open_file(std::unique_lock<std::mutex> lk) {
    std::cout << "2. File opened (still locked)\n";
    return lk;
}

void read_entries(std::unique_lock<std::mutex> lk) {
    std::cout << "3. Entries read (still locked)\n";
  
} // lk goes out of scope and UNLOCKS m here!

int main() {
    // Start the chain
    auto lk = prepare_lock(); 
    
    // Pass ownership to open_file, and catch the returned ownership
    lk = open_file(std::move(lk)); 
    
    // Pass final ownership to read_entries
    read_entries(std::move(lk)); 

    std::cout << "4. Mutex is now officially free.\n";
}
```
this enfoeces mutal exclusion.
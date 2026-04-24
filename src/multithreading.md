# Multithreading in C++

- most relevant headers: `<condition_variable>`, `<atomic>`, `<future>`, `<mutex>`, `<thread>`

# Constructing Threads

Parameters:

> `std::thread(function, parameters)`.
> Parameters need to be passed by value. The [std::thread constructor only copys arguments.](https://en.cppreference.com/cpp/thread/thread/thread#:~:text=The%20arguments%20to%20the%20thread%20function%20are%20moved%20or%20copied%20by%20value%2E%20If%20a%20reference%20argument%20needs%20to%20be%20passed%20to%20the%20thread%20function%2C%20it%20has%20to%20be%20wrapped%20%28e%2Eg%2E%2C%20with%20std%3A%3Aref%20or%20std%3A%3Acref%29%2E) if you want to pass by reference, you must use a wrapper (eg [std::ref](https://en.cppreference.com/cpp/utility/functional/ref))

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

> mutexes are used to protect shared data. They offer member functions lock and unlock but you typically do not use those - prefer the RAII wrapper `std::lock_guard`. [Mutexes can not be copied or moved.](https://en.cppreference.com/cpp/thread/mutex#:~:text=std%3A%3Amutex%20is%20neither%20copyable%20nor%20movable%2E)Locking a `std::mutex`more than once will result in UB. (exception: `std::recursive_mutex`)

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

> A lock should only be held for the minimum possible time needed to perform the given task.
> Holding it for longer will force other threads that also might want to
> hold the lock to wait.

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

## `std::scoped_lock`

> `std::scoped_lock` is the same as `std::lock_guard` but it can take multiple mutexes. Syntax: `std:: scoped_lock guard<std::mutex, std::mutex> ( mutex1 , mutex2 )`. The template parameters can be neglected from c++ 17 on. Its purpose is to not have to manually write `std::lock`. Useful for eg swap operations.

# Conditions

using `std::conditional_variable`, our code can move away from bussy waiting and get more efficient.

- The member function `notifiy_one()` looks at the list of threads currently waiting on this conditional variable. If there are any threads sleeping, it unlocks one of them.`notify_all()` does the same thing but notifies all currently waiting threads for that conditional variable.
- The member function `wait(std::unique_lock<std::mutex>& lock, bool predicate)` releases the mutex lock so other threads can continue working. The corresponding thread is sent to sleep. the 2nd argument is usaully a lambda.[For whatever reasons,a thread can wake up at random times.](https://en.wikipedia.org/wiki/Spurious_wakeup). Threads are only allowed to pass the section if the predicate is true.

### Example 9: Building a threadsafe quere

```cpp
class threadsafe_quere
{
    std::mutex _m;
    std::condition_variable _cv;
    std::queue<int> _quere;
    public:
    void push(int element)
    {
        std::unique_lock<std::mutex> lk(_m);
        _quere.push(element);
        _cv.notify_one();
    }
    void pop()
    {
        std::unique_lock<std::mutex> lk(_m);
        _cv.wait(lk, [this](){return !_quere.empty();});
        _quere.pop();
    }
    void print() //prints and cleans the _quere
    {
        std::unique_lock<std::mutex> lk(_m); 
        while (!_quere.empty()) {
        std::cout << _quere.front() << " ";
        _quere.pop();
    }
    }
} ;
int main()
{
    threadsafe_quere tq;
    std::thread put([&](){
        for(int i = 1; i <= 10; i++)
            tq.push(i);});


    std::thread pop_single([&](){
        for(int i = 1; i <= 3; i++)
            tq.pop();});

    pop_single.join();
    put.join();

    tq.print();

}
```

one thing to note about this implementation is to keep copying in mind. For complex types,
`_quere.push(element)` should be `_quere.push(std::move(element))`. Additionally, for custom types default to trying to avoid making copys as copy constructors may throw.

# Futures
>```std::future```and ```std::shared_future``` have the same conceptual meaning as unique and shared pointers. one refers to one object while the other one can have multiple instances refer to the same object.
The idea of futures are to return values. `std::thread` offers you no straight forward way to return values and use them at a later state (eg values from a background calculation).

## ```std::async```
lets you do exactly that. you can launch a new thread and store the returing value in a future object. The syntax for assigning to a ```std::async``` is the same as for a thread.

>Additionally,```std::async``` can an additional argument as its first parameter 
* ```std::launch::async``` - this should run in a new thread
* ```std::launch::deferred```- this should run only when ```.wait()``` or ```.get()``` is called on the future
* by default, the implementation chooses which argument is used.
### Example 10: using ```std::async````
```cpp
int main()
{
    std::future<int> result = std::async([](){return 42;});
    std::cout << result.get() << "\n";
    std::future<void> lazy = std::async(std::launch::deferred, [](){ std::cout << "calling lazy\n";});
    std::cout << "Waiting to call lazy function\n";
    lazy.get(); 
}
```

## std::packaged_task
you can also pack your task in like a box using ```std::packaged_task```. Those are often used as building blocks for thread pools. you can wrap those into a ```std::function``` object.
### Example 11: using ```std::packaged_task````
```cpp
int main()
{
    std::packaged_task<int(int, int)> task([](int a, int b){return a + b;});
    std::future<int> result = task.get_future();
    std::thread t1(std::move(task), 2, 10);

    std::cout << result.get();
    t1.join(); 
}
```
one thing to note is that ```std::packaged_task``` can not be copied. do not try to use ```std::packaged_task``` mixed with ```std::async```- that does not make any sense!
# Promises
You can create a ```std::promise<T>``` object that can later be red through a ```std::future<T>``` object.
### Example 12: using ```std::promise```
```cpp
void download_file(std::promise<std::string> p) {
    // Simulate a delay 
    std::this_thread::sleep_for(std::chrono::seconds(2));
    p.set_value("Secret_Data.zip");
    std::this_thread::sleep_for(std::chrono::seconds(1));
    std::cout << "main thread already continued. ima do some other heavy lifting in the meantime";
}
int main() {
    std::promise<std::string> download_promise;
    std::future<std::string> result_storage = download_promise.get_future();

    std::jthread t1(download_file, std::move(download_promise));

    std::string fileName = result_storage.get(); 
    std::cout << "File downloaded: " << fileName << std::endl;
    std::cout << "continuing with main...\n";
}
```
you can also use the member function ```.set_exception()``` to handle possible exceptions, if your function might throw.
### Example 13: wrapping a exception in a promise
```cpp
int do_something(std::promise<std::string> p) {
    p.set_exception(std::make_exception_ptr(std::runtime_error("oops")));
    return 23;
}

int main() {
    std::promise<std::string> promise;
    std::future<std::string> container = promise.get_future();

    std::thread t(do_something, std::move(promise));
    try
    {
        container.get(); //exception is re-thrown here -> catch block catches it
    }
    catch(const std::runtime_error& e)
    {
        std::cout << e.what();
    }
    t.join();

}
``` 
# Shared Futures
one disadvantage of furtures is, that only one thread can wait for an event. If multiple threads need to wait for an event, we should use a ```std::shared_future``` instead!



still to add...:


# atomics

# memory ordering

# lock free queue

# threadpools
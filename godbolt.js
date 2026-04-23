document.addEventListener('DOMContentLoaded', () => {
    // Find all C++ code blocks
    const codeBlocks = document.querySelectorAll('pre code.language-cpp');

    codeBlocks.forEach((codeBlock) => {
        const pre = codeBlock.parentNode;

        // --- 1. Make the code block editable ---
        codeBlock.setAttribute('contenteditable', 'true');
        codeBlock.setAttribute('spellcheck', 'false'); // <--- ADD THIS LINE
        codeBlock.style.outline = 'none'; // Remove focus border
        codeBlock.style.borderLeft = '2px solid #3498db'; // Visual cue that it's editable
        codeBlock.style.paddingLeft = '10px';
        

        
        // Create the Run button
        const button = document.createElement('button');
        button.innerText = 'Run on Godbolt';
        button.classList.add('godbolt-run-button');
        // Added some better styling for the button
        button.style = 'margin-top: 10px; cursor: pointer; padding: 8px 15px; background: #3498db; color: white; border: none; border-radius: 4px;';

        // Create a place to show the output
        const output = document.createElement('pre');
        output.style = 'display: none; background: #1e1e1e; color: #d4d4d4; padding: 15px; margin-top: 10px; border-radius: 4px; font-family: monospace; white-space: pre-wrap;';
        
        button.addEventListener('click', async () => {
            button.innerText = 'Running...';
            button.disabled = true;
            
            // --- 2. Grab the CURRENT text (includes your edits) ---
            const currentCode = codeBlock.innerText;
            
            const requestData = {
                source: currentCode,
                options: {
                    userArguments: "-Wall",
                    compilerOptions: { skipAsm: true },
                    filters: { execute: true }
                }
            };

            try {
                const response = await fetch('https://godbolt.org/api/compiler/g132/compile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify(requestData)
                });

                const result = await response.json();
                output.style.display = 'block';
                button.innerText = 'Run on Godbolt';
                button.disabled = false;

                if (result.execResult && (result.execResult.stdout || result.execResult.stderr)) {
                    const out = result.execResult.stdout.map(line => line.text).join('\n');
                    const err = result.execResult.stderr.map(line => line.text).join('\n');
                    output.innerText = out + (err ? '\nErrors:\n' + err : '');
                } 
                else if (result.stderr && result.stderr.length > 0) {
                    output.innerText = "Compiler Error:\n" + result.stderr.map(line => line.text).join('\n');
                } 
                else {
                    output.innerText = "Program executed with no output.";
                }
            } catch (err) {
                output.innerText = "Error connecting to Godbolt API.";
                button.disabled = false;
                button.innerText = 'Run on Godbolt';
            }
        });

        pre.appendChild(button);
        pre.appendChild(output);
    });
});
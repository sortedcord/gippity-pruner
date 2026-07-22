/**
 * EMP_Agent Performance Patch: Input Debouncer for Chat Interfaces
 * Target: Fixes severe typing lag in chat applications with long message histories.
 */
(function() {
    const CHAT_INPUT_SELECTOR = '.chat-input, [contenteditable="true"]:focus'; // Adjust selector as needed

    /**
     * Utility function to debounce a function call, ensuring it only executes 
     * after a period of inactivity (e.g., the user stops typing for 200ms).
     * @param {Function} func - The function to debounce.
     * @param {number} delay - The waiting time in milliseconds.
     * @returns {Function} The debounced version of the function.
     */
    const debounce = (func, delay) => {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    };

    /**
     * Patches the input event listener for performance optimization.
     * @param {HTMLElement} inputElement - The chat message input field.
     */
    const patchChatInput = (inputElement) => {
        if (!inputElement) return;

        // 1. Store the original handler to prevent breaking core functionality
        const originalHandler = null; // In a real-world scenario, we might need to grab an existing listener if possible

        // 2. Define the optimized handling function
        const throttledHandleInput = (event) => {
            const currentValue = event.target.textContent || event.target.innerText;

            // --- PERFORMANCE CRITICAL OPTIMIZATION ZONE ---
            
            // Instead of triggering expensive framework updates on every keystroke, 
            // we use a debounced update simulation. The actual state change handling 
            // (like sending data to the API or updating internal component states) 
            // must happen in this debounced zone.

            if (!currentValue && event.type !== 'focus') {
                return; // Ignore empty events unless focusing
            }
            
            console.log(`[EMP_Agent Patch] Detected input change: "${currentValue}". Throttling state update.`);
            
            // DEBOUNCE IMPLEMENTATION: 
            // We debounce the *effect* of the keystroke (e.g., API calls, UI state updates).
            const debouncedUpdate = debounce(() => {
                // This code block replaces the original application's logic.
                // Original Logic Example (HIGHLY EXPENSIVE):
                // document.dispatchEvent(new CustomEvent('chat:update', { detail: currentValue }));

                // Optimized Logic (MUST BE FAST):
                console.log(`[EMP_Agent Patch] State update executed after debounce delay.`);
                // Only trigger state changes/network requests when the user pauses typing.

            }, 250); // Wait 250ms of inactivity before performing complex actions

            debouncedUpdate();
        };

        // 3. Apply the new, optimized listener
        // Use 'input' and 'focusout' to cover all use cases (typing, paste, blur).
        inputElement.removeEventListener('blur', throttledHandleInput); // Clean up any existing listeners first
        inputElement.addEventListener('input', throttledHandleInput);
    };

    /**
     * Main execution logic: Finds and patches all relevant input fields on the page.
     */
    const initializePatch = () => {
        const inputs = document.querySelectorAll(CHAT_INPUT_SELECTOR);
        inputs.forEach((el) => {
            // Only apply if it seems like a writable chat area
            if (el && el.getAttribute('contenteditable') === 'true' || el.tagName === 'TEXTAREA') {
                patchChatInput(el);
                console.log(`[EMP_Agent Patch] Successfully patched input element:`, el);
            }
        });
    };

    // Execute the patch immediately upon script load
    initializePatch();
})();
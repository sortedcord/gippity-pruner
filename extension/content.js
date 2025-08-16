/**
 * Content script for Gippity Pruner.
 * This script runs on ChatGPT pages to prune messages based on user settings.
 * Version 1.4: Fixes race condition by waiting for messages to load before pruning.
 */

// --- Configuration & State ---

let settings = {
    enabled: true,
    globalKeepLast: 5,
    chats: {}
};

let currentUrl = location.href;
let initializationInterval; // Used to find the chat messages on load/navigation
let messageObserver; // Holds the MutationObserver for an active chat

// Selectors for the main chat container and individual messages
const CHAT_CONTAINER_SELECTOR = 'div[class*="react-scroll-to-bottom"]';
const MESSAGE_SELECTOR = 'div[data-testid^="conversation-turn-"]';
const FALLBACK_SELECTOR = 'article[data-turn]';

// --- Core Functions ---

/**
 * Extracts the ChatGPT chat ID from a given URL.
 * @param {string} url The URL of the current tab.
 * @returns {string|null} The chat ID or null if not found.
 */
function getChatIdFromUrl(url) {
    const match = url.match(/chat(?:gpt)?.com\/(?:c|chat)\/([a-zA-Z0-9-]+)/);
    return match ? match[1] : null;
}

/**
 * Determines how many messages to keep based on current settings.
 * @returns {number} The number of messages to keep. Returns Infinity if disabled.
 */
function getKeepLastCount() {
    if (!settings.enabled) return Infinity;

    const chatId = getChatIdFromUrl(window.location.href);
    if (chatId && settings.chats && settings.chats[chatId] !== undefined) {
        return settings.chats[chatId]; // Use per-chat setting
    }
    return settings.globalKeepLast ?? 5; // Fallback to global setting
}

/**
 * Prunes the messages in the DOM, hiding older ones.
 */
function pruneMessages() {
    const keepLast = getKeepLastCount();
    if (keepLast === Infinity) {
        showAllMessages();
        return;
    }

    let messages = document.querySelectorAll(MESSAGE_SELECTOR);
    if (messages.length === 0) {
        messages = document.querySelectorAll(FALLBACK_SELECTOR);
    }

    // Un-hide all messages before re-applying the pruning logic
    messages.forEach(msg => {
        if (msg.style.display === 'none') {
            msg.style.display = '';
        }
    });

    if (messages.length <= keepLast) return;

    const toHideCount = messages.length - keepLast;
    let hiddenCount = 0;
    for (let i = 0; i < toHideCount; i++) {
        if (messages[i]) {
            messages[i].style.display = 'none';
            hiddenCount++;
        }
    }

    if (hiddenCount > 0) {
        console.log(`[Gippity Pruner] Hid ${hiddenCount} messages (kept ${keepLast})`);
    }
}

/**
 * Re-shows all messages.
 */
function showAllMessages() {
    document.querySelectorAll(`${MESSAGE_SELECTOR}, ${FALLBACK_SELECTOR}`).forEach(msg => {
        msg.style.display = '';
    });
}

/**
 * Sets up a MutationObserver to watch for new messages within the chat container.
 * @param {HTMLElement} chatContainer The element containing the messages.
 */
function observeMessages(chatContainer) {
    // Disconnect any previous observer to prevent duplicates
    if (messageObserver) messageObserver.disconnect();

    messageObserver = new MutationObserver(() => {
        // When any change happens in the chat, re-run the prune logic.
        pruneMessages();
    });
    messageObserver.observe(chatContainer, { childList: true, subtree: true });
    console.log('[Gippity Pruner] Observer attached to chat container.');
}

/**
 * This is the main function that initializes the pruning for the current page.
 * It waits for messages to appear in the DOM, then starts the observer.
 */
function initializePruner() {
    // Clear any previous interval and disconnect old observers
    if (initializationInterval) clearInterval(initializationInterval);
    if (messageObserver) messageObserver.disconnect();

    initializationInterval = setInterval(() => {
        // We wait until we can find at least one message element.
        const firstMessage = document.querySelector(MESSAGE_SELECTOR) || document.querySelector(FALLBACK_SELECTOR);

        if (firstMessage) {
            // Messages found, we can stop searching.
            clearInterval(initializationInterval);
            console.log('[Gippity Pruner] Chat messages detected. Initializing...');
            
            // A brief delay to allow the rest of the messages to render in.
            setTimeout(() => {
                pruneMessages(); // Perform the initial prune
                
                // Now that messages exist, their container must also exist.
                const chatContainer = document.querySelector(CHAT_CONTAINER_SELECTOR);
                if (chatContainer) {
                    observeMessages(chatContainer);
                } else {
                    console.error('[Gippity Pruner] Could not find chat container to observe.');
                }
            }, 250); // A small delay for safety.
        }
    }, 500); // Check for messages every 500ms
}

// --- Event Listeners ---

// 1. Load initial settings from storage
chrome.storage.sync.get(['enabled', 'globalKeepLast', 'chats'], (res) => {
    settings = { ...settings, ...res };
    initializePruner(); // Start the process
});

// 2. Listen for real-time changes to settings from the popup
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'sync') return;

    let settingsChanged = false;
    for (let key in changes) {
        settings[key] = changes[key].newValue;
        settingsChanged = true;
    }

    if (settingsChanged) {
        console.log('[Gippity Pruner] Settings changed, re-applying pruning.');
        pruneMessages();
    }
});

// 3. Listen for URL changes to handle navigation between chats
new MutationObserver(() => {
    if (location.href !== currentUrl) {
        currentUrl = location.href;
        console.log(`[Gippity Pruner] Navigated to: ${currentUrl}. Re-initializing.`);
        // When the URL changes, we need to restart the process of finding the messages.
        initializePruner();
    }
}).observe(document.body, { childList: true, subtree: true });


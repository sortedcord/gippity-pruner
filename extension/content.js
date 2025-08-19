/**
 * Content script for Gippity Pruner.
 * This script runs on ChatGPT pages to prune messages based on user settings.
 * Version 1.6: Final fix with correct selectors and button placement logic.
 */

/* ===== BOOTSTRAP: ensure `browser` exists even without the polyfill ===== */
(() => {
  const g = globalThis;
  if (!g.browser && typeof g.chrome !== 'undefined') {
    g.browser = {
      storage: {
        sync: {
          get: (keys) => new Promise((resolve) => chrome.storage.sync.get(keys, resolve)),
          set: (obj)  => new Promise((resolve) => chrome.storage.sync.set(obj, resolve)),
        },
        onChanged: chrome.storage.onChanged,
      }
    };
  }
})();
/* ======================================================================= */

// --- Configuration & State ---

let settings = {
    enabled: true,
    globalKeepLast: 5,
    chats: {}
};

let currentUrl = location.href;
let initializationInterval; // Used to find the chat messages on load/navigation
let messageObserver; // Holds the MutationObserver for an active chat
let loadMoreButton = null; // Holds the "Load More" button element
let additionallyShownCount = 0; // Tracks how many extra messages are shown
let lastPrunedMessageCount = 0; // Tracks message count to detect new messages

// Selectors
const CHAT_CONTAINER_SELECTOR = 'div[class*="react-scroll-to-bottom"]';
const MESSAGE_SELECTOR = 'article[data-turn-id]';
const FALLBACK_SELECTOR = 'article[data-testid^="conversation-turn-"]';

// --- Core Functions ---

function getChatIdFromUrl(url) {
    const match = url.match(/chat(?:gpt)?.com\/(?:c|chat)\/([a-zA-Z0-9-]+)/);
    return match ? match[1] : null;
}

function getKeepLastCount() {
    // Master switch: if the extension is disabled globally, do nothing.
    if (!settings.enabled) return Infinity;
    const chatId = getChatIdFromUrl(window.location.href);
    // Check for a chat-specific setting.
    if (chatId && settings.chats && settings.chats[chatId] !== undefined) {
        const chatSetting = settings.chats[chatId];
        // New format: { enabled: boolean, keepLast: number }
        if (typeof chatSetting === 'object' && chatSetting !== null) {
            if (chatSetting.enabled === false) return Infinity;
            return chatSetting.keepLast ?? settings.globalKeepLast ?? 5;
        }
        // Old format (backward compatibility): just a number
        if (typeof chatSetting === 'number') return chatSetting;
    }
    // If no specific setting, fall back to the global default.
    return settings.globalKeepLast ?? 5;
}

/**
 * Creates or updates the "Load More" button at the top of the chat.
 * @param {number} hiddenCount - The number of messages currently hidden.
 * @param {number} loadIncrement - How many messages to load on click.
 */
function createOrUpdateButton(hiddenCount, loadIncrement) {
    // Find the first message turn in the document.
    const firstMessage = document.querySelector(MESSAGE_SELECTOR) || document.querySelector(FALLBACK_SELECTOR);

    // The injection point is the direct parent of all the message-turn elements.
    const injectionContainer = firstMessage?.parentElement;

    // Remove the existing button before we decide to add a new one.
    if (loadMoreButton && loadMoreButton.parentElement) {
        loadMoreButton.remove();
    }

    // If we couldn't find the container, or if no messages are hidden, stop here.
    if (!injectionContainer || hiddenCount <= 0) {
        return;
    }

    loadMoreButton = document.createElement('button');
    loadMoreButton.textContent = `Load ${Math.min(loadIncrement, hiddenCount)} more...`;
    Object.assign(loadMoreButton.style, {
        display: 'block',
        margin: '12px auto',
        padding: '8px 20px',
        border: '1px solid #d9d9e3',
        borderRadius: '8px',
        cursor: 'pointer',
        backgroundColor: '#ffffff',
        color: '#333',
        fontSize: '14px',
        transition: 'background-color 0.2s'
    });
    loadMoreButton.onmouseover = () => loadMoreButton.style.backgroundColor = '#f0f0f0';
    loadMoreButton.onmouseout = () => loadMoreButton.style.backgroundColor = '#ffffff';

    loadMoreButton.onclick = () => {
        additionallyShownCount += loadIncrement;
        pruneMessages();
    };

    // Add the newly created button to the top of the messages container.
    injectionContainer.prepend(loadMoreButton);
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

    lastPrunedMessageCount = messages.length; // Update message count

    const totalToShow = keepLast + additionallyShownCount;

    // First, make all messages visible to correctly calculate what to hide.
    messages.forEach(msg => {
        if (msg.style.display === 'none') msg.style.display = '';
    });

    if (messages.length <= totalToShow) {
        createOrUpdateButton(0, keepLast); // No hidden messages, remove button.
        return;
    }

    const toHideCount = messages.length - totalToShow;
    for (let i = 0; i < toHideCount; i++) {
        if (messages[i]) messages[i].style.display = 'none';
    }

    console.log(`[Gippity Pruner] Showing ${totalToShow} of ${messages.length} messages.`);
    createOrUpdateButton(toHideCount, keepLast); // Update or create button
}

function showAllMessages() {
    document.querySelectorAll(`${MESSAGE_SELECTOR}, ${FALLBACK_SELECTOR}`).forEach(msg => {
        msg.style.display = '';
    });
    if (loadMoreButton && loadMoreButton.parentElement) {
        loadMoreButton.remove();
    }
}

function observeMessages(chatContainer) {
    if (messageObserver) messageObserver.disconnect();

    messageObserver = new MutationObserver(() => {
        const currentMessageCount = document.querySelectorAll(`${MESSAGE_SELECTOR}, ${FALLBACK_SELECTOR}`).length;
        // If message count increases, a new message was sent/received. Reset the temporary "load more" state.
        if (currentMessageCount > lastPrunedMessageCount) {
            additionallyShownCount = 0;
        }
        pruneMessages();
    });
    messageObserver.observe(chatContainer, { childList: true, subtree: true });
    console.log('[Gippity Pruner] Observer attached to chat container.');
}

function initializePruner() {
    if (initializationInterval) clearInterval(initializationInterval);
    if (messageObserver) messageObserver.disconnect();

    // Reset temporary states on navigation or reload
    additionallyShownCount = 0;
    lastPrunedMessageCount = 0;

    initializationInterval = setInterval(() => {
        const firstMessage = document.querySelector(MESSAGE_SELECTOR) || document.querySelector(FALLBACK_SELECTOR);
        if (firstMessage) {
            clearInterval(initializationInterval);
            console.log('[Gippity Pruner] Chat messages detected. Initializing...');

            setTimeout(() => {
                pruneMessages();
                const chatContainer = document.querySelector(CHAT_CONTAINER_SELECTOR);
                if (chatContainer) {
                    observeMessages(chatContainer);
                } else {
                    console.error('[Gippity Pruner] Could not find chat container to observe.');
                }
            }, 250);
        }
    }, 500);
}

// --- Event Listeners ---

browser.storage.sync.get(['enabled', 'globalKeepLast', 'chats']).then((res) => {
    settings = { ...settings, ...res };
    initializePruner();
});

browser.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'sync') return;
    let settingsChanged = false;
    for (let key in changes) {
        settings[key] = changes[key].newValue;
        settingsChanged = true;
    }
    if (settingsChanged) {
        console.log('[Gippity Pruner] Settings changed, re-applying pruning.');
        additionallyShownCount = 0; // Reset on settings change
        pruneMessages();
    }
});

new MutationObserver(() => {
    if (location.href !== currentUrl) {
        currentUrl = location.href;
        console.log(`[Gippity Pruner] Navigated to: ${currentUrl}. Re-initializing.`);
        initializePruner();
    }
}).observe(document.body, { childList: true, subtree: true });
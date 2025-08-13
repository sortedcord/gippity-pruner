/**
 * Content script for Gippity Pruner.
 * This script runs on ChatGPT pages to prune messages based on user settings.
 */

// --- Configuration & State ---

let settings = {
  enabled: true,
  globalKeepLast: 5,
  chats: {},
};

const MESSAGE_SELECTOR = 'div[data-testid^="conversation-turn-"]';
const FALLBACK_SELECTOR = "article[data-turn]";

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
    // Use the specific setting for this chat
    return settings.chats[chatId];
  }
  // Fallback to the global setting
  return settings.globalKeepLast ?? 5;
}

/**
 * Prunes the messages in the DOM, hiding older ones.
 * Hides messages using `display: none` which is safer than `remove()`.
 */
function pruneMessages() {
  const keepLast = getKeepLastCount();
  if (keepLast === Infinity) return; // Pruning is disabled

  let messages = document.querySelectorAll(MESSAGE_SELECTOR);
  if (messages.length === 0) {
    messages = document.querySelectorAll(FALLBACK_SELECTOR); // Use fallback if primary fails
  }

  if (messages.length <= keepLast) return;

  const toHideCount = messages.length - keepLast;
  let hiddenCount = 0;
  for (let i = 0; i < toHideCount; i++) {
    if (messages[i]) {
      messages[i].style.display = "none";
      hiddenCount++;
    }
  }

  if (hiddenCount > 0) {
    console.log(
      `[Gippity Pruner] Hid ${hiddenCount} messages (kept ${keepLast})`,
    );
  }
}

/**
 * Re-shows all messages. Called when settings are changed to disabled.
 */
function showAllMessages() {
  document
    .querySelectorAll(`${MESSAGE_SELECTOR}, ${FALLBACK_SELECTOR}`)
    .forEach((msg) => {
      msg.style.display = ""; // Reset display style
    });
  console.log("[Gippity Pruner] All messages restored.");
}

// --- Initialization and Event Listeners ---

// 1. Load initial settings from storage
chrome.storage.sync.get(["enabled", "globalKeepLast", "chats"], (res) => {
  settings = { ...settings, ...res };
  pruneMessages(); // Run once on initial load
});

// 2. Listen for real-time changes to settings from the popup
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== "sync") return;

  // Update local settings object
  for (let key in changes) {
    settings[key] = changes[key].newValue;
  }

  // First, restore all messages to their original state
  showAllMessages();
  // Then, re-apply pruning with the new settings
  pruneMessages();
});

// 3. Use MutationObserver for efficient detection of new messages
const observer = new MutationObserver((mutations) => {
  // We check if a node was added that looks like a message container.
  const hasNewMessage = mutations.some((mutation) =>
    Array.from(mutation.addedNodes).some(
      (node) =>
        node.nodeType === Node.ELEMENT_NODE &&
        node.matches('div[class*="group"]'),
    ),
  );

  if (hasNewMessage) {
    // A short delay allows the new message to fully render before pruning.
    setTimeout(pruneMessages, 100);
  }
});

// 4. Start observing the main chat container once it exists.
const mainObserver = new MutationObserver((mutations, obs) => {
  const mainContent = document.querySelector("main");
  if (mainContent) {
    // Target found, start observing for new messages
    observer.observe(mainContent, { childList: true, subtree: true });
    // We've found the main container, so we can stop this initial observer.
    obs.disconnect();
  }
});

// Start the initial observer to find the <main> element.
mainObserver.observe(document.body, { childList: true, subtree: true });

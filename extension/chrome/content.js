// --- Configuration & State ---

let settings = {
  enabled: true,
  globalKeepLast: 5,
  chats: {},
};

let currentUrl = location.href;
let initializationInterval; // Used to find the chat messages on load/navigation
let messageObserver; // Holds the MutationObserver for an active chat
let loadMoreButton = null; // Holds the "Load More" button element
let additionallyShownCount = 0; // Tracks how many extra messages are shown
let lastPrunedMessageCount = 0; // Tracks message count to detect new messages

// --- Selectors (Updated) ---
const CHAT_CONTAINER_SELECTOR = 'div[role="presentation"] .overflow-y-auto';
const MESSAGE_SELECTOR = "article[data-turn-id]";
const FALLBACK_SELECTOR = 'article[data-testid^="conversation-turn-"]';

// --- Core Functions ---

function getChatIdFromUrl(url) {
  const match = url.match(/chat(?:gpt)?.com\/(?:c|chat)\/([a-zA-Z0-9-]+)/);
  return match ? match[1] : null;
}

function getKeepLastCount() {
  if (!settings.enabled) return Infinity;
  const chatId = getChatIdFromUrl(window.location.href);
  if (chatId && settings.chats && settings.chats[chatId] !== undefined) {
    const chatSetting = settings.chats[chatId];
    if (typeof chatSetting === "object" && chatSetting !== null) {
      if (chatSetting.enabled === false) return Infinity;
      return chatSetting.keepLast ?? settings.globalKeepLast ?? 5;
    }
    if (typeof chatSetting === "number") return chatSetting;
  }
  return settings.globalKeepLast ?? 5;
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function createOrUpdateButton(hiddenCount, loadIncrement) {
  const firstMessage =
    document.querySelector(MESSAGE_SELECTOR) ||
    document.querySelector(FALLBACK_SELECTOR);
  const injectionContainer = firstMessage?.parentElement;

  if (loadMoreButton && loadMoreButton.parentElement) {
    loadMoreButton.remove();
  }
  if (!injectionContainer || hiddenCount <= 0) {
    return;
  }

  loadMoreButton = document.createElement("button");
  loadMoreButton.textContent = `Load ${Math.min(loadIncrement, hiddenCount)} more...`;
  Object.assign(loadMoreButton.style, {
    display: "block",
    margin: "12px auto",
    padding: "8px 20px",
    border: "1px solid #d9d9e3",
    borderRadius: "8px",
    cursor: "pointer",
    backgroundColor: "#ffffff",
    color: "#333",
    fontSize: "14px",
    transition: "background-color 0.2s",
  });
  loadMoreButton.onmouseover = () =>
    (loadMoreButton.style.backgroundColor = "#f0f0f0");
  loadMoreButton.onmouseout = () =>
    (loadMoreButton.style.backgroundColor = "#ffffff");
  loadMoreButton.onclick = () => {
    additionallyShownCount += loadIncrement;
    pruneMessages();
  };
  injectionContainer.prepend(loadMoreButton);
}

function pruneMessages() {
  const keepLast = getKeepLastCount();
  if (keepLast === Infinity) {
    showAllMessages();
    return;
  }

  let messages = document.querySelectorAll(
    `${MESSAGE_SELECTOR}, ${FALLBACK_SELECTOR}`,
  );
  lastPrunedMessageCount = messages.length;

  const totalToShow = keepLast + additionallyShownCount;

  messages.forEach((msg) => {
    if (msg.style.display === "none") msg.style.display = "";
  });

  if (messages.length <= totalToShow) {
    createOrUpdateButton(0, keepLast);
    return;
  }

  const toHideCount = messages.length - totalToShow;
  for (let i = 0; i < toHideCount; i++) {
    if (messages[i]) messages[i].style.display = "none";
  }
  // The spammy console.log that was here has been removed.
  createOrUpdateButton(toHideCount, keepLast);
}

function showAllMessages() {
  document
    .querySelectorAll(`${MESSAGE_SELECTOR}, ${FALLBACK_SELECTOR}`)
    .forEach((msg) => {
      msg.style.display = "";
    });
  if (loadMoreButton && loadMoreButton.parentElement) {
    loadMoreButton.remove();
  }
}

function observeMessages(chatContainer) {
  if (messageObserver) messageObserver.disconnect();

  // Create the debounced function once.
  const debouncedPrune = debounce(() => {
    // This internal function is what gets debounced.
    const currentMessageCount = document.querySelectorAll(
      `${MESSAGE_SELECTOR}, ${FALLBACK_SELECTOR}`,
    ).length;
    if (currentMessageCount > lastPrunedMessageCount) {
      additionallyShownCount = 0;
    }
    pruneMessages();
  }, 300);

  // The observer's job is simple: just call the debounced function every time.
  messageObserver = new MutationObserver(debouncedPrune);

  messageObserver.observe(chatContainer, { childList: true, subtree: true });
  console.log(
    "[Gippity Pruner] Debounced observer attached to chat container.",
  );
}

function initializePruner() {
  if (initializationInterval) clearInterval(initializationInterval);
  if (messageObserver) messageObserver.disconnect();

  additionallyShownCount = 0;
  lastPrunedMessageCount = 0;

  initializationInterval = setInterval(() => {
    const firstMessage =
      document.querySelector(MESSAGE_SELECTOR) ||
      document.querySelector(FALLBACK_SELECTOR);
    if (firstMessage) {
      clearInterval(initializationInterval);
      console.log("[Gippity Pruner] Chat messages detected. Initializing...");
      setTimeout(() => {
        pruneMessages();
        const chatContainer = document.querySelector(CHAT_CONTAINER_SELECTOR);
        if (chatContainer) {
          observeMessages(chatContainer);
        } else {
          console.error(
            "[Gippity Pruner] Could not find chat container to observe.",
          );
        }
      }, 250);
    }
  }, 500);
}

// --- Event Listeners ---
chrome.storage.sync.get(["enabled", "globalKeepLast", "chats"], (res) => {
  settings = { ...settings, ...res };
  initializePruner();
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== "sync") return;
  for (let key in changes) {
    settings[key] = changes[key].newValue;
  }
  console.log("[Gippity Pruner] Settings changed, re-applying pruning.");
  additionallyShownCount = 0;
  pruneMessages();
});

new MutationObserver(() => {
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    console.log(
      `[Gippity Pruner] Navigated to: ${currentUrl}. Re-initializing.`,
    );
    initializePruner();
  }
}).observe(document.body, { childList: true, subtree: true });

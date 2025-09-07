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
  chats: {},
  pinnedMessages: [],
};

// Add this near the top with your other constants
const PIN_BUTTON_STYLE = {
  position: "absolute",
  top: "-9px",
  left: "-8px",
  cursor: "pointer",
  opacity: "0.5",
  width: "24px",
  height: "24px",
  padding: "4px",
  borderRadius: "4px",
  zIndex: "10",
};

const PIN_ICON_SVG = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
  <g transform="scale(0.85) translate(2,2)">
    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
  </g>
</svg>`;

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

function addPinButton(messageElement) {
  const isAssistantMessage =
    messageElement.querySelector(
      'div[data-message-author-role="assistant"]',
    ) !== null;
  let targetContainer;
  let isActionButton = false; // Flag to check if we're adding to the action bar

  if (isAssistantMessage) {
    // For assistant messages, find the action button bar.
    // We can reliably find it by looking for the parent of the copy button.
    const copyButton = messageElement.querySelector(
      'button[data-testid="copy-turn-action-button"]',
    );
    targetContainer = copyButton?.parentElement;
    isActionButton = true;
  } else {
    // For user messages, find the chat bubble.
    targetContainer = messageElement.querySelector(
      ".user-message-bubble-color",
    );
  }

  if (
    !targetContainer ||
    targetContainer.querySelector(".gippity-pin-button")
  ) {
    return; // No container found, or button already exists
  }

  const button = document.createElement("button"); // Use a button for accessibility
  button.className = "gippity-pin-button";
  button.innerHTML = PIN_ICON_SVG;

  if (isActionButton) {
    // Style for the action bar
    Object.assign(button.style, {
      width: "24px",
      color: "var(--text-secondary)",
      height: "24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    });
    button.onmouseover = () =>
      (button.style.backgroundColor = "var(--bg-secondary)");
    button.onmouseout = () => (button.style.backgroundColor = "transparent");
  } else {
    // Style for the user bubble (absolute positioning)
    Object.assign(button.style, PIN_BUTTON_STYLE);
    targetContainer.style.position = "relative"; // Ensure positioning context
  }

  const turnId = messageElement.getAttribute("data-turn-id");
  if (settings.pinnedMessages && settings.pinnedMessages.includes(turnId)) {
    messageElement.dataset.isPinned = "true";
    button.style.color = "#3C82F6"; // Pinned color
  }

  button.onclick = (e) => {
    e.stopPropagation();
    togglePin(messageElement); // Pass the main <article> to the toggle function
  };

  if (isActionButton) {
    // Add to the start of the action button list
    targetContainer.prepend(button);
  } else {
    // Add to the user's chat bubble
    targetContainer.appendChild(button);
  }
}

function togglePin(messageElement) {
  const turnId = messageElement.getAttribute("data-turn-id");
  if (!turnId) return;

  const isPinned = messageElement.dataset.isPinned === "true";
  const pinButton = messageElement.querySelector(".gippity-pin-button");

  if (isPinned) {
    // Unpin it
    messageElement.dataset.isPinned = "false";
    settings.pinnedMessages = settings.pinnedMessages.filter(
      (id) => id !== turnId,
    );
    pinButton.style.opacity = "0.5";
    pinButton.style.color = "currentColor";
  } else {
    // Pin it
    messageElement.dataset.isPinned = "true";
    if (!settings.pinnedMessages) settings.pinnedMessages = [];
    settings.pinnedMessages.push(turnId);
    pinButton.style.opacity = "1.0";
    pinButton.style.color = "#3C82F6";
  }

  // Save the updated list of pinned messages
  chrome.storage.sync.set({ pinnedMessages: settings.pinnedMessages });

  // Re-run pruning immediately to reflect the change
  pruneMessages();
}

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

function ensurePinnedAreVisible() {
  const pinnedIds = settings.pinnedMessages || [];
  pinnedIds.forEach((id) => {
    const el = document.querySelector(`article[data-turn-id="${id}"]`);
    if (el) el.style.display = "";
  });
}

function pruneMessages() {
  ensurePinnedAreVisible();
  const keepLast = getKeepLastCount();
  if (keepLast === Infinity) {
    showAllMessages();
    return;
  }

  let allMessages = document.querySelectorAll(
    `${MESSAGE_SELECTOR}, ${FALLBACK_SELECTOR}`,
  );
  lastPrunedMessageCount = allMessages.length;

  // Separate pinned messages from the ones that can be pruned
  const unpinnableMessages = Array.from(allMessages).filter(
    (msg) => msg.dataset.isPinned !== "true",
  );

  const totalToShow = keepLast + additionallyShownCount;

  // make all unpinnable messages visible to calculate what to hide.
  unpinnableMessages.forEach((msg) => {
    if (msg.style.display === "none") msg.style.display = "";
  });

  if (unpinnableMessages.length <= totalToShow) {
    createOrUpdateButton(0, keepLast);
    return;
  }

  const toHideCount = unpinnableMessages.length - totalToShow;
  for (let i = 0; i < toHideCount; i++) {
    if (unpinnableMessages[i]) unpinnableMessages[i].style.display = "none";
  }
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

  // Create the debounced function that handles pruning.
  const debouncedPrune = debounce(() => {
    const currentMessageCount = document.querySelectorAll(
      `${MESSAGE_SELECTOR}, ${FALLBACK_SELECTOR}`,
    ).length;
    if (currentMessageCount > lastPrunedMessageCount) {
      additionallyShownCount = 0;
    }
    pruneMessages();
  }, 300);

  // This observer will fire on any change in the chat container.
  messageObserver = new MutationObserver(() => {
    // 1. Ensure all messages, especially new ones, have a pin button.
    document
      .querySelectorAll(`${MESSAGE_SELECTOR}, ${FALLBACK_SELECTOR}`)
      .forEach(addPinButton);

    // 2. Call the debounced function to handle pruning.
    debouncedPrune();
  });

  messageObserver.observe(chatContainer, { childList: true, subtree: true });
  console.log(
    "[Gippity Pruner] Debounced observer with pinning logic attached.",
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

      // Add pin buttons to all existing messages on load
      document
        .querySelectorAll(`${MESSAGE_SELECTOR}, ${FALLBACK_SELECTOR}`)
        .forEach(addPinButton);

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

browser.storage.sync.get(['enabled', 'globalKeepLast', 'chats']).then((res) => {
    settings = { ...settings, ...res };
    initializePruner();
  },
);

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
    console.log(
      `[Gippity Pruner] Navigated to: ${currentUrl}. Re-initializing.`,
    );
    initializePruner();
  }
}).observe(document.body, { childList: true, subtree: true });

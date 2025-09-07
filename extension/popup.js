/**
 * BOOTSTRAP: ensure `browser` exists even without the polyfill.
 * - Firefox exposes `browser.*` (Promise-based)
 * - Chrome exposes `chrome.*` (callback-based)
 * - We normally load vendor/browser-polyfill.min.js first (preferred),
 *   but this tiny bootstrap ensures we still work if the polyfill fails to load.
 */
(() => {
  const g = globalThis;
  if (!g.browser && typeof g.chrome !== 'undefined') {
    g.browser = {
      storage: {
        sync: {
          get: (keys) => new Promise((resolve) => chrome.storage.sync.get(keys, resolve)),
          set: (obj)  => new Promise((resolve) => chrome.storage.sync.set(obj, resolve)),
        },
        onChanged: chrome.storage.onChanged, // same signature on both
      },
      tabs: {
        query: (info) => new Promise((resolve) => chrome.tabs.query(info, resolve)),
      },
    };
  }
})();

/**
 * Manages the extension's popup UI and settings logic.
 * Uses Promise-based `browser.*` APIs (works natively in Firefox; via polyfill/fallback in Chrome).
 */
document.addEventListener("DOMContentLoaded", async () => {
  // UI Elements
  const toggleEnabled = document.getElementById("toggleEnabled");
  const globalKeepLastInput = document.getElementById("globalKeepLast");
  const chatTitleEl = document.getElementById("chatTitle");
  const useGlobalCheckbox = document.getElementById("useGlobal");
  const chatSpecificControls = document.getElementById("chatSpecificControls");
  const chatEnabledCheckbox = document.getElementById("chatEnabled");
  const chatKeepLastInput = document.getElementById("chatKeepLast");
  const chatKeepLastLabel = document.getElementById("chatKeepLastLabel");
  const chatSpecificSettingsDiv = document.getElementById("chatSpecificSettings");
  const notOnChatPageDiv = document.getElementById("notOnChatPage");

  let currentChatId = null;
  let globalSettings = { enabled: true, keepLast: 5 };

  // Extract the ChatGPT chat ID from a tab URL.
  function getChatIdFromUrl(url) {
    const match = url.match(/chat(?:gpt)?.com\/(?:g\/[a-zA-Z0-9-]+\/)?(c|chat)\/([a-zA-Z0-9-]+)/);
    return match ? match[2] : null; 
  }

  // Enable/disable chat-specific controls based on UI state.
  function updateChatControlsState() {
    const useGlobal = useGlobalCheckbox.checked;
    const chatEnabled = chatEnabledCheckbox.checked;
    chatSpecificControls.style.display = useGlobal ? "none" : "block";
    chatKeepLastInput.disabled = !chatEnabled;
    chatKeepLastLabel.style.color = !chatEnabled ? "#aaa" : "inherit";
  }

  // --- Main Initialization ---
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.url) return;

  currentChatId = getChatIdFromUrl(tab.url);

  // Show the correct UI section based on whether we're on a chat page
  if (currentChatId) {
    chatTitleEl.textContent = tab.title || "Current Chat";
    chatSpecificSettingsDiv.style.display = "block";
    notOnChatPageDiv.style.display = "none";
  } else {
    chatSpecificSettingsDiv.style.display = "none";
    notOnChatPageDiv.style.display = "block";
  }

  // Load settings and update the UI
  const res = await browser.storage.sync.get(["enabled", "globalKeepLast", "chats"]);
  globalSettings.enabled = res.enabled ?? true;
  globalSettings.keepLast = res.globalKeepLast ?? 5;

  toggleEnabled.checked = globalSettings.enabled;
  globalKeepLastInput.value = globalSettings.keepLast;

  if (currentChatId) {
    const chats = res.chats || {};
    const chatSetting = chats[currentChatId];

    if (chatSetting === undefined) {
      // This chat uses the global setting
      useGlobalCheckbox.checked = true;
    } else {
      // This chat has a specific setting
      useGlobalCheckbox.checked = false;
      if (typeof chatSetting === "object" && chatSetting !== null) {
        chatEnabledCheckbox.checked = chatSetting.enabled ?? true;
        chatKeepLastInput.value = chatSetting.keepLast ?? globalSettings.keepLast;
      } else {
        // Backward compatibility for number format
        chatEnabledCheckbox.checked = true;
        chatKeepLastInput.value = chatSetting;
      }
    }
  }
  updateChatControlsState();

  // --- Event Listeners ---

  toggleEnabled.addEventListener("change", () => {
    browser.storage.sync.set({ enabled: toggleEnabled.checked });
  });

  globalKeepLastInput.addEventListener("input", () => {
    const val = parseInt(globalKeepLastInput.value, 10);
    if (!isNaN(val) && val > 0) {
      globalSettings.keepLast = val; // Update local cache
      browser.storage.sync.set({ globalKeepLast: val });
    }
  });

  useGlobalCheckbox.addEventListener("change", async () => {
    if (!currentChatId) return;
    updateChatControlsState();

    const { chats: existing } = await browser.storage.sync.get(["chats"]);
    const chats = existing || {};

    if (useGlobalCheckbox.checked) {
      // Use global -> remove chat-specific
      delete chats[currentChatId];
    } else {
      // Create chat-specific with current globals
      chats[currentChatId] = {
        enabled: globalSettings.enabled,
        keepLast: globalSettings.keepLast
      };
      // Reflect new defaults
      chatEnabledCheckbox.checked = chats[currentChatId].enabled;
      chatKeepLastInput.value = chats[currentChatId].keepLast;
      updateChatControlsState();
    }
    await browser.storage.sync.set({ chats });
  });

  chatEnabledCheckbox.addEventListener("change", async () => {
    if (!currentChatId || useGlobalCheckbox.checked) return;
    updateChatControlsState();

    const isEnabled = chatEnabledCheckbox.checked;
    const { chats: existing } = await browser.storage.sync.get("chats");
    const chats = existing || {};
    let chatSetting = chats[currentChatId];

    if (typeof chatSetting !== "object" || chatSetting === null) {
      chatSetting = {
        keepLast: (typeof chatSetting === "number") ? chatSetting : globalSettings.keepLast,
        enabled: isEnabled
      };
    } else {
      chatSetting.enabled = isEnabled;
    }
    chats[currentChatId] = chatSetting;
    await browser.storage.sync.set({ chats });
  });

  chatKeepLastInput.addEventListener("input", async () => {
    if (!currentChatId || useGlobalCheckbox.checked || !chatEnabledCheckbox.checked) return;
    const val = parseInt(chatKeepLastInput.value, 10);
    if (!isNaN(val) && val > 0) {
      const { chats: existing } = await browser.storage.sync.get("chats");
      const chats = existing || {};
      let chatSetting = chats[currentChatId];

      if (typeof chatSetting !== "object" || chatSetting === null) {
        chatSetting = { keepLast: val, enabled: true };
      } else {
        chatSetting.keepLast = val;
      }
      chats[currentChatId] = chatSetting;
      await browser.storage.sync.set({ chats });
    }
  });
});
/**
 * Manages the extension's popup UI and settings logic.
 */
document.addEventListener("DOMContentLoaded", () => {
  // UI Elements
  const toggleEnabled = document.getElementById("toggleEnabled");
  const globalKeepLastInput = document.getElementById("globalKeepLast");
  const chatTitleEl = document.getElementById("chatTitle");
  const useGlobalCheckbox = document.getElementById("useGlobal");
  const chatSpecificControls = document.getElementById("chatSpecificControls");
  const chatEnabledCheckbox = document.getElementById("chatEnabled");
  const chatKeepLastInput = document.getElementById("chatKeepLast");
  const chatKeepLastLabel = document.getElementById("chatKeepLastLabel");
  const chatSpecificSettingsDiv = document.getElementById(
    "chatSpecificSettings",
  );
  const notOnChatPageDiv = document.getElementById("notOnChatPage");

  let currentChatId = null;
  let globalSettings = { enabled: true, keepLast: 5 };

  /**
   * Extracts the ChatGPT chat ID from a given URL.
   * @param {string} url The URL of the current tab.
   * @returns {string|null} The chat ID or null if not found.
   */
  function getChatIdFromUrl(url) {
    const match = url.match(/chat(?:gpt)?.com\/(?:g\/[a-zA-Z0-9-]+\/)?(c|chat)\/([a-zA-Z0-9-]+)/);
    return match ? match[2] : null; 
  }

  /**
   * Manages the enabled/disabled state of all chat-specific controls based on UI state.
   */
  function updateChatControlsState() {
    const useGlobal = useGlobalCheckbox.checked;
    const chatEnabled = chatEnabledCheckbox.checked;

    chatSpecificControls.style.display = useGlobal ? "none" : "block";
    chatKeepLastInput.disabled = !chatEnabled;
    chatKeepLastLabel.style.color = !chatEnabled ? "#aaa" : "inherit";
  }

  // --- Main Initialization ---
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
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

    // Load all settings from storage and update the UI
    chrome.storage.sync.get(["enabled", "globalKeepLast", "chats"], (res) => {
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
          // Handle new object format and old number format
          if (typeof chatSetting === 'object' && chatSetting !== null) {
            chatEnabledCheckbox.checked = chatSetting.enabled ?? true;
            chatKeepLastInput.value = chatSetting.keepLast ?? globalSettings.keepLast;
          } else { // Backward compatibility for number format
            chatEnabledCheckbox.checked = true; // Assume enabled for old format
            chatKeepLastInput.value = chatSetting;
          }
        }
      }
      updateChatControlsState(); // Set initial state of chat controls
    });
  });

  // --- Event Listeners ---

  toggleEnabled.addEventListener("change", () => {
    chrome.storage.sync.set({ enabled: toggleEnabled.checked });
  });

  globalKeepLastInput.addEventListener("input", () => {
    const val = parseInt(globalKeepLastInput.value);
    if (!isNaN(val) && val > 0) {
      globalSettings.keepLast = val; // Update local cache
      chrome.storage.sync.set({ globalKeepLast: val });
    }
  });

  useGlobalCheckbox.addEventListener("change", () => {
    if (!currentChatId) return;
    updateChatControlsState();

    chrome.storage.sync.get(["chats"], (res) => {
      const chats = res.chats || {};
      if (useGlobalCheckbox.checked) {
        // User wants to use global setting, so remove the specific one
        delete chats[currentChatId];
      } else {
        // User wants a specific setting, so create one defaulting to global values
        chats[currentChatId] = {
          enabled: globalSettings.enabled,
          keepLast: globalSettings.keepLast,
        };
        // Update UI to reflect these new defaults
        chatEnabledCheckbox.checked = chats[currentChatId].enabled;
        chatKeepLastInput.value = chats[currentChatId].keepLast;
        updateChatControlsState(); // Re-check state
      }
      chrome.storage.sync.set({ chats });
    });
  });

  chatEnabledCheckbox.addEventListener("change", () => {
    if (!currentChatId || useGlobalCheckbox.checked) return;
    updateChatControlsState();

    const isEnabled = chatEnabledCheckbox.checked;
    chrome.storage.sync.get("chats", (res) => {
      const chats = res.chats || {};
      let chatSetting = chats[currentChatId];

      if (typeof chatSetting !== 'object' || chatSetting === null) {
        chatSetting = {
          keepLast: (typeof chatSetting === 'number') ? chatSetting : globalSettings.keepLast,
          enabled: isEnabled,
        };
      } else {
        chatSetting.enabled = isEnabled;
      }
      chats[currentChatId] = chatSetting;
      chrome.storage.sync.set({ chats });
    });
  });

  chatKeepLastInput.addEventListener("input", () => {
    if (!currentChatId || useGlobalCheckbox.checked || !chatEnabledCheckbox.checked) return;
    const val = parseInt(chatKeepLastInput.value);
    if (!isNaN(val) && val > 0) {
      chrome.storage.sync.get("chats", (res) => {
        const chats = res.chats || {};
        let chatSetting = chats[currentChatId];

        if (typeof chatSetting !== 'object' || chatSetting === null) {
          chatSetting = { keepLast: val, enabled: true };
        } else {
          chatSetting.keepLast = val;
        }
        chats[currentChatId] = chatSetting;
        chrome.storage.sync.set({ chats });
      });
    }
  });
});
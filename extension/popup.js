/**
 * Manages the extension's popup UI and settings logic.
 */
document.addEventListener("DOMContentLoaded", () => {
  // UI Elements
  const toggleEnabled = document.getElementById("toggleEnabled");
  const globalKeepLastInput = document.getElementById("globalKeepLast");
  const chatTitleEl = document.getElementById("chatTitle");
  const useGlobalCheckbox = document.getElementById("useGlobal");
  const chatKeepLastInput = document.getElementById("chatKeepLast");
  const chatKeepLastLabel = document.getElementById("chatKeepLastLabel");
  const chatSpecificSettingsDiv = document.getElementById(
    "chatSpecificSettings",
  );
  const notOnChatPageDiv = document.getElementById("notOnChatPage");

  let currentChatId = null;

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
   * Toggles the disabled state and visual style of the per-chat input.
   * @param {boolean} isDisabled Whether the input should be disabled.
   */
  function setChatInputDisabled(isDisabled) {
    chatKeepLastInput.disabled = isDisabled;
    chatKeepLastLabel.style.color = isDisabled ? "#aaa" : "inherit";
  }

  // Initialize UI based on storage and current tab
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

    // Load all settings from storage
    chrome.storage.sync.get(["enabled", "globalKeepLast", "chats"], (res) => {
      toggleEnabled.checked = res.enabled ?? true;
      globalKeepLastInput.value = res.globalKeepLast ?? 5;

      if (currentChatId) {
        const chats = res.chats || {};
        const chatSetting = chats[currentChatId];

        if (chatSetting === undefined) {
          // This chat uses the global setting
          useGlobalCheckbox.checked = true;
          chatKeepLastInput.value = res.globalKeepLast ?? 5;
          setChatInputDisabled(true);
        } else {
          // This chat has a specific setting
          useGlobalCheckbox.checked = false;
          chatKeepLastInput.value = chatSetting;
          setChatInputDisabled(false);
        }
      }
    });
  });

  // --- Event Listeners ---

  toggleEnabled.addEventListener("change", () => {
    chrome.storage.sync.set({ enabled: toggleEnabled.checked });
  });

  globalKeepLastInput.addEventListener("input", () => {
    const val = parseInt(globalKeepLastInput.value);
    if (!isNaN(val) && val > 0) {
      chrome.storage.sync.set({ globalKeepLast: val });
      // If current chat uses global, update its input value visually
      if (useGlobalCheckbox.checked) {
        chatKeepLastInput.value = val;
      }
    }
  });

  useGlobalCheckbox.addEventListener("change", () => {
    if (!currentChatId) return;

    setChatInputDisabled(useGlobalCheckbox.checked);

    chrome.storage.sync.get(["chats", "globalKeepLast"], (res) => {
      const chats = res.chats || {};
      if (useGlobalCheckbox.checked) {
        // User wants to use global setting, so remove the specific one
        delete chats[currentChatId];
        chatKeepLastInput.value = res.globalKeepLast ?? 5;
      } else {
        // User wants a specific setting, so create one defaulting to the global value
        const globalVal = res.globalKeepLast ?? 5;
        chats[currentChatId] = globalVal;
        chatKeepLastInput.value = globalVal;
      }
      chrome.storage.sync.set({ chats });
    });
  });

  chatKeepLastInput.addEventListener("input", () => {
    if (!currentChatId || useGlobalCheckbox.checked) return;

    const val = parseInt(chatKeepLastInput.value);
    if (!isNaN(val) && val > 0) {
      chrome.storage.sync.get("chats", (res) => {
        const chats = res.chats || {};
        chats[currentChatId] = val;
        chrome.storage.sync.set({ chats });
      });
    }
  });
});

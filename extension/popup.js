/**
 * Manages the extension's popup UI and settings logic.
 * uses async/await in event listeners to ensure storage operations complete.
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

  /**
   * Extracts the ChatGPT chat ID from a given URL.
   * @param {string} url The URL of the current tab.
   * @returns {string|null} The chat ID or null if not found.
   */
  function getChatIdFromUrl(url) {
    if (!url) return null; // Add a check for undefined URL
    const match = url.match(/chat(?:gpt)?.com\/(?:c|chat)\/([a-zA-Z0-9-]+)/);
    return match ? match[1] : null;
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
  async function initializePopup() {
    try {
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      const tab = tabs[0];

      if (!tab || !tab.url) {
        // This handles cases where the tab isn't fully loaded or accessible
        notOnChatPageDiv.style.display = "block";
        chatSpecificSettingsDiv.style.display = "none";
        return;
      }

      currentChatId = getChatIdFromUrl(tab.url);

      // Fetch settings from storage with default values
      const data = await browser.storage.sync.get({
        enabled: true,
        globalKeepLast: 5,
        chats: {},
      });

      // Populate global settings
      toggleEnabled.checked = data.enabled;
      globalKeepLastInput.value = data.globalKeepLast;

      // Determine which UI to show
      if (currentChatId) {
        chatTitleEl.textContent = tab.title || "Current Chat";
        chatSpecificSettingsDiv.style.display = "block";
        notOnChatPageDiv.style.display = "none";

        const chatSetting = data.chats[currentChatId];

        if (chatSetting === undefined) {
          useGlobalCheckbox.checked = true;
        } else {
          useGlobalCheckbox.checked = false;
          if (typeof chatSetting === "object" && chatSetting !== null) {
            chatEnabledCheckbox.checked = chatSetting.enabled ?? true;
            chatKeepLastInput.value =
              chatSetting.keepLast ?? data.globalKeepLast;
          } else {
            // Backward compatibility for old number format
            chatEnabledCheckbox.checked = true;
            chatKeepLastInput.value = chatSetting;
          }
        }
      } else {
        chatSpecificSettingsDiv.style.display = "none";
        notOnChatPageDiv.style.display = "block";
      }

      updateChatControlsState();
    } catch (error) {
      console.error("Gippity Pruner Error:", error);
      notOnChatPageDiv.innerHTML =
        "<p>An error occurred. Please reload the tab and try again.</p>";
      notOnChatPageDiv.style.display = "block";
      chatSpecificSettingsDiv.style.display = "none";
    }
  }

  // --- Event Listeners (Updated with async/await) ---

  toggleEnabled.addEventListener("change", async () => {
    await browser.storage.sync.set({ enabled: toggleEnabled.checked });
  });

  globalKeepLastInput.addEventListener("input", async () => {
    const val = parseInt(globalKeepLastInput.value);
    if (!isNaN(val) && val > 0) {
      await browser.storage.sync.set({ globalKeepLast: val });
    }
  });

  useGlobalCheckbox.addEventListener("change", async () => {
    if (!currentChatId) return;

    const data = await browser.storage.sync.get([
      "chats",
      "globalKeepLast",
      "enabled",
    ]);
    const chats = data.chats || {};

    if (useGlobalCheckbox.checked) {
      delete chats[currentChatId];
    } else {
      // When unchecking "Use global", create a specific setting based on current global values
      chats[currentChatId] = {
        enabled: data.enabled ?? true,
        keepLast: data.globalKeepLast ?? 5,
      };
      chatEnabledCheckbox.checked = chats[currentChatId].enabled;
      chatKeepLastInput.value = chats[currentChatId].keepLast;
    }
    await browser.storage.sync.set({ chats });
    updateChatControlsState();
  });

  chatEnabledCheckbox.addEventListener("change", async () => {
    if (!currentChatId || useGlobalCheckbox.checked) return;

    const { chats = {} } = await browser.storage.sync.get("chats");
    if (chats[currentChatId]) {
      chats[currentChatId].enabled = chatEnabledCheckbox.checked;
      await browser.storage.sync.set({ chats });
    }
    updateChatControlsState();
  });

  chatKeepLastInput.addEventListener("input", async () => {
    if (
      !currentChatId ||
      useGlobalCheckbox.checked ||
      !chatEnabledCheckbox.checked
    )
      return;

    const val = parseInt(chatKeepLastInput.value);
    if (!isNaN(val) && val > 0) {
      const { chats = {} } = await browser.storage.sync.get("chats");
      if (chats[currentChatId]) {
        chats[currentChatId].keepLast = val;
        await browser.storage.sync.set({ chats });
      }
    }
  });

  // Start the popup logic
  initializePopup();
});


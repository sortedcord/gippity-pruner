const toggle = document.getElementById("toggleEnabled");
const keepLastInput = document.getElementById("keepLast");
const chatTitle = document.getElementById("chatTitle");

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0] && tabs[0].title) {
    chatTitle.textContent = tabs[0].title;
  }
});

chrome.storage.sync.get(["enabled", "keepLast"], (res) => {
  toggle.checked = res.enabled ?? true;
  keepLastInput.value = res.keepLast ?? 5;
});

toggle.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: toggle.checked });
});

keepLastInput.addEventListener("input", () => {
  const val = parseInt(keepLastInput.value);
  if (!isNaN(val)) {
    chrome.storage.sync.set({ keepLast: val });
  }
});

const toggle = document.getElementById('toggleEnabled');
const keepLastInput = document.getElementById('keepLast');

chrome.storage.sync.get(['enabled', 'keepLast'], (res) => {
    toggle.checked = res.enabled ?? true;
    keepLastInput.value = res.keepLast ?? 5;
});

toggle.addEventListener('change', () => {
    chrome.storage.sync.set({ enabled: toggle.checked });
});

keepLastInput.addEventListener('input', () => {
    const val = parseInt(keepLastInput.value);
    if (!isNaN(val)) {
        chrome.storage.sync.set({ keepLast: val });
    }
});

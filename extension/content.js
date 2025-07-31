const MESSAGE_SELECTOR = 'article[data-turn]';
let KEEP_LAST = 5;
let enabled = true;

chrome.storage.sync.get(['enabled', 'keepLast'], (res) => {
    if (res.enabled !== undefined) enabled = res.enabled;
    if (res.keepLast !== undefined) KEEP_LAST = res.keepLast;
});

function pruneMessages() {
    if (!enabled) return;
    const messages = document.querySelectorAll(MESSAGE_SELECTOR);
    if (messages.length <= KEEP_LAST) return;

    const toDelete = Array.from(messages).slice(0, messages.length - KEEP_LAST);
    toDelete.forEach(msg => msg.remove());
    console.log(`[Pruner] Removed ${toDelete.length} messages (kept ${KEEP_LAST})`);
}

setInterval(pruneMessages, 3000);

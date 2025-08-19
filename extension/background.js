/**
 * Background script
 * - MV2 (Firefox): runs as an event page (non-persistent per manifest).
 * - MV3 (Chrome): if you add a service worker later, this file’s logic can be moved there.
 *
 * Why keep it?
 * - Central place to add future logic (alarms, contextMenus, dynamic injection).
 * - Useful for message passing between popup/content if needed later.
 *
 * Cross-browser note:
 * - We rely on vendor/browser-polyfill.min.js (loaded by manifest) to provide `browser` in Chrome.
 * - As a guard, add the same tiny bootstrap here in case polyfill fails to load.
 */

/* BOOTSTRAP (defensive): define `browser` from `chrome` if polyfill didn't load */
(() => {
  const g = globalThis;
  if (!g.browser && typeof g.chrome !== 'undefined') {
    g.browser = {
      runtime: chrome.runtime,
      // Add APIs here as you adopt them (alarms, action, etc.)
      storage: {
        sync: {
          get: (keys) => new Promise((resolve) => chrome.storage.sync.get(keys, resolve)),
          set: (obj)  => new Promise((resolve) => chrome.storage.sync.set(obj, resolve)),
        },
      },
    };
  }
})();

/** Example: react to install/update events (noop today, handy for telemetry/migrations) */
browser.runtime?.onInstalled?.addListener?.((details) => {
  // e.g., set defaults on fresh install
  if (details.reason === 'install') {
    browser.storage?.sync?.set?.({ enabled: true, globalKeepLast: 5 });
  }
});
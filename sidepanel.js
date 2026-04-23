// sidepanel.js
document.addEventListener("DOMContentLoaded", () => {
  // Boot all shared logic (scan, download, filters, carousel, etc.)
  // 'true' means we turn ON the side-panel exclusive features (like the tab-change detector)
  window.initKatFetch(true);
});

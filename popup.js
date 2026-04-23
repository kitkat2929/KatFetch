// popup.js
document.addEventListener("DOMContentLoaded", () => {
  // Boot all shared logic (scan, download, filters, carousel, etc.)
  // 'false' means we do NOT turn on side-panel exclusive features (like the tab-change detector)
  window.initKatFetch(false);
});

// shared.js — KatFetch v1.0 Unified Engine.

window.initKatFetch = function (isSidePanel) {
  // ════════════════════════════════════════════════════════════════════════
  // MODULE: Toast Notifications
  // ════════════════════════════════════════════════════════════════════════
  window.showToast = function(message, type = "info", duration = 3000) {
    let container = document.getElementById("toastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      document.body.appendChild(container);
    }

    //  Check if this exact message is already showing
    let existingToast = Array.from(container.children).find(t => t.textContent === message);

    if (existingToast) {
      // Flashes the existing toast instead of spawning a new one
      existingToast.style.transform = "scale(1.05)";
      existingToast.style.filter = "brightness(1.5)";

      setTimeout(() => {
        existingToast.style.transform = "translateY(0) scale(1)";
        existingToast.style.filter = "brightness(1)";
      }, 150);

      // Reset its death timer so it stays on screen longer
      clearTimeout(existingToast.removeTimeout);
      existingToast.removeTimeout = setTimeout(() => {
        existingToast.style.opacity = "0";
        existingToast.style.transform = "translateY(15px)";
        setTimeout(() => existingToast.remove(), 300);
      }, duration);
      return;
    }

    // Limit to 3 unique toasts
    while (container.children.length >= 3) {
      container.removeChild(container.firstChild);
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    toast.removeTimeout = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(15px)";
      setTimeout(() => toast.remove(), 300);
    }, duration);
  };

  // ════════════════════════════════════════════════════════════════════════
  // MODULE: Settings & Advanced UI Toggle (Dynamic Smart Defaults)
  // ════════════════════════════════════════════════════════════════════════

  // 1. Reusable function to fetch and update the naming rule (Added 'force' parameter)
  window.refreshNamingRule = async function(force = false) {
    const templateInputEl = document.getElementById("filenameTemplate");
    if (!templateInputEl) return;

    // Only abort if we are NOT forcing an update, and the user is typing
    if (!force && document.activeElement === templateInputEl) return;

    const res = await chrome.storage.local.get("filenameTemplate");

    if (res.filenameTemplate) {
      templateInputEl.value = res.filenameTemplate;
    } else {
      let activeDomain = "kat";
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url) activeDomain = new URL(tab.url).hostname.replace("www.", "").replace(/\./g, "_");
      } catch {}

      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
      const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

      templateInputEl.value = `${activeDomain}_${dateStr}_${timeStr}_{index}.{ext}`;
    }
  };

  //  Restore state on load
  chrome.storage.local.get(["zipMode", "advancedOpen"], (res) => {
    const zipToggleEl = document.getElementById("zipToggle");
    if (zipToggleEl && res.zipMode !== undefined) zipToggleEl.checked = res.zipMode;

    window.refreshNamingRule(true);

    const advSettings = document.getElementById("advancedSettings");
    const advBtn = document.getElementById("toggleAdvancedBtn");
    if (advSettings && advBtn && res.advancedOpen) {
      advSettings.classList.add("open");
      advBtn.classList.add("active");
    }
  });

  const zipToggle = document.getElementById("zipToggle");
  if (zipToggle) {
    // Standard mouse click / spacebar listener
    zipToggle.addEventListener("change", (e) => {
      chrome.storage.local.set({ zipMode: e.target.checked });
    });

    // Teach the ZIP toggle to obey the Enter key!
    zipToggle.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        zipToggle.click();
      }
    });
  }

  const templateInput = document.getElementById("filenameTemplate");
  if (templateInput) {
    templateInput.addEventListener("change", (e) => {
      const val = e.target.value.trim();
      if (val === "") {
        // Pass 'true' to force the UI to update immediately when cleared
        chrome.storage.local.remove("filenameTemplate", () => window.refreshNamingRule(true));
      } else {
        chrome.storage.local.set({ filenameTemplate: val });
      }
    });
  }

  const resetNameBtn = document.getElementById("resetNameBtn");
  if (resetNameBtn) {
    resetNameBtn.addEventListener("click", () => {
      chrome.storage.local.remove("filenameTemplate", () => {
        // Pass 'true' to instantly update the box when the button is clicked
        window.refreshNamingRule(true);
        window.showToast("Naming rule reset to automatic! 🐾", "success", 2000);
      });
    });
  }

  //  Toggle button listener
  const advBtn = document.getElementById("toggleAdvancedBtn");
  if (advBtn) {
    advBtn.addEventListener("click", () => {
      const advSettings = document.getElementById("advancedSettings");
      if (!advSettings) return;
      const isOpen = advSettings.classList.contains("open");

      advSettings.classList.toggle("open");
      advBtn.classList.toggle("active", !isOpen);
      chrome.storage.local.set({ advancedOpen: !isOpen });
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // MODULE: Thumbnail Size Control (Premium Slider)
  // ════════════════════════════════════════════════════════════════════════
  const gridSlider = document.getElementById("gridSizeSlider");
  const gridLabel = document.getElementById("gridSizeLabel");
  const resultsDiv = document.getElementById("results");

  function applyGridSize(val) {
    if (!resultsDiv) return;
    const sizeLevel = parseInt(val);
    let cols, labelTxt;

    // Responsive logic: The SidePanel is wider, so it can hold more columns than the Popup
    if (isSidePanel) {
      const columnsMap = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6 };
      cols = columnsMap[sizeLevel];
    } else {
      const columnsMap = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };
      cols = columnsMap[sizeLevel];
    }

    const labels = { 1: "Huge", 2: "Large", 3: "Medium", 4: "Small", 5: "Tiny" };
    labelTxt = labels[sizeLevel];

    // Force the CSS Grid to instantly snap to the new column count
    resultsDiv.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    if (gridLabel) gridLabel.textContent = labelTxt;
  }

  if (gridSlider) {
    // 1. Load saved state on boot
    chrome.storage.local.get("gridSize", (res) => {
      const saved = res.gridSize || 3; // Default to '3' (Medium)
      gridSlider.value = saved;
      applyGridSize(saved);
    });

    // 2. Buttery smooth live updates while dragging
    gridSlider.addEventListener("input", (e) => applyGridSize(e.target.value));

    // 3. Save to memory only when they release the mouse
    gridSlider.addEventListener("change", (e) => chrome.storage.local.set({ gridSize: e.target.value }));
  }

  if (!isSidePanel) {
    const sidePanelBtn = document.getElementById("openSidePanel");
    if (sidePanelBtn) {
      sidePanelBtn.addEventListener("click", async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.sidePanel.open({ windowId: tab.windowId });
        window.close();
      });
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // MODULE: Stats
  // ════════════════════════════════════════════════════════════════════════


  const openStatsBtn = document.getElementById("openStats");
  if (openStatsBtn) {
    openStatsBtn.addEventListener("click", () => {
      const bar = document.getElementById("statsBar");
      if (bar) {
        const isVisible = bar.classList.contains("visible");
        bar.classList.toggle("visible");
        if (!isVisible) loadStats(); // Only load when opening
      }
    });
  }


  function loadStats() {
    chrome.runtime.sendMessage({ type: "GET_STATS" }, (res) => {
      if (!res) return;
      const statDl = document.getElementById("statDl");
      const statFail = document.getElementById("statFail");
      const statZip = document.getElementById("statZip");
      if (statDl) statDl.textContent = res.downloaded || 0;
      if (statFail) statFail.textContent = res.failed || 0;
      if (statZip) statZip.textContent = res.zipsCreated || 0;
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // MODULE: Progress Bar & UI State Recovery
  // ════════════════════════════════════════════════════════════════════════
  // When the popup opens, ask the background if a download is running!
  chrome.runtime.sendMessage({ type: "GET_DL_STATE" }, (state) => {
    if (state) {
      const dlProg = document.getElementById("dlProgress");
      const statusDiv = document.getElementById("status");

      if (dlProg && statusDiv) {
        dlProg.style.display = "block";
        if (state.phase === "downloading") {
          dlProg.max = state.total;
          dlProg.value = state.current;
          statusDiv.textContent = `Downloading: ${state.current} / ${state.total}...`;
        } else {
          dlProg.removeAttribute("value");
          statusDiv.textContent = "Compressing ZIP... almost done";
        }
      }
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    const statusDiv = document.getElementById("status");
    const bar = document.getElementById("dlProgress");
    if (!statusDiv || !bar) return;
    if (msg.type === "PROGRESS") {
      bar.style.display = "block";
      bar.max = msg.total;
      bar.value = msg.current;
      statusDiv.textContent = `Downloading: ${msg.current} / ${msg.total}...`;
    } else if (msg.type === "PROGRESS_ZIPPING") {
      bar.removeAttribute("value");
      statusDiv.textContent = "Compressing ZIP... almost done";
    }

    // Remote UI controls for the Background Queue
    if (msg.type === "TOAST") {
      window.showToast(msg.message, msg.style || "info", 5000);
    }
    if (msg.type === "HIDE_PROGRESS") {
      if (bar) bar.style.display = "none";
      if (statusDiv) statusDiv.textContent = `Showing ${currentViewData.length} items.`;
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // MODULE: State
  // ════════════════════════════════════════════════════════════════════════
  let globalImageData = [];
  let currentViewData = [];
  const PAGE_SIZE = 50;
  let currentPage = 1;
  let lastCheckedUrl = null;

  function updateImageCountBadge() {
    const badge = document.getElementById("imageCount");
    if (!badge) return;
    if (globalImageData.length > 0) {
      badge.style.display = "inline";
      badge.textContent = `${globalImageData.length} images`;
    } else {
      badge.style.display = "none";
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // MODULE: Selection Engine (Premium Merged)
  // ════════════════════════════════════════════════════════════════════════
  function updateFloatingToolbar() {
    // Count from globalImageData so page-2+ selections not yet rendered are included
    const selectedCount = globalImageData.filter(d => d.selected).length;
    const hasSelection = selectedCount > 0;

    // Toggle body class for the slide-up animation
    document.body.classList.toggle('has-selection', hasSelection);

    const downloadBtn = document.getElementById("downloadSelectedBtn");
    const copyBtn = document.getElementById("copySelectedBtn");
    const masterSelect = document.getElementById("masterSelect");

    if (masterSelect) {
      // The Master Checkbox must ONLY look at the current filtered view!
      const localTotal = currentViewData.length;
      const localSelected = currentViewData.filter(d => d.selected).length;

      masterSelect.checked = localTotal > 0 && localSelected === localTotal;
      masterSelect.indeterminate = localSelected > 0 && localSelected < localTotal;
    }

    if (downloadBtn) {
      downloadBtn.style.display = hasSelection ? "block" : "none";
      downloadBtn.textContent = hasSelection ? `Download ${selectedCount} Selected` : "Download Selected";
    }

    if (copyBtn) {
      copyBtn.style.display = hasSelection ? "block" : "none";
      copyBtn.textContent = selectedCount === 1 ? "📋 Copy Image" : `📋 Copy ${selectedCount} Links`;
    }
  }

  // Preserve your Shift-Click listener verbatim from shared.js
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!target?.classList.contains("img-select")) return;
    const currentUrl = target.dataset.url;
    const isChecked = target.checked;

    if (e.shiftKey && lastCheckedUrl) {
      let start = currentViewData.findIndex(d => d.downloadUrl === lastCheckedUrl);
      let end = currentViewData.findIndex(d => d.downloadUrl === currentUrl);
      if (start !== -1 && end !== -1) {
        const min = Math.min(start, end), max = Math.max(start, end);
        for (let i = min; i <= max; i++) currentViewData[i].selected = isChecked;
        document.querySelectorAll(".img-select").forEach(chk => {
          const data = currentViewData.find(d => d.downloadUrl === chk.dataset.url);
          if (data) chk.checked = data.selected;
        });
      }
    } else {
      const data = globalImageData.find(img => img.downloadUrl === currentUrl);
      if (data) data.selected = isChecked;
    }
    lastCheckedUrl = currentUrl;
    updateFloatingToolbar(); // 👈 Call the new Premium UI controller
  });


  // ════════════════════════════════════════════════════════════════════════
  // MODULE: Carousel
  // ════════════════════════════════════════════════════════════════════════
  let carouselImages = [];
  let carouselIndex = 0;
  let isZoomed = false;

  // A single, reusable background preloader
  const singletonPreloader = new Image();
  const hdLoader = new Image();

  function openCarousel(index) {
    // Lock the background and hide floating buttons
    document.body.classList.add("modal-open");
    const modal = document.getElementById("previewModal");
    const modalImg = document.getElementById("modalImg");
    const badge = document.getElementById("modalResBadge");
    if (!modal || !modalImg) return;

    if (index < 0) index = carouselImages.length - 1;
    if (index >= carouselImages.length) index = 0;
    carouselIndex = index;

    // Reset Zoom State safely
    isZoomed = false;
    modalImg.style.cursor = "zoom-in";
    modalImg.style.transformOrigin = "center center";

    const cur = carouselImages[carouselIndex];

    if (badge) {
      if (cur.width && cur.height) {
        badge.textContent = `${cur.width} × ${cur.height} ${cur.isHiRes ? '✨' : ''}`;
      } else {
        badge.textContent = "Original Quality";
      }
    }

    // THE GHOST-KILLING PREMIUM ANIMATION
    modalImg.style.transition = "none";
    modalImg.removeAttribute("src");
    modalImg.style.opacity = "0.3";
    modalImg.style.transform = "scale(0.92)";

    setTimeout(() => {
      modalImg.style.transition = "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease";
    }, 10);

    modalImg.src = cur.thumbUrl;

    if (modal.style.display !== "flex") {
      setTimeout(() => {
        const focusTarget = document.getElementById("modalNext");
        if (focusTarget) focusTarget.focus({ preventScroll: true });
      }, 10);
    }
    modal.style.display = "flex";

    // ─── THE NEW ARCHITECTURE: GIF FAST-PATH ───
    if (cur.thumbUrl === cur.downloadUrl) {
      // If thumb is the real file, don't re-download it! Just make it visible.
      modalImg.style.opacity = "1";
      if (!isZoomed) modalImg.style.transform = "scale(1)";
      scheduleNextPrefetch(); // Fire the singleton next-image preloader
      return;
    }

    // ─── THE NEW ARCHITECTURE: OFF-THREAD DECODING ───
    hdLoader.onload = null;
    hdLoader.onerror = null;

    //  Graceful degradation if the HD link is dead or blocks hotlinking
    hdLoader.onerror = () => {
      // Guard: Did user navigate away?
      if (modal.style.display !== "flex" || carouselImages[carouselIndex].downloadUrl !== cur.downloadUrl) return;

      // Fall back to the cached thumbnail instantly so the UI never freezes!
      modalImg.src = cur.thumbUrl;
      modalImg.style.opacity = "1";
      if (!isZoomed) modalImg.style.transform = "scale(1)";
    };

    hdLoader.onload = async () => {
      // Guard: Did user navigate away while downloading?
      if (modal.style.display !== "flex" || carouselImages[carouselIndex].downloadUrl !== cur.downloadUrl) return;

      try {
        // Force the browser to decode the bitmap OFF the main thread.
        // This completely eliminates the micro-stutter when HD replaces the thumbnail!
        await hdLoader.decode();
      } catch {} // Ignore mid-decode aborts

      // Final guard after the async gap
      if (modal.style.display !== "flex" || carouselImages[carouselIndex].downloadUrl !== cur.downloadUrl) return;

      modalImg.src = cur.downloadUrl;
      modalImg.style.opacity = "1";
      if (!isZoomed) modalImg.style.transform = "scale(1)";
    };

    // fetchPriority "high" tells Chrome to prioritize this HD image over background scripts
    hdLoader.fetchPriority = "high";
    hdLoader.src = cur.downloadUrl;

    scheduleNextPrefetch();
  }

  // Abstracted the singleton preloader for cleaner code
  function scheduleNextPrefetch() {
    const nextIndex = (carouselIndex + 1 >= carouselImages.length) ? 0 : carouselIndex + 1;
    const nextUrl = carouselImages[nextIndex]?.downloadUrl;
    if (!nextUrl) return;

    singletonPreloader.onload = null;
    singletonPreloader.onerror = null;

    const clearMemory = () => { singletonPreloader.removeAttribute("src"); };
    singletonPreloader.onload = clearMemory;
    singletonPreloader.onerror = clearMemory;

    // fetchPriority "low" ensures the background prefetch never slows down the current HD load
    singletonPreloader.fetchPriority = "low";
    singletonPreloader.src = nextUrl;
  }

  // The reusable, buttery-smooth close function
  function closePreview() {
    isZoomed = false; // Reset zoom state on close
    const modal = document.getElementById("previewModal");

    // Unlock the background and restore floating buttons
    document.body.classList.remove("modal-open");

    //  Prevent mouse/keyboard interaction while fading
    // This stops rogue Tab keys from getting trapped in the invisible modal
    modal.style.pointerEvents = "none";

    // NEW:
    // Trigger a CSS fade-out transition
    modal.style.transition = "opacity 0.2s ease";
    modal.style.opacity = "0";

    // Wait for the 200ms fade to finish before touching the DOM.
    // Synchronous renderImages calls during an active CSS transition cause layout
    // thrashing and a visible stutter on low-end devices (Bug 4-E fix).
    setTimeout(() => {
      // Append any pages the carousel navigated past that haven't rendered yet
      while (carouselIndex >= currentPage * PAGE_SIZE) {
        currentPage++;
        renderImages(currentViewData, true);
      }

      // Identify the card to scroll back to
      let targetImg = null;
      if (carouselImages.length > 0 && carouselIndex >= 0) {
        const currentUrl = carouselImages[carouselIndex].downloadUrl;
        const targetCheckbox = Array.from(document.querySelectorAll(".img-select"))
          .find(chk => chk.dataset.url === currentUrl);
        if (targetCheckbox) {
          targetImg = targetCheckbox.parentElement.querySelector("img");
        }
      }

      modal.style.display = "none";
      modal.style.opacity = "1";
      modal.style.transition = "";
      modal.style.pointerEvents = "auto";

      if (targetImg) {
        targetImg.scrollIntoView({ behavior: "smooth", block: "center" });
        targetImg.focus({ preventScroll: true });
      }
    }, 200);
  }

  const modalPrev = document.getElementById("modalPrev");
  const modalNext = document.getElementById("modalNext");
  const modalClose = document.getElementById("modalClose");
  const previewModal = document.getElementById("previewModal");

  if (modalPrev) modalPrev.addEventListener("click", (e) => { e.stopPropagation(); openCarousel(carouselIndex - 1); });
  if (modalNext) modalNext.addEventListener("click", (e) => { e.stopPropagation(); openCarousel(carouselIndex + 1); });

  // Wire the 'X' button to the smooth close
  if (modalClose) modalClose.addEventListener("click", closePreview);

  const modalEnlarge = document.getElementById("modalEnlarge");

  // Context-Aware Graceful Degradation
  if (modalEnlarge) {
    modalEnlarge.addEventListener("click", async (e) => {
      e.stopPropagation();
      const currentImage = carouselImages[carouselIndex];

      if (isSidePanel) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;
        chrome.tabs.sendMessage(tab.id, {
          type: "MOUNT_HOST_PLAYER",
          url: currentImage.downloadUrl
        });
      } else {
        chrome.tabs.create({ url: currentImage.downloadUrl, active: false });
      }
    });
  }

  // Listen for swipe/click commands coming BACK from the host page
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "HOST_PLAYER_NAVIGATE") {
      const newIndex = msg.direction === "next"
        ? (carouselIndex + 1 >= carouselImages.length ? 0 : carouselIndex + 1)
        : (carouselIndex - 1 < 0 ? carouselImages.length - 1 : carouselIndex - 1);

      carouselIndex = newIndex;
      const nextImage = carouselImages[carouselIndex];

      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab) chrome.tabs.sendMessage(tab.id, { type: "UPDATE_HOST_PLAYER", url: nextImage.downloadUrl });
      });
    }
  });

  // Wire the blurred background to the smooth close
  if (previewModal) {
    previewModal.addEventListener("click", (e) => {
      if (e.target.id === "previewModal") closePreview();
    });
  }

  // ─── PREMIUM MODAL FOCUS TRAP ───
  document.addEventListener("keydown", (e) => {
    // Ignore the trap if the modal is currently fading out! (opacity !== "0")
    if (previewModal && previewModal.style.display === "flex" && previewModal.style.opacity !== "0") {

      //  THE ULTIMATE OUTLINE KILLER
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault(); // Stop browser from trying to scroll

        // Command the browser to instantly drop focus from the button into the void!
        if (document.activeElement) document.activeElement.blur();

        if (e.key === "ArrowLeft") openCarousel(carouselIndex - 1);
        if (e.key === "ArrowRight") openCarousel(carouselIndex + 1);
        return; // Exit early
      }

      if (e.key === "Escape") {
        e.preventDefault();
        closePreview();
        return;
      }

      // The Enterprise Focus Trap Loop
      if (e.key === "Tab") {
        const focusableElements = Array.from(previewModal.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )).filter(el => !el.disabled && el.offsetWidth > 0);
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
        else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }
  });

  //  THE PREMIUM MOUSE WHEEL ENGINE
  let wheelThrottle = false;

  if (previewModal) {
    previewModal.addEventListener("wheel", (e) => {
      // 1. If they are zoomed in, do nothing! Let the browser scroll naturally to pan around the image.
      if (isZoomed) return;

      // 2. Prevent the default browser scroll bounce effect
      e.preventDefault();

      // 3. Throttle the wheel to prevent hyper-scrolling (1 flick = 1 image)
      if (wheelThrottle) return;
      wheelThrottle = true;
      setTimeout(() => wheelThrottle = false, 150); // 150ms cooldown between image swaps

      // 4. Map scrolling down to Next, and scrolling up to Previous
      if (e.deltaY > 0) {
        openCarousel(carouselIndex + 1);
      } else if (e.deltaY < 0) {
        openCarousel(carouselIndex - 1);
      }
    }, { passive: false }); // passive: false is strictly required to use e.preventDefault()
  }

  // THE PREMIUM SWIPE ENGINE
  let touchStartX = 0;
  let touchEndX = 0;

  if (previewModal) {
    // 1. Capture the starting X coordinate (Passive for scroll performance)
    previewModal.addEventListener("touchstart", (e) => {
      // Only track single-finger touches (ignore pinch-to-zoom)
      if (e.touches.length === 1) {
        touchStartX = e.changedTouches[0].screenX;
      }
    }, { passive: true });

    // 2. Capture the ending X coordinate
    previewModal.addEventListener("touchend", (e) => {
      // If the user is currently zoomed in, disable swiping so they can pan around freely!
      if (isZoomed) return;

      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
    }, { passive: true });
  }

  function handleSwipe() {
    const swipeThreshold = 50; // Minimum pixel distance to trigger a swipe

    if (touchEndX < touchStartX - swipeThreshold) {
      // Swiped Left -> Load Next Image
      openCarousel(carouselIndex + 1);
    }

    if (touchEndX > touchStartX + swipeThreshold) {
      // Swiped Right -> Load Previous Image
      openCarousel(carouselIndex - 1);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // THE PREMIUM ZOOM ENGINE
  // ════════════════════════════════════════════════════════════════════════
  const modalImageEl = document.getElementById("modalImg");
  if (modalImageEl) {
    // 1. Toggle Zoom on Click
    modalImageEl.addEventListener("click", (e) => {
      e.stopPropagation(); // Stop the modal from closing
      isZoomed = !isZoomed;

      if (isZoomed) {
        modalImageEl.style.cursor = "zoom-out";
        modalImageEl.style.transform = "scale(2.5)"; // 2.5x Magnification

        // Calculate exactly where the user clicked to zoom in on that specific spot
        const rect = modalImageEl.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        modalImageEl.style.transformOrigin = `${x}% ${y}%`;
      } else {
        // Zoom back out
        modalImageEl.style.cursor = "zoom-in";
        modalImageEl.style.transform = "scale(1)";
        modalImageEl.style.transformOrigin = "center center";
      }
    });

    // 2. Fluid Panning when moving the mouse
    modalImageEl.addEventListener("mousemove", (e) => {
      if (!isZoomed) return;

      // Calculate mouse position as a percentage of the screen
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;

      // Smoothly shift the transform origin to follow the mouse
      modalImageEl.style.transformOrigin = `${x}% ${y}%`;
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // MODULE: Render & Pagination (Premium Final Audit)
  // ════════════════════════════════════════════════════════════════════════
  function renderImages(images, append = false) {
    const resultsDiv = document.getElementById("results");
    const loadMoreBtn = document.getElementById("loadMoreBtn");
    if (!resultsDiv) return;

    if (!append) {
      resultsDiv.textContent = "";
      currentPage = 1;
    }

    // Pagination logic
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const pageImages = images.slice(start, end);

    //  Hover Prefetch Engine (With Spam Protection)
  // NEW:
  function attachHoverPrefetch(imgEl, data) {
    if (!data.downloadUrl || data.thumbUrl === data.downloadUrl) return;
    let hoverTimer;
    const onEnter = () => {
      hoverTimer = setTimeout(() => {
        const prefetch = new Image();
        prefetch.fetchPriority = "low";
        prefetch.src = data.downloadUrl;
      }, 50);
    };
    const onLeave = () => clearTimeout(hoverTimer);
    // Both { once: true } so listeners are auto-removed after firing,
    // preventing accumulation on cards cleared by resultsDiv.textContent = ""
    imgEl.addEventListener("mouseenter", onEnter, { once: true });
    imgEl.addEventListener("mouseleave", onLeave, { once: true });
  }

   pageImages.forEach((data) => {
      let clickTimer = null;
      const container = document.createElement("div");
      container.className = "img-item";
      if (data.isLink) container.classList.add("item-link");

      // Checkbox logic
      const chk = document.createElement("input");
      chk.type = "checkbox"; chk.className = "img-select";
      chk.dataset.url = data.downloadUrl;
      chk.checked = data.selected || false;

      //  Native Lazy Loading & HTML Intrinsic Attributes
      const img = document.createElement("img");
      img.src = data.thumbUrl || data.downloadUrl;
      img.alt = data.downloadUrl || "Extracted image";
      img.loading = "lazy";
      img.tabIndex = 0;

      // Wire up the prefetcher!
      attachHoverPrefetch(img, data);

      // Remove ALL container.style overrides and use pure HTML attributes
      // This bypasses the Chrome masonry bug while completely eliminating Layout Shift
      if (data.width > 0 && data.height > 0) {
        img.width = data.width;
        img.height = data.height;
      }

      const shimmer = document.createElement("div");
      shimmer.className = "shimmer-placeholder";
      container.append(shimmer, chk, img);

      // 🛡️ MEMORY/RACE CONDITION : Check if the image is already cached!
      if (img.complete) {
        shimmer.remove();
      } else {
        img.onload = () => { shimmer.remove(); };
      }

      // 🛡️ THE FIX: Graceful Degradation. Don't delete the card if preview fails!
      img.onerror = () => {
        if (img.src !== data.downloadUrl) {
          img.src = data.downloadUrl; // Try the high-res link
        } else {
          // If both fail (Hotlink protection), turn it into a "Link Card" so user can still download it
          shimmer.remove();
          img.style.display = "none";
          container.classList.add("item-link");
          const b = container.querySelector(".res-badge");

          if (b) {
            b.className = "res-badge badge-link";
            // 👇 THE ROLLBACK: Keep it clean, universal, and consistent
            b.textContent = "🔗 Blocked Preview";
          }
        }
      };

      //  Allow 'Enter' key to open Carousel when tabbing onto the Image
      img.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          img.click();
        }
      });

      //  Allow 'Enter' key to toggle Checkbox when tabbing onto it
      chk.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          chk.click();
        }
      });

      // Peach & Blue Badge System
      const resBadge = document.createElement("div");
      resBadge.className = "res-badge";
      if (data.isHiRes) {
        resBadge.classList.add("badge-hires"); resBadge.textContent = "HD+ ✨";
      } else if (data.isLink) {
        resBadge.classList.add("badge-link"); resBadge.textContent = "🔗 Link";
      } else {
        resBadge.textContent = `${data.width}×${data.height}`;
      }
      container.appendChild(resBadge);

      // Restore type badges that were lost in the refactor
      if (data.type === "gif") {
      const gifBadge = document.createElement("div");
        gifBadge.className = "type-badge type-gif";
        gifBadge.textContent = "GIF";
        container.appendChild(gifBadge);
      } else if (data.type === "video-gif") {
      const vidBadge = document.createElement("div");
        vidBadge.className = "type-badge type-video-gif";
        vidBadge.textContent = "📹";
        container.appendChild(vidBadge);
      }

      // HTTP Security Warning
      if (data.downloadUrl.startsWith("http://")) {
        const httpB = document.createElement("div");
        httpB.className = "type-badge"; httpB.style.background = "#f38ba8";
        httpB.textContent = "⚠️ HTTP"; container.appendChild(httpB);
      }


  img.addEventListener("click", (e) => {
    // If a timer is already running, this is the second click — it's a double-click
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    // Double-click: toggle selection
      e.stopPropagation();
      chk.checked = !chk.checked;
      data.selected = chk.checked;
      updateFloatingToolbar();
      if (window.getSelection) window.getSelection().removeAllRanges();
      return;
    }

    // First click: wait 220ms to see if a second arrives
    clickTimer = setTimeout(() => {
      clickTimer = null;
   // It was a single click — open carousel
      carouselImages = currentViewData.map(d => ({ ...d, thumbUrl: d.thumbUrl || d.downloadUrl }));
      openCarousel(currentViewData.findIndex(o => o.downloadUrl === data.downloadUrl));
    }, 250);
  });


      resultsDiv.appendChild(container);
    });

    if (loadMoreBtn) loadMoreBtn.style.display = end < images.length ? "block" : "none";
    updateImageCountBadge();
  }

  // ─── INFINITE SCROLL OBSERVER ───
  const loadMoreBtn = document.getElementById("loadMoreBtn");
  if (loadMoreBtn) {
    // 👇 THE FIX: Stop it from being focusable by the Tab key
    loadMoreBtn.tabIndex = -1;
    // 1. Strip the visual styling so it becomes an invisible sensor
    loadMoreBtn.style.cssText = "background: transparent; color: transparent; height: 20px; border: none; margin: 0; pointer-events: none; box-shadow: none;";

    // 2. Set up the Intersection Observer (Fires 300px before reaching the bottom)
    const infiniteScrollObserver = new IntersectionObserver((entries) => {
      // Logic Sync: Check if more pages exist based on PAGE_SIZE
      if (entries[0].isIntersecting && currentViewData.length > (currentPage * PAGE_SIZE)) {
        currentPage++;
        renderImages(currentViewData, true);
      }
    }, { rootMargin: "300px" });

    // 3. Attach the observer to the tripwire
    infiniteScrollObserver.observe(loadMoreBtn);
  }

 // ════════════════════════════════════════════════════════════════════════
  // MODULE: Filter & Search Engine (Unified)
  // ════════════════════════════════════════════════════════════════════════
   const activeFilterExts = new Set(); // 👈 Upgraded to a Set for multi-selection
   let currentSearchQuery = "";

   function applyFilters() {

    // Grab the new explicit size mode
    const sizeFilterEl = document.getElementById("sizeFilter");
    const sizeMode = sizeFilterEl ? sizeFilterEl.value : "all";

    const oriFilterEl = document.getElementById("orientationFilter");
    const orientation = oriFilterEl ? oriFilterEl.value : "all";

    currentViewData = globalImageData.filter((data) => {
      const url = data.filterUrl.toLowerCase();
      const dl = data.downloadUrl.toLowerCase();

      // 1. EXTENSION FILTER PASS (MULTI-SELECT OR LOGIC)
      let passesExt = true;

      if (activeFilterExts.size > 0) {
        passesExt = false; // Assume false unless it matches one of the active pills

        // 👇 THE FIX: Dynamic CDN Detector
        // Google/YouTube serves AVIF and WEBP payloads hidden behind .jpg URLs
        const isDynamicCDN = url.includes("ytimg.com") || url.includes("gstatic.com");

        if (activeFilterExts.has("gif") && (data.type === "gif" || data.type === "video-gif" || url.includes(".gif") || url.includes("image/gif") || url.includes("=gif"))) passesExt = true;
        if (activeFilterExts.has("png") && (url.includes(".png") || dl.includes(".png") || url.includes("image/png") || url.includes("=png"))) passesExt = true;

        // 👇 Allow dynamic CDNs to trigger the modern format pills!
        if (activeFilterExts.has("webp") && (url.includes(".webp") || dl.includes(".webp") || url.includes("image/webp") || url.includes("=webp") || isDynamicCDN)) passesExt = true;
        if (activeFilterExts.has("avif") && (url.includes(".avif") || dl.includes(".avif") || url.includes("image/avif") || url.includes("=avif") || isDynamicCDN)) passesExt = true;

        if (activeFilterExts.has("svg") && (url.includes(".svg") || dl.includes(".svg") || url.includes("image/svg") || url.includes("=svg"))) passesExt = true;
        if (activeFilterExts.has("bmp") && (url.includes(".bmp") || dl.includes(".bmp") || url.includes("image/bmp") || url.includes("=bmp"))) passesExt = true;
        if (activeFilterExts.has("ico") && (url.includes(".ico") || dl.includes(".ico") || url.includes("image/x-icon") || url.includes("=ico"))) passesExt = true;

        if (activeFilterExts.has("jpg")) {
          const isJpg = (
            url.includes(".jpg") || url.includes(".jpeg") || dl.includes(".jpg") || dl.includes(".jpeg") ||
            url.includes("image/jpeg") || url.includes("=jpg") ||
            (data.type === "image" &&
              !url.includes(".png") && !url.includes(".webp") && !url.includes(".gif") &&
              !url.includes(".avif") && !url.includes(".svg") && !url.includes(".bmp") && !url.includes(".ico")
            )
          );
          // Keep them visible in the JPG pill as well, since the raw URL text still says JPG
          if (isJpg || isDynamicCDN) passesExt = true;
        }
      }

      if (!passesExt) return false;


      // 👇 2. STRICT EXPLICIT SIZE PASS
      if (sizeMode !== "all") {
        const w = data.width;

        // HD: Must be strictly 1280px or wider
        if (sizeMode === "hd" && w < 1280) return false;

        // SD: Between 400px and 1279px
        if (sizeMode === "sd" && (w < 400 || w >= 1280)) return false;

        // LQ: Between 1px and 399px (Actual small thumbnails)
        if (sizeMode === "lq" && (w <= 0 || w >= 400)) return false;

        // LINKS: Strictly 0px (Hidden URLs with no measurable thumbnail)
        if (sizeMode === "link" && w > 0) return false;
      }

      // 👇 3. ORIENTATION PASS (Forgiving Pattern)
      if (orientation !== "all") {
        // Only check the math if we actually know the dimensions.
        // If it's 0x0, we let it pass so it doesn't vanish from the results.
        if (data.width > 0 && data.height > 0) {
          const isLandscape = data.width > data.height * 1.1;
          const isPortrait = data.height > data.width * 1.1;

          if (orientation === "landscape" && !isLandscape) return false;
          if (orientation === "portrait" && !isPortrait) return false;
          if (orientation === "square" && (isLandscape || isPortrait)) return false;
        }
      }

      // 4. SEARCH / REGEX PASS
      if (currentSearchQuery) {
        try {
          // Attempt to evaluate as Regular Expression
          const regex = new RegExp(currentSearchQuery, "i");
          if (!regex.test(data.downloadUrl)) return false;
        } catch {
          // Fallback to standard text search if Regex is invalid
          if (!data.downloadUrl.toLowerCase().includes(currentSearchQuery.toLowerCase())) return false;
        }
      }

      return true;
    });

    const el = document.getElementById("results");
    if (el) el.textContent = "";
    currentPage = 1;
    renderImages(currentViewData, false);

    const statusDiv = document.getElementById("status");
    if (statusDiv) {
      statusDiv.textContent = currentViewData.length === 0
        ? "No images match this filter/search."
        : `Showing ${currentViewData.length} items.`;
    }
  }

  // Hook up the Filter Pills (Multi-Select Enabled + Master Reset)
  const filterButtons = document.querySelectorAll(".filter-btn");
  const allBtn = document.querySelector('.filter-btn[data-ext="all"]');

  filterButtons.forEach((btn) => {
    // Only set ARIA attributes if they haven't been set by HTML yet
    if (!btn.hasAttribute("aria-pressed")) btn.setAttribute("aria-pressed", "false");

    btn.addEventListener("click", () => {

      const ext = btn.dataset.ext;

      if (ext === "all") {
        // 1. THE RESET ACTION: User explicitly clicked "ALL"
        activeFilterExts.clear(); // Wipe the data state

        // Visually reset all buttons
        filterButtons.forEach(b => {
          b.classList.remove("active");
          b.setAttribute("aria-pressed", "false");
        });

        // Light up the ALL button
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");

      } else {
        // 2. THE FILTER ACTION: User clicked a specific format
        const isActive = activeFilterExts.has(ext);

        if (isActive) {
          // Toggle OFF
          activeFilterExts.delete(ext);
          btn.classList.remove("active");
          btn.setAttribute("aria-pressed", "false");
        } else {
          // Toggle ON
          activeFilterExts.add(ext);
          btn.classList.add("active");
          btn.setAttribute("aria-pressed", "true");
        }

        // 3. THE UX SYNC: Manage the visual state of the "ALL" button
        if (activeFilterExts.size === 0) {
          // If the user manually unchecked everything, auto-select ALL
          if (allBtn) {
            allBtn.classList.add("active");
            allBtn.setAttribute("aria-pressed", "true");
          }
        } else {
          // If specific filters are active, ensure ALL is turned off
          if (allBtn) {
            allBtn.classList.remove("active");
            allBtn.setAttribute("aria-pressed", "false");
          }
        }
      }

      applyFilters();
    });
  });

  // Hook up the Search Bar with Modern Debouncing
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const newVal = e.target.value.trim();
        if (currentSearchQuery === newVal) return;
        currentSearchQuery = newVal;
        applyFilters();
      }, 250); // Waits 250ms after they stop typing before lagging the UI
    });
  }

  // Hook up the Advanced Dropdowns

  // Hook up the Quick Filter Dropdowns
  const sizeFilter = document.getElementById("sizeFilter");
  if (sizeFilter) sizeFilter.addEventListener("change", applyFilters);

  const orientationFilter = document.getElementById("orientationFilter");
  if (orientationFilter) orientationFilter.addEventListener("change", applyFilters);


  // ════════════════════════════════════════════════════════════════════════
  // MODULE: Selection Tools (Master, Sort, Best, Invert)
  // ════════════════════════════════════════════════════════════════════════
  const masterSelect = document.getElementById("masterSelect");
  if (masterSelect) {
    masterSelect.addEventListener("change", (e) => {
      const checked = e.target.checked;
      currentViewData.forEach(img => img.selected = checked);
      document.querySelectorAll(".img-select").forEach(cb => cb.checked = checked);
      updateFloatingToolbar(); // Syncs floating bar
    });

    masterSelect.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        masterSelect.click();
      }
    });
  }

  const sortBtn = document.getElementById("sortBtn");
  if (sortBtn) {
    sortBtn.addEventListener("click", () => {
      currentViewData.sort((a, b) => (b.width * b.height) - (a.width * a.height));
      currentPage = 1;
      renderImages(currentViewData, false);
      window.showToast("Sorted by size (largest first)", "info", 2000);
    });
  }

  const bestBtn = document.getElementById("bestBtn");
  if (bestBtn) {
    bestBtn.addEventListener("click", () => {
      const areas = currentViewData
        .map(d => d.isHiRes ? 0 : d.width * d.height)
        .filter(a => a > 0);
      const maxArea = areas.length ? Math.max(...areas) : 0;
      const threshold = Math.max(maxArea * 0.2, 80000);

      currentViewData.forEach(img => {
      const area = img.isHiRes ? 0 : img.width * img.height;
      img.selected = img.isHiRes || area >= threshold;
    });

    document.querySelectorAll(".img-select").forEach(cb => {
      const d = currentViewData.find(d => d.downloadUrl === cb.dataset.url);
      if (d) cb.checked = d.selected;
    });
    updateFloatingToolbar();

    const count = currentViewData.filter(d => d.selected).length;
      window.showToast(
        count > 0 ? `Selected ${count} high-quality images.` : "No qualifying images found.",
        count > 0 ? "success" : "info", 2000
      );
    });
  }

  const invertBtn = document.getElementById("invertBtn");
  if (invertBtn) {
    invertBtn.addEventListener("click", () => {
      currentViewData.forEach(img => img.selected = !img.selected);
      document.querySelectorAll(".img-select").forEach(cb => cb.checked = !cb.checked);
      updateFloatingToolbar(); // Syncs floating bar
      window.showToast("Selection inverted", "info", 2000);
    });
  }

  // 👇 Keyboard Shortcuts (Power User Bypasses Tab Hell)
  document.addEventListener("keydown", (e) => {
    // Listen for Ctrl+Enter (Windows/Linux) or Cmd+Enter (Mac)
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      const dlBtn = document.getElementById("downloadSelectedBtn");

      // If the floating download button is currently visible on screen, click it!
      if (dlBtn && dlBtn.style.display === "block" && !dlBtn.disabled) {
        e.preventDefault();
        dlBtn.click();
      }
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // MODULE: Scanner
  // ════════════════════════════════════════════════════════════════════════
  const sniffBtn = document.getElementById("sniffBtn");
  if (sniffBtn) {
    sniffBtn.addEventListener("click", async () => {

      // 👇 THE ULTIMATE FIX: Always lock onto the main browser window!
      let targetTab = null;
      const normalTabs = await chrome.tabs.query({ active: true, windowType: "normal" });

      // Find the active tab in the main browser that is NOT an extension page
      targetTab = normalTabs.find(t => t.url && !t.url.startsWith("chrome-extension://"));

      // Fallback just in case
      if (!targetTab) {
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        targetTab = currentTab;
      }

      const tab = targetTab;

      // 2. GUARD: Use that captured 'tab' for the legality check
      if (!tab || (!tab.url?.startsWith("http") && !tab.url?.startsWith("file"))) {
        window.showToast("⚠️ This type of page cannot be scanned.", "error", 4000);
        return;
      }

      const statusDiv = document.getElementById("status");
      sniffBtn.disabled = true;
      sniffBtn.textContent = "Scanning... 🐾";
      if (statusDiv) statusDiv.textContent = "Injecting sensors...";

      const dlProg = document.getElementById("dlProgress");
      if (dlProg) dlProg.style.display = "none";

      const copyBtnEl = document.getElementById("copySelectedBtn");
      if (copyBtnEl) copyBtnEl.style.display = "none";

      const resultsDiv = document.getElementById("results");
      if (resultsDiv) resultsDiv.textContent = "";

      // 👇 THE FIX: Reset all advanced filters to default on a fresh scan
      if (document.getElementById("searchInput")) document.getElementById("searchInput").value = "";
      currentSearchQuery = "";

      // Update this line to "all" instead of "0"
      if (document.getElementById("sizeFilter")) document.getElementById("sizeFilter").value = "all";
      if (document.getElementById("orientationFilter")) document.getElementById("orientationFilter").value = "all";

      activeFilterExts.clear();

      globalImageData = [];
      currentViewData = [];
      currentPage = 1;

      const lmBtn = document.getElementById("loadMoreBtn");
      if (lmBtn) lmBtn.style.display = "none";

      // Reset Visuals: Turn everything off, then turn ALL on
      document.querySelectorAll(".filter-btn").forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      });
      const allPill = document.querySelector('.filter-btn[data-ext="all"]');
      if (allPill) {
        allPill.classList.add("active");
        allPill.setAttribute("aria-pressed", "true");
      }
      updateImageCountBadge();

      try {
        // 1. Connectivity Check
        try {
          await chrome.tabs.sendMessage(tab.id, { type: "PING" });
        } catch {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["observer.js"] });
        }

        const domResponse = await chrome.tabs.sendMessage(tab.id, { type: "GET_SNIFFED_IMAGES" });
        const imageData = domResponse?.images || [];

        // 2. GIF Vault Sync
        const vaultResponse = await chrome.runtime.sendMessage({ type: "GET_GIF_VAULT" }).catch(() => ({ gifs: [] }));
        const networkGifs = vaultResponse?.gifs || [];

        const existingUrls = new Set(imageData.map(img => img.downloadUrl));
        networkGifs.forEach(url => {
          if (!existingUrls.has(url)) {
            const isVideo = url.toLowerCase().endsWith(".webm") || url.toLowerCase().endsWith(".mp4");
            imageData.push({
              downloadUrl: url, filterUrl: url, thumbUrl: url,
              type: isVideo ? "video-gif" : "gif", width: 0, height: 0, isHiRes: false
            });
            existingUrls.add(url);
          }
        });

        if (imageData.length > 0) {
          globalImageData = imageData.map((img) => ({
            ...img,
            selected: false,
            // Standardized HD+ check
            isHiRes: img.isHiRes === true || img.width >= 1280,
          }));

          // Show Controls (Not floating)
          document.getElementById("selectionTools").style.display = "flex";
          document.getElementById("filterGroup").style.display = "flex";

          applyFilters(); // 👈 This calls renderImages(currentViewData, false)

          const gifCount = imageData.filter((i) => i.type === "gif" || i.type === "video-gif").length;
          if (statusDiv) statusDiv.textContent = `Found ${imageData.length} items (${gifCount} GIFs).`;
        } else {
          // Hide all on fail
          document.getElementById("selectionTools").style.display = "none";
          document.getElementById("filterGroup").style.display = "none";
          if (statusDiv) statusDiv.textContent = "No images found on this page.";
        }
      } catch {
        if (statusDiv) statusDiv.textContent = "⚠️ Could not reach the page — try reloading.";
      } finally {
        sniffBtn.disabled = false;
        sniffBtn.textContent = "Fetch Images 🐾";
      }
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // MODULE: Downloader (Non-Blocking)
  // ════════════════════════════════════════════════════════════════════════
  const downloadSelectedBtn = document.getElementById("downloadSelectedBtn");
  if (downloadSelectedBtn) {
    downloadSelectedBtn.addEventListener("click", async () => {
      const selected = currentViewData.filter((d) => d.selected);
      if (!selected.length) return;

      const statusDiv = document.getElementById("status");
      const dlProg = document.getElementById("dlProgress");

      if (statusDiv) statusDiv.textContent = `Preparing ${selected.length} downloads...`;
      if (dlProg) dlProg.style.display = "block";

      downloadSelectedBtn.disabled = true;
      downloadSelectedBtn.textContent = "⏳ Downloading...";

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      let domain = "kat";
      try { domain = new URL(tab?.url || "http://kat").hostname.replace("www.", "").replace(/\./g, "_"); } catch {}

      const zipToggleEl = document.getElementById("zipToggle");
      const zipMode = zipToggleEl ? zipToggleEl.checked : true;

      // 👇 THE FIX: The Download Bomb Spam Guard (Now uses updateFloatingToolbar)
      if (!zipMode && selected.length > 20) {
        const proceedWithSpam = window.confirm(
          `⚠️ SPAM WARNING: You are about to download ${selected.length} separate files directly to your hard drive.\n\nIt is highly recommended to check "Package as ZIP" for large batches.\n\nAre you sure you want to proceed with individual files?`
        );

        if (!proceedWithSpam) {
          // The user clicked "Cancel". Abort the download completely!
          downloadSelectedBtn.disabled = false;
          updateFloatingToolbar(); // 👈 Automatically fixes the button text!
          if (dlProg) dlProg.style.display = "none";
          if (statusDiv) statusDiv.textContent = `Showing ${currentViewData.length} items.`;
          return;
        }
      }

      const templateEl = document.getElementById("filenameTemplate");
      const template = templateEl ? templateEl.value : "{domain}_{index}.{ext}";

      chrome.runtime.sendMessage(
        { type: "DOWNLOAD_IMAGES", urls: selected.map((d) => d.downloadUrl), domain, zipMode, filenameTemplate: template },
        (res) => {

          if (chrome.runtime.lastError) {
            downloadSelectedBtn.disabled = false;
            updateFloatingToolbar(); // 👈 Automatically fixes the button text!
            if (dlProg) dlProg.style.display = "none";
            window.showToast("❌ Extension core inactive. Please refresh the page.", "error", 5000);
            return;
          }

          // 👇 THE FIX: Dynamic UI Messaging for the Queue & Instant Downloads
          if (res?.queued || res?.instant || res?.instantQueue) {
            let msgText = "";
            if (res.instant) msgText = `🚀 Instant Download Started!`;
            else if (res.instantQueue) msgText = `🚀 ZIP Batch Started!`;
            else msgText = `📦 Added to ZIP Queue! (Position: ${res.pending})`;

            window.showToast(msgText, "info", 4000);

            // Instantly clear selections so the user can build the next batch
            globalImageData.forEach(img => img.selected = false);
            document.querySelectorAll(".img-select").forEach(cb => cb.checked = false);

            // Re-enable the button and hide it cleanly
            downloadSelectedBtn.disabled = false;
            updateFloatingToolbar(); // 👈 Automatically hides the button!
            return;
          }

          // Legacy failsafe
          downloadSelectedBtn.disabled = false;
          updateFloatingToolbar(); // 👈 Automatically fixes the button text!
          if (dlProg) dlProg.style.display = "none";
          window.showToast(`❌ Download failed: ${res?.error || "unknown error"}`, "error", 5000);
        }
      );
    });
  }

  //  Copy to clipboard via background fetch to bypass CORS
  const copyBtn = document.getElementById("copySelectedBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const selected = currentViewData.filter((d) => d.selected);
      if (selected.length === 0) return;

      try {
        if (selected.length === 1) {
          const url = selected[0].downloadUrl;
          const result = await chrome.runtime.sendMessage({ type: "FETCH_FOR_CLIPBOARD", url });
          if (!result?.ok) throw new Error(result?.error || "Fetch failed");

          const fetchRes = await fetch(result.dataUrl);
          const blob = await fetchRes.blob();
          await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
          window.showToast("📋 Copied image to clipboard!", "success");
        } else {
          const urls = selected.map(d => d.downloadUrl).join("\n");
          await navigator.clipboard.writeText(urls);
          window.showToast(`📋 Copied ${selected.length} direct links!`, "success");
        }
      } catch {
        window.showToast("⚠️ Clipboard error (CORS or type mismatch).", "error");
      }
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // MODULE: Side Panel Tab Sync
  // ════════════════════════════════════════════════════════════════════════
  if (isSidePanel) {
    let lastScannedTabId = null;
    let lastScannedUrl = null;

    chrome.tabs.onActivated.addListener(activeInfo => {
      window.refreshNamingRule?.();
      chrome.tabs.get(activeInfo.tabId, tab => {
        if (tab.url !== lastScannedUrl || activeInfo.tabId !== lastScannedTabId) {
          autoRescan();
        }
      });
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.active) {
        window.refreshNamingRule?.();
        if (tab.url !== lastScannedUrl || tabId !== lastScannedTabId) {
          autoRescan();
        }
      }
    });

    function autoRescan() {
      const sniffBtn = document.getElementById("sniffBtn");
      if (sniffBtn && !sniffBtn.disabled) {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
          if (!tab) return;
          lastScannedTabId = tab.id;
          lastScannedUrl = tab.url;

          const resultsDiv = document.getElementById("results");
          if (resultsDiv) resultsDiv.textContent = "";
          const statusDiv = document.getElementById("status");
          if (statusDiv) statusDiv.textContent = "Tab changed. Auto-scanning...";

          setTimeout(() => sniffBtn.click(), 500);
        });
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // MODULE: Scroll to Top (Unified Native Scrolling)
  // ════════════════════════════════════════════════════════════════════════
  const scrollTopBtn = document.createElement("button");
  scrollTopBtn.id = "scrollTopBtn";
  scrollTopBtn.textContent = "↑";
  scrollTopBtn.title = "Scroll to top";
  scrollTopBtn.tabIndex = -1;
  document.body.appendChild(scrollTopBtn);

  // 🚀 Both the Popup and Side Panel now use native window scrolling
 let scrollTicking = false;
 window.addEventListener("scroll", () => {
   if (!scrollTicking) {
     requestAnimationFrame(() => {
       scrollTopBtn.style.display = window.scrollY > 150 ? "flex" : "none";
       scrollTicking = false;
     });
     scrollTicking = true;
    }
  }, { passive: true });

  scrollTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // ════════════════════════════════════════════════════════════════════════
  // MODULE: Global Focus Boundaries (Anti-Wrap Engine)
  // ════════════════════════════════════════════════════════════════════════
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;

    // 1. If the image modal is open, let its own trap handle it!
    const modal = document.getElementById("previewModal");
    if (modal && modal.style.display === "flex") return;

    // 2. Find all focusable, visible elements in the extension
    const focusable = Array.from(document.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]'
    )).filter(el =>
      !el.disabled &&
      el.offsetWidth > 0 &&
      el.offsetHeight > 0 &&
      el.tabIndex >= 0 // 👇 THE FIX: Strictly ignore elements that Chrome skips (like the Scroll button)
    );

    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    // 3. The Hard Stops
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); // Hit the top ceiling! Stop Chrome from wrapping down.
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); // Hit the bottom floor! Stop Chrome from wrapping up.
    }
  });

}; // end window.initKatFetch


// observer.js — KatFetch v1.0 Content Script

(() => {
  if (window.__katFetchActive) return;
  window.__katFetchActive = true;

  //  Moved from window to local IIFE scope to prevent pollution
  let cssBgTimer = null;

  //  THE FIX: Keep the vault strictly inside this isolated script
  let katVault = [];
  const vaultMap = new Map(); // Upgraded to a Map for the Quality Engine
  const domain   = window.location.hostname.replace("www.", "").replace(/\./g, "_");

  // ─── DEDUPLICATION KEY ────────────────────────────────────────────────────
  function makeCleanKey(url) {
    if (!url.startsWith("http")) return url;
    try {
      const u = new URL(url);
      ["v","ver","t","ts","cb","_","cachebust","nocache","rand","random","nc","bust"]
        .forEach(p => u.searchParams.delete(p));
      ["w","h","q","width","height","quality","dpr","fit","auto","fm","crop","cs","ixid","ixlib","s"]
        .forEach(p => u.searchParams.delete(p));
      return u.toString();
    } catch { return url; }
  }

  // ─── SAFE THUMBNAIL ───────────────────────────────────────────────────────
  function makeSafeThumb(src) {
    if (!src || !src.startsWith("http")) return src;
    try {
      const u = new URL(src);
      const host = u.hostname;

      // Tenor: swap full GIF for their built-in preview thumbnail
      // media.tenor.com/xyz/name.gif → media.tenor.com/xyz/name.png (tiny preview)
      if (host.includes("tenor.com") && src.endsWith(".gif")) {
        return src.replace(/\.gif(\?.*)?$/, ".png");
      }

      // Giphy: swap for their 200px thumbnail endpoint
      // media.giphy.com/media/ID/giphy.gif → media.giphy.com/media/ID/200.gif
      if (host.includes("giphy.com") && src.includes("/giphy.gif")) {
        return src.replace("/giphy.gif", "/200.gif");
      }

      // Unsplash — must come BEFORE the generic query-string guard below
      if (host.includes("unsplash.com") || host.includes("images.unsplash.com")) {
        u.searchParams.set("w", "200");
        u.searchParams.set("q", "50");
        return u.toString();
      }

      // Only apply size params for known CDNs that support w/q, not every URL with "?"
      if ((host.includes("imgflip.com") || host.includes("makeagif.com")) && src.includes("?")) {
        u.searchParams.set("w", "200");
        u.searchParams.set("q", "50");
        return u.toString();
      }

    } catch {}
    return src;
  }

  // ─── STORE ENTRY (THE UPGRADE ENGINE) ───────────────────────────────────
  function store(downloadUrl, thumbUrl, w, h, type = "image", isHiRes = false) {
    if (!downloadUrl) return;

    const cleanKey = makeCleanKey(downloadUrl);
    const existing = vaultMap.get(cleanKey);

    const realW = w || 0;
    const realH = h || 0;
    const hdFlag = isHiRes || realW >= 1280; // Auto-tag as HD

    //  If we already saw this image, check if the NEW one is higher quality!
    if (existing) {
      if (realW > existing.width) {
        // Silently upgrade the existing data point in memory!
        existing.downloadUrl = downloadUrl;
        existing.width = realW;
        existing.height = realH;
        if (hdFlag) existing.isHiRes = true;
      }
      return; // Do not push a duplicate card!
    }

    const entry = {
      thumbUrl:    thumbUrl || makeSafeThumb(downloadUrl),
      filterUrl:   downloadUrl,
      downloadUrl: downloadUrl,
      domain,
      width:       realW,
      height:      realH,
      type,
      isHiRes:     hdFlag
    };

    vaultMap.set(cleanKey, entry);
    katVault.push(entry);
  }

  // ─── STANDARD img EXTRACTION ──────────────────────────────────────────────
  function extractImg(imgNode) {
    const rawSrc =
      imgNode.src || imgNode.getAttribute("data-src") || imgNode.getAttribute("data-lazy") ||
      imgNode.getAttribute("data-lazy-src") || imgNode.getAttribute("data-original") ||
      imgNode.getAttribute("data-url") || imgNode.getAttribute("data-iurl") ||
      imgNode.dataset.src || imgNode.dataset.lazySrc || imgNode.dataset.original ||
      imgNode.dataset.hi || "";

    if (!rawSrc) return;

    const safeThumb = imgNode.currentSrc
      ? makeSafeThumb(imgNode.currentSrc)   // already loaded = no network request for thumb
      : makeSafeThumb(rawSrc);

    const w = imgNode.naturalWidth  || parseInt(imgNode.getAttribute("width"))  || imgNode.clientWidth  || 0;
    const h = imgNode.naturalHeight || parseInt(imgNode.getAttribute("height")) || imgNode.clientHeight || 0;

    const lowerSrc = rawSrc.toLowerCase();
    const isTinyAllowed = lowerSrc.includes(".ico") || lowerSrc.includes(".bmp") || lowerSrc.includes(".svg");

    //  Only assassinate if dimensions exist AND are too small. Let 0x0 pass!
    if (!isTinyAllowed && (w > 0 && h > 0) && (w < 80 && h < 80)) return;

    const isGif = lowerSrc.includes(".gif") || lowerSrc.includes("image/gif");
    store(rawSrc, safeThumb, w, h, isGif ? "gif" : "image", false);

    const srcset = imgNode.getAttribute("srcset") || imgNode.getAttribute("data-srcset") || "";
    if (srcset) extractSrcset(srcset, w, h);
  }

  // ─── META & FAVICON EXTRACTION (NEW) ──────────────────────────────────────
  function extractMetaIcons() {
    // Hunts down hidden website favicons and social media preview images
    document.querySelectorAll("link[rel*='icon'], link[rel='apple-touch-icon'], meta[property='og:image']").forEach(el => {
      const url = el.href || el.content;
      if (!url || !url.startsWith("http")) return;
      store(url, url, 0, 0, "image", false);
    });
  }

  // ─── SRCSET PARSER ────────────────────────────────────────────────────────
  function extractSrcset(srcset, w, h) {
    const candidates = srcset.split(",").map(s => {
      const parts = s.trim().split(/\s+/);
      return { url: parts[0], width: parseInt(parts[1]) || 0 };
    }).filter(c => c.url && c.url.startsWith("http"));

    if (!candidates.length) return;

    candidates.sort((a, b) => b.width - a.width);
    const best = candidates[0];
    const isGif = best.url.toLowerCase().includes(".gif");
    store(best.url, makeSafeThumb(best.url), best.width || w, h, isGif ? "gif" : "image", false);
  }

  // ─── VIDEO-GIF EXTRACTION ─────────────────────────────────────────────────
  function extractVideoGifs(container = document) {
    container.querySelectorAll("video").forEach(vid => {

      // THE DEFINITIVE GUARD:
      // 'controls' = user-facing video player with play/pause = NOT a GIF substitute.
      // '!muted' = has audio = NOT a GIF substitute.
      // Both checks together catch 99% of real video players correctly.
      if (vid.controls) return;
      if (!vid.muted && !vid.hasAttribute("muted")) return;

      // FIX 1: Prefer currentSrc (resolved after lazy load) over the raw src attribute.
      // React/Vue set currentSrc via JS, not via HTML attribute.
      const sources = [
        vid.currentSrc,          // ← resolved URL, populated after load starts
        vid.src,                 // ← raw attribute fallback
        vid.getAttribute("data-src"),
        ...Array.from(vid.querySelectorAll("source")).map(s =>
          s.src || s.getAttribute("src") || s.getAttribute("data-src")
        )
      ].filter(src => src && src.startsWith("http"));

      // Deduplicate — currentSrc and src are often identical
      const uniqueSources = [...new Set(sources)];

      uniqueSources.forEach(src => {
        // FIX 2: Use a readyState guard to get real dimensions when available.
        // readyState >= 1 means browser has read metadata (including videoWidth/videoHeight).
        // readyState 0 means nothing loaded yet — fall back to layout dimensions.
        const w = vid.readyState >= 1
          ? (vid.videoWidth  || vid.clientWidth  || 480)
          : (vid.clientWidth  || 480);
        const h = vid.readyState >= 1
          ? (vid.videoHeight || vid.clientHeight || 270)
          : (vid.clientHeight || 270);

        const thumb = vid.poster || makeSafeThumb(src);
        store(src, thumb, w, h, "video-gif", false);
      });
    });
  }

  // ─── CSS BACKGROUND GIF EXTRACTION ───────────────────────────────────────
  function extractCssBackgroundGifs(container = document) {
    container.querySelectorAll("[style*='background']").forEach(el => {
      try {
        const inlineStyle = el.getAttribute("style") || "";
        if (!inlineStyle.includes("url") || !inlineStyle.toLowerCase().includes(".gif")) return;
        const bg = window.getComputedStyle(el).backgroundImage;
        if (!bg || !bg.includes("url")) return;
        const match = bg.match(/url\(["']?(https?:[^"')]*\.gif[^"')]*)/i);
        if (!match) return;
        const url = match[1];
        const w   = el.offsetWidth  || 0;
        const h   = el.offsetHeight || 0;
        if (w < 50 || h < 50) return;
        store(url, url, w, h, "gif", false);
      } catch {}
    });
  }
  function extractAllCssBackgroundGifs() {
  try {
    Array.from(document.styleSheets).forEach(sheet => {
      try {
        Array.from(sheet.cssRules || []).forEach(rule => {
          if (!rule.style) return;
          const bg = rule.style.backgroundImage;
          if (!bg || !bg.includes(".gif")) return;
          const match = bg.match(/url\(["']?(https?:[^"')]*\.gif[^"')]*)/i);
          if (match) store(match[1], match[1], 0, 0, "gif", false);
        });
      } catch {} // Cross-origin stylesheets throw SecurityError — silent catch is correct
    });
  } catch {}
}

  // ─── PICTURE ELEMENT ──────────────────────────────────────────────────────
  function extractPicture(pictureNode) {
    pictureNode.querySelectorAll("source").forEach(src => {
      const srcset = src.getAttribute("srcset") || "";
      const type   = src.getAttribute("type") || "";
      if (!srcset) return;
      const url = srcset.split(",")[0].trim().split(/\s+/)[0];
      if (!url || !url.startsWith("http")) return;
      const isGif = type.includes("gif") || url.toLowerCase().includes(".gif");
      store(url, makeSafeThumb(url), 0, 0, isGif ? "gif" : "image", false);
    });
  }

  // ─── ANCHOR GIF LINKS ─────────────────────────────────────────────────────
  function extractGifLinks(container = document) {
    container.querySelectorAll("a[href]").forEach(a => {
      const href = a.href || "";
      if (!href.startsWith("http")) return;
      if (!href.toLowerCase().includes(".gif")) return;

      // THE FIX: Only store if the URL itself IS the GIF file.
      // Landing pages like tenor.com/view/... don't end in .gif
      // Real GIF files end in .gif (possibly with query params)
      const pathname = (() => { try { return new URL(href).pathname; } catch { return href; } })();
      if (!pathname.toLowerCase().endsWith(".gif")) return;

      // For real .gif URLs, try to find a thumbnail inside the anchor
      const imgInside = a.querySelector("img");
      const thumb = imgInside ? (imgInside.currentSrc || imgInside.src) : href;

      store(href, thumb || href, 0, 0, "gif", false);
    });
  }

  // NEW:
  // ─── CANVAS SNAPSHOT (thumbnail only — prevents OOM on WebGL/Three.js pages) ──
  function extractCanvas(canvasNode) {
    try {
      const w = canvasNode.width;
      const h = canvasNode.height;
      if (w < 50 || h < 50) return;

      // Downscale to a 200px thumbnail before encoding.
      // A full 1080p PNG data URI is ~5-8 MB per canvas; multiply by 10 canvases = OOM crash.
      const thumbCanvas = document.createElement("canvas");
      const scale = Math.min(1, 200 / Math.max(w, h));
      thumbCanvas.width  = Math.round(w * scale);
      thumbCanvas.height = Math.round(h * scale);
      const ctx = thumbCanvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(canvasNode, 0, 0, thumbCanvas.width, thumbCanvas.height);

      const thumbUrl = thumbCanvas.toDataURL("image/jpeg", 0.7);
      if (!thumbUrl || thumbUrl === "data:,") return;

      // downloadUrl is also the thumb — canvas contents can't be re-fetched by URL
      store(thumbUrl, thumbUrl, w, h, "image", false);
    } catch {}
  }

  // ─── GOOGLE FULL-RES EXTRACTION ───────────────────────────────────────────
  function extractGoogleFullImages(container = document) {
    container.querySelectorAll("a").forEach(a => {
      try {
        if (!a.href?.startsWith("http")) return;
        const u       = new URL(a.href);
        const realImg = u.searchParams.get("imgurl");
        if (!realImg?.startsWith("http")) return;

        const rw = parseInt(u.searchParams.get("w")  || u.searchParams.get("ow")) || 0;
        const rh = parseInt(u.searchParams.get("h")  || u.searchParams.get("oh")) || 0;
        const imgNode = a.querySelector("img");
        const thumb   = imgNode ? (imgNode.currentSrc || imgNode.src) : realImg;

        // Let the powerful store() engine handle deduplication and upgrading!
        store(realImg, thumb, rw, rh, "image", (rw === 0 && rh === 0));
      } catch {}
    });
  }

  // ─── GOOGLE HIDDEN STATE HARVESTER ────────────────────────────────────────
  function harvestGoogleHiddenHD() {
    document.querySelectorAll("script").forEach(script => {
      const text = script.textContent;
      if (!text || !text.includes("http")) return;
      if (text.length > 100_000) return;

      const regex = /\["([^"]+)",(\d+),(\d+)\]/g;
      let match;

      while ((match = regex.exec(text)) !== null) {
        let url = match[1];
        const w = parseInt(match[2]);
        const h = parseInt(match[3]);

        if (w >= 400 && h >= 400 && url.startsWith("http")) {
          try { url = JSON.parse(`"${url}"`); } catch {}

          // Let the powerful store() engine handle deduplication and upgrading!
          store(url, url, w, h, "image", w >= 1280);
        }
      }
    });
  }

  // ─── INITIAL SCAN ─────────────────────────────────────────────────────────
  function fullScan(root = document) {
    root.querySelectorAll("img").forEach(extractImg);
    root.querySelectorAll("picture").forEach(extractPicture);
    root.querySelectorAll("canvas").forEach(extractCanvas);
    extractVideoGifs(root);
    extractGifLinks(root);

    if (root === document) extractMetaIcons();

    if (window.location.hostname.includes("google")) extractGoogleFullImages(root);

    // 👇 THE FIX: Use the local timer variable instead of window property
    clearTimeout(cssBgTimer);
    if (root === document) harvestGoogleHiddenHD();
    if (root === document) extractAllCssBackgroundGifs();
    cssBgTimer = setTimeout(() => extractCssBackgroundGifs(root), 800);
  }
  fullScan();

  // ─── MUTATION OBSERVER (BACKGROUND-SAFE DEBOUNCE) ────────────────────────────
  let googleTimer        = null; // holds setTimeout ID; clearTimeout(null) is a safe no-op
  let observerBatchTimer = null; // holds setTimeout ID; clearTimeout(null) is a safe no-op
  const nodeQueue = new Set();
  let needGoogleScan = false;

  //  Memory leak protection for event listeners
  const trackedNodes = new WeakSet();

  function flushObserverQueue() {
    // Take a snapshot and clear the queue immediately
    const nodesToProcess = Array.from(nodeQueue);
    nodeQueue.clear();

    nodesToProcess.forEach(node => {
      // Safety check: Ensure node is still in the DOM and is an Element
      if (node.nodeType !== 1 || !node.isConnected) return;

      const tag = node.tagName;
      if (tag === "IMG") {
        extractImg(node);
        //  Only attach listener if we haven't already
        if (!trackedNodes.has(node)) {
          trackedNodes.add(node);
          node.addEventListener("load", () => extractImg(node), { once: true });
        }
      } else if (tag === "VIDEO") {
         //  Scan the specific node, not its parent (avoids re-scanning siblings)
         // Wrap in a minimal scan rather than re-querying the parent container
        extractVideoGifs(node.parentElement || document);
        // Also listen for metadata load to capture real dimensions once they're available
        if (!trackedNodes.has(node)) {
          trackedNodes.add(node);
          node.addEventListener("loadedmetadata", () => extractVideoGifs(node.parentElement || document), { once: true });
        }
      } else if (tag === "SOURCE") {
        //  Catch <source> tags injected after the hollow video shell!
        if (node.parentElement && node.parentElement.tagName === "VIDEO") {
          extractVideoGifs(node.parentElement.parentElement || document);
        } else if (node.parentElement && node.parentElement.tagName === "PICTURE") {
          extractPicture(node.parentElement.parentElement || document);
        }
      } else if (tag === "PICTURE") {
        extractPicture(node);
      } else if (tag === "CANVAS") {
        extractCanvas(node);
      } else if (node.querySelectorAll) {
        needGoogleScan = true;
        node.querySelectorAll("img").forEach(img => {
          extractImg(img);
          //  Only attach listener if we haven't already
          if (!trackedNodes.has(img)) {
            trackedNodes.add(img);
            img.addEventListener("load", () => extractImg(img), { once: true });
          }
        });
        node.querySelectorAll("video").forEach(() => extractVideoGifs(node));
        node.querySelectorAll("picture").forEach(p => extractPicture(p));
        node.querySelectorAll("canvas").forEach(c => extractCanvas(c));
      }
    });

    if (needGoogleScan && window.location.hostname.includes("google")) {
      clearTimeout(googleTimer);
      googleTimer = setTimeout(() => extractGoogleFullImages(), 1200);
      needGoogleScan = false;
    }
  }

  const MAX_QUEUE_SIZE = 200;

  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mut => {
      if (mut.type === "childList") {
        mut.addedNodes.forEach(node => {
          if (node.nodeType === 1) nodeQueue.add(node);
        });
      } else if (mut.type === "attributes") {
        if (mut.target.nodeType === 1) nodeQueue.add(mut.target);
      }
    });

    // If the queue overflows (e.g. Twitter infinite scroll), flush immediately
    // instead of letting the Set accumulate thousands of strong DOM references.
    if (nodeQueue.size >= MAX_QUEUE_SIZE) {
      clearTimeout(observerBatchTimer);
      flushObserverQueue();
      return;
    }

    clearTimeout(observerBatchTimer);
    observerBatchTimer = setTimeout(flushObserverQueue, 150);
  });

  //  CRITICAL: Do not delete this! It turns the engine on.
  // THE FIX: Gracefully handle raw image/SVG tabs that don't have a <body> tag!
  const targetNode = document.body || document.documentElement;

  if (targetNode) {
    observer.observe(targetNode, {
      childList:       true,
      subtree:         true,
      attributes:      true,
      attributeFilter: ["src","data-src","data-lazy","data-lazy-src","data-original","srcset","poster","data-iurl"]
    });
  }

  window.addEventListener("beforeunload", () => {
    observer.disconnect();
    clearTimeout(cssBgTimer); // 👈 Prevents ghost execution on tab close
  });

  // ─── IMMERSIVE PLAYER STATE (DOUBLE-BUFFERED) ───────────────────────────
  let overlayLoadId = 0;
  const bufferImg = new Image();

  // ─── SAFE MESSENGER (Prevents Context Invalidated Crashes) ───────────────
  function safeSendMessage(msg) {
    try {
      chrome.runtime.sendMessage(msg);
    } catch (e) {
      if (e.message.includes("Extension context invalidated")) {
        console.warn("🐾 KatFetch was updated! Please refresh the page to continue.");
        const overlay = document.getElementById("kat-immersive-overlay");
        if (overlay) overlay.remove();
        document.body.style.removeProperty("overflow");
        document.documentElement.style.removeProperty("overflow");
      }
    }
  }

  // ─── MESSAGE HANDLER ──────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "PING") sendResponse({ok: true});
    if (msg.type === "GET_SNIFFED_IMAGES") {
      fullScan();
      const results = katVault.filter(obj =>
        obj.downloadUrl.startsWith("http") || obj.downloadUrl.startsWith("data:image")
      );
      sendResponse({ images: results });
    }

    // ─── IN-PAGE IMMERSIVE PLAYER (UPGRADED UI) ─────────────────────────────
    if (msg.type === "MOUNT_HOST_PLAYER") {
      let overlay = document.getElementById("kat-immersive-overlay");

      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "kat-immersive-overlay";
        overlay.style.cssText = `
          position: fixed !important; top: 0 !important; left: 0 !important;
          width: 100vw !important; height: 100vh !important;
          background: rgba(17, 17, 27, 0.95) !important;
          backdrop-filter: blur(16px) !important;
          z-index: 2147483647 !important;
          display: flex !important; align-items: center !important; justify-content: center !important;
          cursor: pointer !important; opacity: 0 !important; transition: opacity 0.3s ease !important;
        `;

        const img = document.createElement("img");
        img.id = "kat-immersive-img";
        img.decoding = "async";
        img.style.cssText = `
          /*  Reserves exactly 160px for arrows, and 150px for the slider/text */
          max-width: calc(100vw - 160px) !important;
          max-height: calc(100vh - 150px) !important;

          border-radius: 12px !important; box-shadow: 0 20px 50px rgba(0,0,0,0.8) !important;
          object-fit: contain !important; /* cursor handled dynamically now */
          transition: opacity 0.3s ease !important;
        `;
        img.addEventListener("click", (e) => e.stopPropagation());

        const btnStyle = `
          position: absolute !important; top: 50% !important; transform: translateY(-50%) !important;
          background: rgba(49, 50, 68, 0.7) !important; backdrop-filter: blur(8px) !important;
          color: #cdd6f4 !important; border: 1px solid rgba(255,255,255,0.1) !important;
          width: 50px !important; height: 50px !important; border-radius: 50% !important;
          cursor: pointer !important; font-size: 28px !important; display: flex !important;
          align-items: center !important; justify-content: center !important; z-index: 2147483648 !important;
        `;

        const btnPrev = document.createElement("button");
        btnPrev.innerHTML = "&#8249;";
        btnPrev.style.cssText = btnStyle + "left: 20px !important;";
        btnPrev.addEventListener("click", (e) => {
          e.stopPropagation();
          safeSendMessage({ type: "HOST_PLAYER_NAVIGATE", direction: "prev" });
        });

        const btnNext = document.createElement("button");
        btnNext.innerHTML = "&#8250;";
        btnNext.style.cssText = btnStyle + "right: 20px !important;";
        btnNext.addEventListener("click", (e) => {
          e.stopPropagation();
          safeSendMessage({ type: "HOST_PLAYER_NAVIGATE", direction: "next" });
        });

        const btnClose = document.createElement("button");
        btnClose.innerHTML = "&times;";
        btnClose.style.cssText = `
          position: absolute !important; top: 20px !important; right: 20px !important;
          background: rgba(243, 139, 168, 0.25) !important; color: #f38ba8 !important;
          border: 1px solid rgba(243, 139, 168, 0.4) !important; width: 44px !important; height: 44px !important;
          border-radius: 50% !important; cursor: pointer !important; font-size: 24px !important;
          display: flex !important; align-items: center !important; justify-content: center !important;
          z-index: 2147483648 !important;
        `;
        btnClose.addEventListener("click", (e) => {
          e.stopPropagation();
          overlay.click();
        });

        const spinner = document.createElement("div");
        spinner.id = "kat-immersive-spinner";
        spinner.style.cssText = `
          position: absolute !important; top: 50% !important; left: 50% !important;
          transform: translate(-50%, -50%) !important;
          width: 50px !important; height: 50px !important;
          border: 4px solid rgba(137, 180, 250, 0.15) !important;
          border-top: 4px solid #89b4fa !important;
          border-radius: 50% !important;
          animation: kat-spin 1s linear infinite !important;
          display: none !important; z-index: 2147483649 !important;
          pointer-events: none !important;
        `;

        const style = document.createElement("style");
        style.textContent = `
          @keyframes kat-spin { 0% { transform: translate(-50%, -50%) rotate(0deg); } 100% { transform: translate(-50%, -50%) rotate(360deg); } }
          .kat-zoom-slider { -webkit-appearance: none; appearance: none; width: 120px; height: 4px; background: rgba(255,255,255,0.2) !important; border-radius: 4px; outline: none; }
          .kat-zoom-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #89b4fa; cursor: pointer; transition: transform 0.2s; box-shadow: 0 0 10px rgba(137,180,250,0.5); }
          .kat-zoom-slider::-webkit-slider-thumb:hover { transform: scale(1.3); }
        `;

        //  Immersive Player Zoom Controls
        const zoomControls = document.createElement("div");
        zoomControls.id = "kat-immersive-zoom";
        zoomControls.style.cssText = `
          position: absolute !important; bottom: 30px !important; left: 50% !important; transform: translateX(-50%) !important;
          display: flex !important; align-items: center !important; gap: 12px !important;
          background: rgba(30, 30, 46, 0.7) !important; backdrop-filter: blur(12px) !important;
          padding: 8px 16px !important; border-radius: 20px !important; border: 1px solid rgba(255,255,255,0.12) !important;
          z-index: 2147483648 !important; box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important;
        `;
        zoomControls.addEventListener("click", e => e.stopPropagation());

        const zoomOut = document.createElement("span");
        zoomOut.innerHTML = "➖";
        zoomOut.style.cssText = "cursor: pointer; color: #a6adc8; font-size: 12px; user-select: none; transition: transform 0.2s;";
        zoomOut.onmouseover = () => zoomOut.style.transform = "scale(1.2)";
        zoomOut.onmouseout = () => zoomOut.style.transform = "scale(1)";

        const zoomSlider = document.createElement("input");
        zoomSlider.type = "range"; zoomSlider.min = "1"; zoomSlider.max = "5"; zoomSlider.step = "0.1"; zoomSlider.value = "1";
        zoomSlider.className = "kat-zoom-slider";

        const zoomIn = document.createElement("span");
        zoomIn.innerHTML = "➕";
        zoomIn.style.cssText = "cursor: pointer; color: #a6adc8; font-size: 12px; user-select: none; transition: transform 0.2s;";
        zoomIn.onmouseover = () => zoomIn.style.transform = "scale(1.2)";
        zoomIn.onmouseout = () => zoomIn.style.transform = "scale(1)";

        zoomControls.appendChild(zoomOut);
        zoomControls.appendChild(zoomSlider);
        zoomControls.appendChild(zoomIn);

        // Zoom Logic Engine
        let currentZoom = 1;
        img.style.cursor = "zoom-in";

        function setImmersiveZoom(scale, x = 50, y = 50) {
          scale = Math.max(1, Math.min(scale, 5));
          currentZoom = scale;
          zoomSlider.value = scale;

          if (scale > 1) {
            img.style.cursor = "zoom-out";
            img.style.transform = `scale(${scale})`;
            img.style.transformOrigin = `${x}% ${y}%`;
          } else {
            img.style.cursor = "zoom-in";
            img.style.transform = "scale(1)";
            img.style.transformOrigin = "center center";
          }
        }

        zoomSlider.addEventListener("input", (e) => setImmersiveZoom(parseFloat(e.target.value)));
        zoomOut.addEventListener("click", () => setImmersiveZoom(currentZoom - 0.5));
        zoomIn.addEventListener("click", () => setImmersiveZoom(currentZoom + 0.5));

        img.addEventListener("click", (e) => {
          e.stopPropagation();
          if (currentZoom > 1) {
            setImmersiveZoom(1);
          } else {
            const rect = img.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            setImmersiveZoom(2.5, x, y);
          }
        });

        img.addEventListener("mousemove", (e) => {
          if (currentZoom <= 1) return;
          const x = (e.clientX / window.innerWidth) * 100;
          const y = (e.clientY / window.innerHeight) * 100;
          img.style.transformOrigin = `${x}% ${y}%`;
        });

        // Expose reset function to the overlay so UPDATE_HOST_PLAYER can use it
        overlay.resetZoom = () => setImmersiveZoom(1);

        overlay.appendChild(style);
        overlay.appendChild(zoomControls);
        overlay.appendChild(spinner);
        overlay.appendChild(img);
        overlay.appendChild(btnPrev);
        overlay.appendChild(btnNext);
        overlay.appendChild(btnClose);
        document.body.appendChild(overlay);

        requestAnimationFrame(() => overlay.style.opacity = "1");

        overlay.addEventListener("click", () => {
          overlay.style.opacity = "0";
          document.body.style.removeProperty("overflow");
          document.documentElement.style.removeProperty("overflow");
          setTimeout(() => overlay.remove(), 300);
        });

        const keyHandler = (e) => {
          if (!document.getElementById("kat-immersive-overlay")) {
            document.removeEventListener("keydown", keyHandler);
            return;
          }
          if (e.key === "Escape") { e.preventDefault(); overlay.click(); }
          if (e.key === "ArrowRight") { e.preventDefault(); safeSendMessage({ type: "HOST_PLAYER_NAVIGATE", direction: "next" }); }
          if (e.key === "ArrowLeft") { e.preventDefault(); safeSendMessage({ type: "HOST_PLAYER_NAVIGATE", direction: "prev" }); }
        };
        document.addEventListener("keydown", keyHandler);

        let startX = 0;
        overlay.addEventListener("touchstart", (e) => startX = e.changedTouches[0].screenX, { passive: true });
        overlay.addEventListener("touchend", (e) => {
          const endX = e.changedTouches[0].screenX;
          if (endX < startX - 50) safeSendMessage({ type: "HOST_PLAYER_NAVIGATE", direction: "next" });
          if (endX > startX + 50) safeSendMessage({ type: "HOST_PLAYER_NAVIGATE", direction: "prev" });
        }, { passive: true });

        let wheelThrottle = false;
        overlay.addEventListener("wheel", (e) => {
          e.preventDefault();
          if (wheelThrottle) return;
          wheelThrottle = true;
          setTimeout(() => wheelThrottle = false, 150);

          if (e.deltaY > 0) safeSendMessage({ type: "HOST_PLAYER_NAVIGATE", direction: "next" });
          else if (e.deltaY < 0) safeSendMessage({ type: "HOST_PLAYER_NAVIGATE", direction: "prev" });
        }, { passive: false });
      }

      document.getElementById("kat-immersive-img").src = msg.url;
      document.body.style.setProperty("overflow", "hidden", "important");
      document.documentElement.style.setProperty("overflow", "hidden", "important");
    }

    // ─── SWAP ENGINE (DOUBLE-BUFFERED) ──────────────────────────────────────
    if (msg.type === "UPDATE_HOST_PLAYER") {
      const img = document.getElementById("kat-immersive-img");
      const spinner = document.getElementById("kat-immersive-spinner");
      const overlay = document.getElementById("kat-immersive-overlay");

      if (overlay && overlay.resetZoom) overlay.resetZoom();

      if (img && spinner) {
        const thisLoadId = ++overlayLoadId;

        // Subtle opacity dip to register the click, instantly restored so the GIF stays clear
        img.style.opacity = "0.7";
        setTimeout(() => { if (img) img.style.opacity = "1"; }, 150);
        spinner.style.display = "block";

        bufferImg.onload = null;
        bufferImg.onerror = null;

        const finishLoad = () => {
          if (overlayLoadId !== thisLoadId) return;
          img.src = msg.url;
          img.style.opacity = "1";
          spinner.style.display = "none";
        };

        bufferImg.onload = finishLoad;
        bufferImg.onerror = finishLoad;
        bufferImg.src = msg.url;
      }
    }
  });

})(); // end IIFE

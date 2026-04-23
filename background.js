// background.js — KatFetch v1.0 Service Worker.

importScripts("utils.js");

const MAX_GIFS_PER_TAB = 500;

// ─── SESSION STATS ────────────────────────────────────────────────────────────
// NEW:
let sessionStats = { downloaded: 0, failed: 0, zipsCreated: 0 };

async function loadSessionStats() {
  try {
    const stored = await chrome.storage.session.get(["sessionStats", "activeZipTasks"]);
    if (stored.sessionStats) sessionStats = stored.sessionStats;

    // 👇 THE FIX: The Ghost Task Purge
    // If the Service Worker restarted, any previously running offscreen tasks are dead.
    // We MUST force this to 0 so the counter doesn't permanently lock up!
    activeZipTasks = 0;
    await saveZipTaskCount();
  } catch {}
}

async function saveSessionStats() {
  try {
    await chrome.storage.session.set({ sessionStats });
  } catch {}
}

async function saveZipTaskCount() {
  try {
    await chrome.storage.session.set({ activeZipTasks });
  } catch {}
}

loadSessionStats();

// ─── GIF VAULT ────────────────────────────────────────────────────────────────
const CACHE_BUST_PARAMS = new Set([
  "v","ver","version","_","cb","cache","t","ts","timestamp",
  "nocache","bust","refresh","r","rand","random","rev","revision","hash",
]);

function canonicalGifUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    for (const key of [...u.searchParams.keys()]) {
      if (CACHE_BUST_PARAMS.has(key.toLowerCase())) u.searchParams.delete(key);
    }
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.toString();
  } catch {
    return rawUrl;
  }
}

const gifVault = new Map();

chrome.webRequest.onCompleted.addListener(
  gifRequestListener,
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

function gifRequestListener(details) {
  if (details.tabId < 0) return;
  const url = details.url || "";
  const ct = (details.responseHeaders || [])
    .find((h) => h.name.toLowerCase() === "content-type")?.value || "";
  const isGif =
    ct.includes("image/gif") ||
    url.toLowerCase().includes(".gif") ||
    url.toLowerCase().includes("format=gif") ||
    url.toLowerCase().includes("type=gif");
  if (!isGif) return;

  if (!gifVault.has(details.tabId)) gifVault.set(details.tabId, new Map());
  // 👇 THE ENTERPRISE FIX: Prevent infinite memory growth across tabs
  if (gifVault.size > 50) {
    // If the user has more than 50 active tabs tracked, delete the oldest one
    const oldestTabId = gifVault.keys().next().value;
    gifVault.delete(oldestTabId);
  }
  const tabGifs = gifVault.get(details.tabId);
  const canonical = canonicalGifUrl(url);
  if (tabGifs.has(canonical)) return;
  tabGifs.set(canonical, url);
  if (tabGifs.size > MAX_GIFS_PER_TAB) {
    tabGifs.delete(tabGifs.keys().next().value);
  }
}

chrome.tabs.onRemoved.addListener((tabId) => gifVault.delete(tabId));
chrome.tabs.onReplaced.addListener((addedId, removedId) => gifVault.delete(removedId));

// ─── CONTEXT MENU ─────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "katfetch-image", title: "🐾 Download with KatFetch", contexts: ["image"] });
    chrome.contextMenus.create({ id: "katfetch-page", title: "🐾 Fetch all images on this page", contexts: ["page", "action"] });

  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  // Check for the Page Sniffer FIRST, before checking for URLs!

  if (info.menuItemId === "katfetch-page") {

    // Attempt to open the Side Panel smoothly
    chrome.sidePanel.open({ windowId: tab?.windowId }).catch(() => {

      // 👇 THE FIX: If the Side Panel is blocked, spawn the gorgeous detached Popup Window!
      // We use popup.html instead of sidepanel.html to prevent the "Auto-Rescan" crash loop.
      chrome.windows.create({
        url: chrome.runtime.getURL("popup.html"),
        type: "popup",
        width: 420,
        height: 650,
        focused: true
      });
    });

    return;
  }

  const url = info.srcUrl || info.linkUrl;
  if (!url) return;
  if (!isValidUrl(url)) return;

  try {
    // NEW:
    const ext = guessExtFromUrl(url);

    let tabDomain = "kat";

    try {
      let targetUrl = tab?.url || "";

      // If right-clicked inside KatFetch's own panel/popup, fetch the actual web page URL
      if (targetUrl.startsWith("chrome-extension://")) {
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (activeTab && activeTab.url) {
          targetUrl = activeTab.url;
        }
      }

      if (targetUrl.startsWith("http")) {
        tabDomain = new URL(targetUrl).hostname.replace("www.", "").replace(/\./g, "_");
      }
    } catch {}

    await chrome.downloads.download({
      url: url,
      filename: `KatFetch/${resolveFilename(null, { domain: tabDomain, index: 1, ext })}`,
    });

    sessionStats.downloaded++;
    await saveSessionStats();
  } catch {
    sessionStats.failed++;
    await saveSessionStats();
  }
});

// ─── VALIDATION ───────────────────────────────────────────────────────────────
function isValidUrl(url) {
  if (!url || typeof url !== "string") return false;
  const safeData = [
    "data:image/png;", "data:image/jpeg;", "data:image/webp;",
    "data:image/gif;", "data:image/avif;", "data:image/svg+xml;",
  ];
  if (safeData.some((t) => url.startsWith(t))) {
    if (url.length > 5_000_000) return false;
    return true;
  }
  if ((url.startsWith("https://") || url.startsWith("http://")) && url.length <= 4096) {
    return true;
  }
  return false;
}


// NEW:
// ─── OFFSCREEN SETUP ──────────────────────────────────────────────────────────
let offscreenReady = null;

async function setupOffscreenDocument(path) {
  if (offscreenReady) return offscreenReady;
  offscreenReady = (async () => {
    if (await chrome.offscreen.hasDocument()) return;
    await chrome.offscreen.createDocument({
      url: path,
      reasons: ["BLOBS"],
      justification: "Generate and download large ZIP archives without Base64 memory leaks",
    });
  })();
  try {
    await offscreenReady;
  } finally {
    offscreenReady = null;
  }
}

// ─── ZIP CALLBACK REGISTRY & RACE CONDITION FIX ──────────────────────────────
const pendingZipCallbacks = new Map();
let zipTokenCounter = 0;
let activeZipTasks = 0; // Persisted to session storage to survive SW restarts

//  Smart ZIP Queue Engine with Dedicated Lock
const zipQueue = [];
let isQueueRunning = false; //  We use a dedicated lock now!

async function processZipQueue() {
  if (isQueueRunning || zipQueue.length === 0) return;
  isQueueRunning = true; //  Lock the queue

  const msg = zipQueue.shift();
  activeZipTasks++;
  await saveZipTaskCount();
  await setupOffscreenDocument("offscreen.html");
  const token = ++zipTokenCounter;

  const timer = setTimeout(() => {
    pendingZipCallbacks.delete(token);
    activeZipTasks = Math.max(0, activeZipTasks - 1);
    saveZipTaskCount();
    if (activeZipTasks === 0) chrome.offscreen.closeDocument().catch(() => {});

    isQueueRunning = false; // Unlock
    processZipQueue(); // Move to next in queue
  }, 300_000);

  const resolve = (res) => {
    // Alert the UI (If the KatFetch panel happens to be open)
    if (res && res.success) {
       chrome.runtime.sendMessage({ type: "TOAST", message: `✅ Batch Complete! ${res.downloaded} zipped.`, style: "success" }).catch(()=>{});

       // Alert the Operating System (So you know when it finishes while browsing other tabs!)
       chrome.notifications.create({
         type: "basic",
         iconUrl: "icons/logo_128.png",
         title: "KatFetch: ZIP Complete ✅",
         message: `Successfully packaged ${res.downloaded} images.`
       });

    } else if (res) {
       chrome.runtime.sendMessage({ type: "TOAST", message: `❌ Batch Failed: ${res.error}`, style: "error" }).catch(()=>{});

       // Alert the Operating System about the Failure
       chrome.notifications.create({
         type: "basic",
         iconUrl: "icons/logo_128.png",
         title: "KatFetch: ZIP Failed ❌",
         message: res.error || "Network error or all images were blocked."
       });
    }

    isQueueRunning = false; // 👈 Unlock
    processZipQueue(); // Kick off the next one instantly!
  };

  pendingZipCallbacks.set(token, { resolve, timer });

  chrome.runtime.sendMessage({
    type: "DOWNLOAD_ZIP_OFFSCREEN",
    token,
    urls: msg.urls,
    prefix: msg.domain || "kat",
    filenameTemplate: msg.filenameTemplate
  });
}

// ─── DOWNLOAD STATE TRACKER (For Popup Recovery) ──────────────
let activeDownloadState = null;

// ─── MESSAGE HUB ──────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
// 👇 THE FIX: Listen to the progress messages and save them globally
  if (msg.type === "PROGRESS") {
    activeDownloadState = { phase: "downloading", current: msg.current, total: msg.total };
  }
  if (msg.type === "PROGRESS_ZIPPING") {
    if (activeDownloadState) activeDownloadState.phase = "zipping";
  }
  if (msg.type === "UPDATE_STATS_ZIP" || msg.type === "ZIP_ERROR") {
    activeDownloadState = null; // Clear it when finished
  }
  if (msg.type === "GET_DL_STATE") {
    sendResponse(activeDownloadState); // Give the state to the new popup
    return false;
  }

  if (msg.type === "HOST_PLAYER_NAVIGATE") {
  // Only relay if coming from the content script, never relay from extension pages
    if (sender.frameId === 0 && sender.tab) {
      chrome.runtime.sendMessage(msg).catch(() => {});
    }
    sendResponse({ ok: true });
    return false;
  }
  if (sender.id !== chrome.runtime.id) return false;

  //  FETCH_FOR_CLIPBOARD: Bypasses CORS for extension origin
  if (msg.type === "FETCH_FOR_CLIPBOARD") {
    fetch(msg.url)
      .then(r => r.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({ ok: true, dataUrl: reader.result, mimeType: blob.type });
        };
        reader.readAsDataURL(blob);
      })
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  // GET_GIF_VAULT
  if (msg.type === "GET_GIF_VAULT") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      try {
        if (!tab) { sendResponse({ gifs: [] }); return; }
        const tabGifs = gifVault.get(tab.id);
        sendResponse({ gifs: tabGifs ? Array.from(tabGifs.values()) : [] });
      } catch {
        sendResponse({ gifs: [] });
      }
    });
    return true;
  }

  // GET_STATS
  if (msg.type === "GET_STATS") {
    sendResponse(sessionStats);
    return false;
  }

  // UPDATE_STATS_ZIP (from offscreen)
  if (msg.type === "UPDATE_STATS_ZIP") {
    const cb = pendingZipCallbacks.get(msg.token);

    // 👇 THE ARCHITECT FIX: Self-Healing Amnesia Guard
    if (cb) {
      clearTimeout(cb.timer);
      pendingZipCallbacks.delete(msg.token);
    } else {
      console.warn("KatFetch: Service Worker amnesia recovered! Saving orphaned ZIP.");
    }

    // Proceed with the download regardless of whether 'cb' exists!
    chrome.downloads.download({ url: msg.zipUrl, filename: msg.filename })
      .then((dlId) => {
        let downloadStarted = false;

        const zipDownloadListener = (delta) => {
          if (delta.id !== dlId) return;

          if (!downloadStarted && delta.state?.current === "in_progress") {
            downloadStarted = true;
            chrome.runtime.sendMessage({ type: "REVOKE_BLOB", url: msg.zipUrl }).catch(() => {});
          }

          if (delta.state && delta.state.current !== "in_progress") {
            chrome.downloads.onChanged.removeListener(zipDownloadListener);

            if (!downloadStarted) {
              chrome.runtime.sendMessage({ type: "REVOKE_BLOB", url: msg.zipUrl }).catch(() => {});
            }

            // NEW:
            activeZipTasks = Math.max(0, activeZipTasks - 1);
            saveZipTaskCount();
            if (activeZipTasks === 0) {
              chrome.offscreen.closeDocument().catch(() => {});
            }
          }
        };
        chrome.downloads.onChanged.addListener(zipDownloadListener);

        sessionStats.downloaded += msg.downloaded;
        sessionStats.failed += msg.failed;
        sessionStats.zipsCreated++;
        saveSessionStats();

        // Only resolve if we actually have the callback
        if (cb) cb.resolve({ success: true, downloaded: msg.downloaded, failed: msg.failed });
      })
      .catch((err) => {
        sessionStats.failed++;
        saveSessionStats();

        chrome.runtime.sendMessage({ type: "REVOKE_BLOB", url: msg.zipUrl }).catch(() => {});

        // 👇 THE FIX: Bulletproof the catch block!
        activeZipTasks = Math.max(0, activeZipTasks - 1);
        saveZipTaskCount();
        if (activeZipTasks === 0) {
          chrome.offscreen.closeDocument().catch(() => {});
        }

        if (cb) cb.resolve({ success: false, error: err.message });
      });


    chrome.runtime.sendMessage({ type: "HIDE_PROGRESS" }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  // ZIP_ERROR (from offscreen)
  if (msg.type === "ZIP_ERROR") {
    const cb = pendingZipCallbacks.get(msg.token);
    if (cb) {
      clearTimeout(cb.timer);
      pendingZipCallbacks.delete(msg.token);
      sessionStats.failed++;
      saveSessionStats();

      // NEW:
      activeZipTasks = Math.max(0, activeZipTasks - 1);
      saveZipTaskCount();
      if (activeZipTasks === 0) {
        chrome.offscreen.closeDocument().catch(() => {});
      }
      cb.resolve({ success: false, error: msg.error });
    }

    chrome.runtime.sendMessage({ type: "HIDE_PROGRESS" }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  // DOWNLOAD_IMAGES
  if (msg.type === "DOWNLOAD_IMAGES") {
    if (!Array.isArray(msg.urls) || msg.urls.length === 0) {
      sendResponse({ success: false, error: "No URLs provided" });
      return false;
    }
    handleDownloadImages(msg, sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  // FALLTHROUGH
  sendResponse({ ok: false, error: "unknown message type" });
  return false;
});

// ─── DOWNLOAD HANDLER ─────────────────────────────────────────────────────────
async function handleDownloadImages(msg, sendResponse) {
  try {
    const totalUrls = msg.urls.length;
    const prefix = msg.domain || "kat";
    const useZip = msg.zipMode !== false;

    // NON-ZIP PATH (INSTANT DOWNLOAD)
    if (!useZip) {
      // 👇 THE FIX: Instantly unlock the UI for Non-ZIP downloads too!
      sendResponse({ success: true, instant: true });

      // Run the heavy downloading in the background asynchronously
      (async () => {
        let success = 0, fail = 0;
        for (let i = 0; i < totalUrls; i++) {
          const url = msg.urls[i];
          if (!isValidUrl(url)) { fail++; continue; }

          try {
            const ext = guessExtFromUrl(url);
            const safeName = resolveFilename(msg.filenameTemplate, { domain: prefix, index: success + 1, ext });
            await chrome.downloads.download({
              url: url,
              filename: `KatFetch/${safeName}`,
            });

            success++;
            sessionStats.downloaded++;
            chrome.runtime.sendMessage({ type: "PROGRESS", current: success, total: totalUrls }).catch(() => {});

          } catch {
            fail++;
            sessionStats.failed++;
          }
        }
        await saveSessionStats();

        // Clear global state and alert the UI that the batch is done
        activeDownloadState = null;
        chrome.runtime.sendMessage({ type: "HIDE_PROGRESS" }).catch(() => {});
        chrome.runtime.sendMessage({ type: "TOAST", message: `✅ Done! ${success} saved${fail ? `, ${fail} failed` : ""}.`, style: "success" }).catch(()=>{});
      })();
      return;
    }

    // ZIP PATH
    // 👇 THE FIX: Check if it's the first batch to fix the 'Position 0' bug!
    const wasEmpty = (zipQueue.length === 0 && !isQueueRunning);
    zipQueue.push(msg);
    processZipQueue();

    if (wasEmpty) {
      sendResponse({ success: true, instantQueue: true });
    } else {
      sendResponse({ success: true, queued: true, pending: zipQueue.length });
    }

  } catch (err) {
    sessionStats.failed++;
    await saveSessionStats();
    sendResponse({ success: false, error: err.message });
  }
}

// offscreen.js — KatFetch v1.0 (offscreen document for ZIP generation)

const TIMEOUT_MS = 8000;
const MAX_RETRIES = 1;

// ─── CONCURRENCY SEMAPHORE ──────────────────────────────────────────
const MAX_CONCURRENT = 10;
let   activeFetches  = 0;
const fetchQueue     = [];

function acquireFetchSlot() {
  return new Promise(resolve => {
    if (activeFetches < MAX_CONCURRENT) { activeFetches++; resolve(); }
    else fetchQueue.push(resolve);
  });
}
function releaseFetchSlot() {
  activeFetches--;
  if (fetchQueue.length > 0) { activeFetches++; fetchQueue.shift()(); }
}

// ───  PER-DOMAIN RATE LIMITER ────────────────────────────────────────
const domainLastFetch = new Map();
async function waitForDomainSlot(url) {
  let host = "unknown";
  try { host = new URL(url).hostname; } catch {}
  const gap = Math.max(0, (domainLastFetch.get(host) || 0) + 100 - Date.now());
  if (gap > 0) await new Promise(r => setTimeout(r, gap));
  domainLastFetch.set(host, Date.now());
}

async function rateLimitedFetch(url, attempt = 0) {
  await acquireFetchSlot();
  try {
    await waitForDomainSlot(url);
    return await fetchWithTimeout(url, attempt);
  } finally {
    releaseFetchSlot();
  }
}

// ───  DATA URI SIZE GUARD ────────────────────────────────────────────
const DATA_URI_MAX_LEN = 5_000_000; // ~3.75MB decoded

function isValidUrl(url) {
  if (!url || typeof url !== "string") return false;
  const safeData = [
    "data:image/png;","data:image/jpeg;","data:image/webp;",
    "data:image/gif;","data:image/avif;","data:image/svg+xml;"
  ];
  if (safeData.some(t => url.startsWith(t))) {
    return url.length <= DATA_URI_MAX_LEN; // Issue 7 fix: reject oversized data URIs
  }
  if ((url.startsWith("https://") || url.startsWith("http://")) && url.length <= 4096) return true;
  return false;
}

async function fetchWithTimeout(url, attempt = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.blob();
  } catch (err) {
    clearTimeout(timer);
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      return fetchWithTimeout(url, attempt + 1);
    }
    throw err;
  }
}

// ─── MESSAGE HANDLER ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "REVOKE_BLOB") {
    URL.revokeObjectURL(msg.url);
    return;
  }

  if (msg.type !== "DOWNLOAD_ZIP_OFFSCREEN") return;

  (async () => {
    try {
      const zip            = new JSZip();
      let   success        = 0, fail = 0;
      const totalUrls      = msg.urls.length;
      const ZIP_BUDGET     = 100_000_000; // 100 MB hard cap — protects Chromebook RAM
      let   totalBytes     = 0;
      let   budgetExceeded = false;

      await Promise.allSettled(msg.urls.map(async (url, actualIdx) => {
        if (!isValidUrl(url)) { fail++; return; }
        if (budgetExceeded) { fail++; return; }
        try {
          let blob = await rateLimitedFetch(url);

          totalBytes += blob.size;
          if (totalBytes > ZIP_BUDGET) {
            budgetExceeded = true;
            blob = null;
            fail++;
            return;
          }

          const ext = getExtensionStrict(blob.type, url);
          const customName = resolveFilename(msg.filenameTemplate, { domain: msg.prefix, index: actualIdx + 1, ext });

          zip.file(customName, blob);
          blob = null;
          success++;
          chrome.runtime.sendMessage({
            type: "PROGRESS", current: success, total: totalUrls
          }).catch(() => {});
        } catch {
          fail++;
        }
      }));

      //  The Zero-Success Guard
      // If the internet drops and absolutely nothing downloaded, abort the ZIP creation!
      if (success === 0) {
        throw new Error("Network disconnected or all image downloads failed.");
      }

      chrome.runtime.sendMessage({ type: "PROGRESS_ZIPPING" }).catch(() => {});

      const zipBlob = await zip.generateAsync({ type: "blob" });

      //  memory-safe pointer — NOT Base64.
      //  URL passed to background.js which calls revokeAfterDownload().
      const zipUrl   = URL.createObjectURL(zipBlob);

      // Build precise date and time strings for the ZIP container
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
      const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

      // Create a totally unique, sortable filename
      const filename = `KatFetch/${msg.prefix}_${success}_Images_${dateStr}_${timeStr}.zip`;

      chrome.runtime.sendMessage({
        type:       "UPDATE_STATS_ZIP",
        token:      msg.token,
        zipUrl,
        filename,
        downloaded: success,
        failed:     fail
      });

    } catch (err) {
      chrome.runtime.sendMessage({
        type:  "ZIP_ERROR",
        token: msg.token,
        error: err.message
      });
    }
  })();
});

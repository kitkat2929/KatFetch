# 🐾 KatFetch — Chrome Extension

> Bulk image & GIF downloader with smart filtering, ZIP packing, and a persistent side panel. Built with vanilla JS + Chrome MV3.

![Version](https://img.shields.io/badge/version-1.0-blue) ![Manifest](https://img.shields.io/badge/manifest-v3-green) ![License](https://img.shields.io/badge/license-MIT-purple)

---

## Features

- **Fetch all images & GIFs** on any webpage — including lazy-loaded, dynamically injected, and srcset-responsive ones
- **Hidden GIF vault** — intercepts network-level GIF/mp4 requests via `webRequest` that the DOM scanner can't see
- **Smart filters** — filter by format (PNG, JPG, WEBP, GIF, SVG, AVIF, BMP, ICO), size tier (HD+, SD, LQ), and orientation (landscape, portrait, square)
- **Regex-powered search** — filter URLs with plain text or full regular expressions, 250ms debounced
- **Dynamic Grid Scaling** — Premium slider to adjust thumbnail density (1-5 columns) in real-time depending on your screen size
- **Bulk ZIP download** — fetches images and packages them as a named, timestamped ZIP archive
- **ZIP queue** — queue multiple batches while browsing; each runs sequentially without blocking the UI
- **Desktop notifications** — OS-level notification fires when a ZIP batch completes, even in a background tab
- **Side panel mode** — stays open as you browse, auto-rescans on tab change without losing your selections
- **Smart Context Menu** — Right-click the extension icon to instantly open the Side Panel or a detached scanner window, intelligently targeting your active browser tab
- **Carousel preview** — click any image for full-res preview; keyboard arrows, mouse wheel, and swipe supported
- **Background Tab Previews** — Open full-size images in new background tabs directly from the carousel without losing focus on the popup
- **Zoom & pan** — click the preview image to quickly zoom 2.5×, or use the premium granular zoom slider (up to 5x) in the Immersive Host Player. Drag your mouse to pan around zoomed images smoothly.
- **Select Best** — auto-selects highest-resolution images by pixel area above a calculated quality threshold
- **Multi-select** — Shift-click for range selection; master checkbox; invert; sort by size
- **Double-click to select** — single click opens preview, double-click toggles selection
- **Download spam guard** — confirmation dialog if attempting >20 individual file downloads without ZIP
- **Copy to clipboard** — copy a single image as raw pixels, or multiple as a plain-text URL list
- **Custom filename templates** — use `{domain}`, `{date}`, `{time}`, `{index}`, `{ext}` variables
- **Google Images support** — extracts original full-resolution URLs from Google image search results
- **Canvas snapshot** — captures visible canvas elements as thumbnails (WebGL, Three.js, games)
- **Stylesheet GIF extraction** — scans CSS stylesheet rules for background GIFs beyond inline styles
- **Memory-safe** — uses `URL.createObjectURL` (not base64) so large ZIPs don't crash the browser
- **Popup state recovery** — if you close and reopen the popup during a download, the progress bar restores

---

## Where KatFetch Works Best

KatFetch is optimised for sites with **open CDNs** that allow direct image access. Results vary by platform:

| Platform | Preview | Download | Notes |
|---|---|---|---|
| Google Images | ✅ | ✅ | Full-res URL extraction from page state |
| Pinterest | ✅ | ✅ | Open CDN, srcset-aware |
| Unsplash / Pexels / Pixabay | ✅ | ✅ | Dedicated thumbnail handler |
| Giphy / Tenor | ✅ | ✅ | Dedicated GIF thumbnail swap |
| Reddit (i.redd.it images) | ✅ | ✅ | Open CDN |
| Tumblr | ✅ | ✅ | Open CDN |
| Wikipedia / Wikimedia | ✅ | ✅ | Fully open |
| DeviantArt | ✅ | ✅ | Works well |
| Any news / blog article | ✅ | ✅ | Universal img tag support |
| E-commerce product pages | ✅ | ✅ | srcset extraction finds HD variants |
| **Imgur** | 🔒 Blocked | ⚠️ Throttled | Imgur enforces CDN hotlink protection and rate-limits bulk downloads. Cards show "Blocked Preview". Individual downloads may be very slow. |
| Instagram / Facebook | ⚠️ Session-scoped | ⚠️ Expires | CDN URLs require active session cookies and expire within hours. |
| Netflix / streaming | ❌ | ❌ | Content loaded via Encrypted Media Extensions, no plain image tags. |

> **Imgur note:** Imgur has enforced hotlink blocking since 2017 and CDN-level throttling on bulk requests. KatFetch correctly detects Imgur images and shows them as "Blocked Preview" cards — the URL is still captured and the download button still works, but Imgur will slow individual downloads to near-zero speed for bulk attempts. This is Imgur's intentional policy, not a bug.

---

## Architecture

observer.js       — Content script injected into every page.
Watches DOM mutations, extracts all image types,
harvests GIFs from CSS stylesheets and canvas elements.

background.js     — MV3 Service Worker.
Manages the GIF vault (webRequest interception),
ZIP queue, offscreen document lifecycle,
chrome.downloads API, and OS notifications.

offscreen.js      — Offscreen document for ZIP generation.
Runs JSZip outside the SW with concurrency semaphore,
per-domain rate limiting, and 100MB budget guard.

shared.js         — Unified UI engine (1500+ lines).
Used by both popup and side panel.
Handles scan, filter, render, carousel, download,
selection, progress recovery, and tab sync.

shared.css        — Catppuccin Mocha glassmorphism theme with premium UI elements.
utils.js          — Shared utilities: resolveFilename, getExtensionStrict, guessExtFromUrl.
popup.html/js     — 380px popup, includes "◨ Dock" side panel button.
sidepanel.html/js — Full-height persistent side panel with tab-change detection.

---

## Install (Development)

1. Clone or download this repository
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** → select this folder
5. Pin KatFetch from the extensions toolbar

**Requires:** `jszip.min.js` in the extension root folder.
Download from [stormcdn.net/jszip.min.js](https://stormcdn.net/jszip.min.js) or the [JSZip releases page](https://github.com/Stuk/jszip/releases).

---

## Usage

### Basic scan
1. Navigate to any webpage with images
2. Click the KatFetch extension icon
3. Click **🔍 Fetch Images**
4. Use format pills (PNG, JPG, GIF…) or the size/orientation dropdowns to filter
5. Adjust the **Thumbnail Size** slider in the Advanced menu to view more or fewer images per row
6. Select images (click to preview, double-click to select, Shift-click for range)
7. Toggle **📦 Package as ZIP** and click **Download Selected**

### Side panel mode
- Click **◨ Dock** in the popup to open the side panel
- The panel stays open as you browse — each tab change auto-rescans
- Queue multiple ZIP batches while browsing other sites; notifications alert you when each finishes

### Custom filename templates
In **⚙️ Advanced**, set a naming rule using these variables:

| Variable | Example output |
|---|---|
| `{domain}` | `reddit_com` |
| `{date}` | `20260421` |
| `{time}` | `143022` |
| `{index}` | `1`, `2`, `3`… |
| `{index:4}` | `0001`, `0002`… |
| `{ext}` | `jpg`, `png`, `gif` |

Example template: `{domain}_{date}_{index:3}.{ext}` → `reddit_com_20260421_001.jpg`

### Keyboard shortcuts
| Key | Action |
|---|---|
| `Click` image | Open carousel preview |
| `Double-click` image | Toggle selection |
| `Shift+Click` checkbox | Range select |
| `←` / `→` in carousel | Navigate images |
| `Scroll wheel` in carousel | Navigate images |
| `Escape` | Close carousel |
| `Click` image in carousel | Zoom 2.5× / zoom out |
| `Ctrl+Enter` | Download selected (when button is visible) |
| `Enter` on focused image | Open carousel |
| `Enter` on focused checkbox | Toggle selection |
| `Enter` on focused ZIP toggle | Toggle Package as ZIP |

---

## Known Limitations

- **Imgur:** Preview blocked and bulk downloads throttled by Imgur's CDN. Individual downloads work but may be slow. This cannot be worked around without violating Imgur's ToS.
- **Instagram / Facebook:** CDN URLs are session-scoped and expire. Scan and download immediately after loading the page for best results.
- **Paywalled content:** KatFetch downloads the URL the browser has access to. If you cannot view the full image in your browser, the extension cannot download it.
- **srcset best-only:** For responsive images with multiple srcset candidates, only the highest-resolution variant is extracted per image. Art-directed crops at lower breakpoints are not stored.
- **ZIP queue in memory:** The ZIP queue lives in service worker memory. If Chrome terminates the SW between batches (rare but possible after extended inactivity), queued-but-not-started batches are lost. Active downloads are unaffected.
- **Canvas downloads:** Canvas snapshots are saved as 200px JPEG thumbnails to prevent out-of-memory crashes on WebGL/Three.js pages. Full-resolution canvas export is not supported.

---

## Privacy & Policy

- **No data collection.** KatFetch operates entirely locally in your browser.
- **No external servers.** Images are fetched directly from their source CDN. Nothing is proxied or logged by this extension.
- **No analytics.** No usage data, crash reports, or telemetry is sent anywhere.
- `<all_urls>` host permission is required to intercept network-level GIF requests via `webRequest` and to fetch images from any domain the user visits.
- `notifications` permission is used only to display OS-level alerts when a ZIP batch completes.

**Important:** Only download images and media you have the legal right to use. Respect copyright law and each website's terms of service.

---

## Permissions Explained

| Permission | Why it's needed |
|---|---|
| `activeTab` | Read the URL of the current tab to name files by domain |
| `scripting` | Inject `observer.js` into pages that didn't load it automatically |
| `downloads` | Trigger file downloads via `chrome.downloads.download()` |
| `contextMenus` | Right-click → "Download with KatFetch" on any image |
| `storage` | Persist user settings (ZIP mode, filename template, advanced panel state, grid scale) |
| `sidePanel` | Enable the persistent side panel |
| `offscreen` | Run JSZip in an offscreen document to build ZIPs without blocking the UI |
| `webRequest` | Intercept network responses to detect GIFs loaded as mp4/video-gif |
| `notifications` | Show an OS notification when a ZIP batch finishes in the background |
| `<all_urls>` | Fetch images from any domain the user visits for ZIP compilation |

---

## License

MIT — free to use, fork, and modify.

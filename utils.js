// utils.js — KatFetch Shared Utilities

// eslint-disable-next-line no-unused-vars
function resolveFilename(template, { domain, index, ext }) {
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  let name = template || "{domain}_{date}_{time}_{index}.{ext}";

  if (!name.includes("{index")) {
    name += "_{index}";
  }

  name = name.replace(/\{domain\}/gi, domain)
             .replace(/\{date\}/gi, dateStr)
             .replace(/\{time\}/gi, timeStr)
             .replace(/\{index:(\d+)\}/gi, (_, len) => pad(index, parseInt(len)))
             .replace(/\{index\}/gi, String(index))
             .replace(/\{ext\}/gi, ext);

  if (!name.toLowerCase().endsWith("." + ext)) name += "." + ext;
  name = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");

  return name;
}

// eslint-disable-next-line no-unused-vars
function getExtensionStrict(mimeType, url) {
  const mime = mimeType ? mimeType.toLowerCase() : "";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "image/avif") return "avif";
  if (mime === "image/svg+xml") return "svg";
  if (mime === "image/bmp" || mime === "image/x-ms-bmp") return "bmp";
  if (mime === "image/x-icon" || mime === "image/vnd.microsoft.icon") return "ico";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";

  const lower = url.toLowerCase();
  if (lower.includes(".png")) return "png";
  if (lower.includes(".webp")) return "webp";
  if (lower.includes(".gif")) return "gif";
  if (lower.includes(".avif")) return "avif";
  if (lower.includes(".svg")) return "svg";
  if (lower.includes(".bmp")) return "bmp";
  if (lower.includes(".ico")) return "ico";

  return "jpg"; // Default fallback
}

// eslint-disable-next-line no-unused-vars
function guessExtFromUrl(url) {
  if (!url) return "jpg";
  if (url.startsWith("data:image/")) return url.split(";")[0].split("/")[1] || "jpg";
  const u = url.toLowerCase();
  if (u.includes("format=png")  || u.includes("fm=png")  || u.includes(".png"))  return "png";
  if (u.includes("format=webp") || u.includes("fm=webp") || u.includes(".webp")) return "webp";
  if (u.includes("format=gif")  || u.includes("fm=gif")  || u.includes(".gif"))  return "gif";
  if (u.includes("format=avif") || u.includes("fm=avif") || u.includes(".avif")) return "avif";
  if (u.includes("format=svg")  || u.includes("fm=svg")  || u.includes(".svg"))  return "svg";
  if (u.includes(".bmp")) return "bmp";
  if (u.includes(".ico")) return "ico";
  return "jpg";
}

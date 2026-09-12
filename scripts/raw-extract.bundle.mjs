// src/core/image/rawExtractor.ts
var RAW_EXTENSIONS = [
  "arw",
  "dng",
  "nef",
  "cr2",
  "cr3",
  "raf",
  "orf",
  "rw2",
  "pef",
  "srw",
  "mrw",
  "erf",
  "rwl",
  "nrw",
  "raw",
  "kdc",
  "dcr",
  "mos",
  "iiq",
  "3fr"
];
var RAW_EXT_SET = new Set(RAW_EXTENSIONS);
function isRawFileName(name) {
  if (!name) return false;
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return !!m && RAW_EXT_SET.has(m[1].toLowerCase());
}
function asciiAt(b, off, s) {
  if (off + s.length > b.length) return false;
  for (let i = 0; i < s.length; i++) if (b[off + i] !== s.charCodeAt(i)) return false;
  return true;
}
function detectRawKind(b) {
  if (b.length < 12) return null;
  const leTiff = b[0] === 73 && b[1] === 73 && b[2] === 42 && b[3] === 0;
  const beTiff = b[0] === 77 && b[1] === 77 && b[2] === 0 && b[3] === 42;
  if (leTiff || beTiff) return "tiff";
  if (asciiAt(b, 0, "FUJIFILM")) return "fuji-raf";
  if (asciiAt(b, 4, "ftyp")) return "bmff";
  return null;
}
function walkJpeg(b, start) {
  const n = b.length;
  let i = start + 2;
  let w = 0;
  let h = 0;
  let sof = false;
  while (i + 1 < n) {
    if (b[i] !== 255) {
      i++;
      continue;
    }
    while (i < n && b[i] === 255) i++;
    if (i >= n) return null;
    const marker = b[i];
    i++;
    if (marker === 217) return { end: i, w, h };
    if (marker === 218) {
      if (i + 2 > n) return null;
      const segLen = b[i] << 8 | b[i + 1];
      i += segLen;
      while (i + 1 < n) {
        if (b[i] === 255 && b[i + 1] !== 0 && !(b[i + 1] >= 208 && b[i + 1] <= 215) && b[i + 1] !== 255) {
          break;
        }
        i++;
      }
      continue;
    }
    if (marker === 216 || marker >= 208 && marker <= 215) continue;
    if (i + 2 > n) return null;
    const len = b[i] << 8 | b[i + 1];
    if (len < 2) return null;
    if (marker >= 192 && marker <= 207 && marker !== 196 && marker !== 200 && marker !== 204) {
      h = b[i + 3] << 8 | b[i + 4];
      w = b[i + 5] << 8 | b[i + 6];
      sof = true;
    }
    i += len;
  }
  return null;
}
function extractLargestEmbeddedJpeg(b) {
  const spans = [];
  for (let i = 0; i + 3 < b.length; i++) {
    if (b[i] === 255 && b[i + 1] === 216 && b[i + 2] === 255 && (b[i + 3] === 224 || b[i + 3] === 225 || b[i + 3] === 219 || b[i + 3] === 196 || b[i + 3] >= 192 && b[i + 3] <= 195 || b[i + 3] === 238)) {
      const r = walkJpeg(b, i);
      if (r && r.w > 0 && r.h > 0 && r.end - i >= 4096) {
        spans.push({ start: i, end: r.end, w: r.w, h: r.h });
        i = r.end - 1;
      }
    }
  }
  if (spans.length === 0) return null;
  spans.sort((a, c) => c.end - c.start - (a.end - a.start));
  const big = spans[0];
  return b.slice(big.start, big.end);
}
function extractRawPreview(b, fileName) {
  let kind = detectRawKind(b);
  if (!kind) {
    if (isRawFileName(fileName)) kind = "by-name";
    else return null;
  }
  const jpeg = extractLargestEmbeddedJpeg(b);
  if (!jpeg) return null;
  const dims = walkJpeg(jpeg, 0);
  return {
    jpeg,
    kind,
    width: dims?.w ?? 0,
    height: dims?.h ?? 0,
    tiff: kind === "tiff" ? b.slice() : null
  };
}
export {
  RAW_EXTENSIONS,
  detectRawKind,
  extractLargestEmbeddedJpeg,
  extractRawPreview,
  isRawFileName
};

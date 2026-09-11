import exifr from 'exifr';
import { extractTiffBytes, sniffFormat, type ImageFormat } from '../metadata/containerFormat';
import {
  formatAperture,
  formatDateTime,
  formatFocal,
  formatIso,
  formatShutter,
  friendlyCameraName,
  type ExifTextValues,
} from '../metadata/exifFormat';

// ============================================================
// 图像导入：格式嗅探、EXIF 提取、Orientation 1-8 校正、
// Adobe RGB 近似转 sRGB、预览降采样（最长边 2000px）
// ============================================================

export const PREVIEW_MAX_EDGE = 2000;

export interface ImageMeta {
  /** EXIF Orientation，1~8，缺省为 1 */
  orientation: number;
  /** 校正前原始宽/高 */
  origWidth: number;
  origHeight: number;
  colorSpace: 'srgb' | 'adobe-rgb' | 'unknown';
  /** 是否含 GPS（供 UI 提示导出将清除） */
  hasGps: boolean;
  /** 原始 TIFF 形式 EXIF（不含容器头），用于导出保真回写 */
  tiff: Uint8Array | null;
  format: ImageFormat;
  cameraText: string | null;
  // 拍摄参数字段（水印模板 / 信息展示用，移植自 camera-watermark）
  make: string;
  model: string;
  lens: string;
  values: ExifTextValues;
}

export interface DecodedImage {
  bitmap: ImageBitmap;
  meta: ImageMeta;
}

/** 从原始文件 buffer 解码出预览位图（已校正方向/色彩、已降采样） */
export async function decodeForPreview(buffer: ArrayBuffer): Promise<DecodedImage> {
  const bytes = new Uint8Array(buffer);
  const format = sniffFormat(bytes);
  if (!format) throw new Error('不支持的图片格式（仅支持 JPG / PNG / WebP）');

  const tiff = extractTiffBytes(bytes, format);
  const parsed = await safeParseExif(buffer);
  const orientation = normalizeOrientation(parsed?.Orientation);
  const hasGps = !!(parsed?.latitude && parsed?.longitude);
  const colorSpace = detectColorSpace(bytes, parsed);
  const values = buildTextValues(parsed);
  const cameraText = values.camera || null;

  // 关键：Electron 33 的 Chromium 中 createImageBitmap 会按 EXIF Orientation 自动定向
  // （实测显式传 imageOrientation:'none' 也无法关闭，横像素+orientation=8 直接解为正立竖图）。
  // 因此直接信任解码结果，绝不能再手动 applyOrientation，否则就是双重旋转（用户看到侧躺/倒置）。
  let bitmap = await createImageBitmap(new Blob([buffer]));
  // 浏览器已按 EXIF 定向，此即正向原始维度（固化前记录）
  const orientedW = bitmap.width;
  const orientedH = bitmap.height;

  // 总是经 OffscreenCanvas 重绘一遍：把浏览器自动定向结果固化为标准行序位图，
  // 与 WebGL UNPACK_FLIP_Y 的既有约定保持一致，同时完成可选降采样。
  bitmap = await redrawBitmap(bitmap, PREVIEW_MAX_EDGE);
  if (colorSpace === 'adobe-rgb') {
    bitmap = await convertAdobeRgbToSrgb(bitmap);
  }

  const meta: ImageMeta = {
    orientation,
    origWidth: orientedW,
    origHeight: orientedH,
    colorSpace,
    hasGps,
    tiff,
    format,
    cameraText,
    make: (parsed?.Make as string) ?? '',
    model: (parsed?.Model as string) ?? '',
    lens: (parsed?.LensModel as string) ?? '',
    values,
  };
  return { bitmap, meta };
}

/**
 * 全尺寸解码（导出 Worker 用）：方向校正 + 色彩转换，不降采样。
 * orientation/colorSpace 直接复用导入时解析的 meta，避免 Worker 再解析一次。
 */
export async function decodeFull(
  buffer: ArrayBuffer,
  meta: ImageMeta
): Promise<ImageBitmap> {
  // 同 decodeForPreview：Chromium 已自动 EXIF 定向，不再手动旋转（避免双重旋转）。
  // 同样经 Canvas 固化一次行序，保证导出与预览、WebGL 上屏方向一致。
  let bitmap = await redrawBitmap(await createImageBitmap(new Blob([buffer])), null);
  if (meta.colorSpace === 'adobe-rgb') {
    bitmap = await convertAdobeRgbToSrgb(bitmap);
  }
  return bitmap;
}

// ---------------- EXIF ----------------

interface ParsedExif {
  Orientation?: number;
  latitude?: number;
  longitude?: number;
  ColorSpace?: number;
  Make?: string;
  Model?: string;
  LensModel?: string;
  DateTimeOriginal?: Date | string;
  ISO?: number;
  FNumber?: number;
  ExposureTime?: number;
  FocalLength?: number;
  [k: string]: unknown;
}

async function safeParseExif(buffer: ArrayBuffer): Promise<ParsedExif | null> {
  try {
    return (await exifr.parse(buffer, {
      tiff: true,
      exif: true,
      gps: true,
      translateValues: false,
      reviveValues: false,
    })) as ParsedExif | null;
  } catch {
    return null;
  }
}

function normalizeOrientation(v: unknown): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : 1;
}

function detectColorSpace(bytes: Uint8Array, parsed: ParsedExif | null): ImageMeta['colorSpace'] {
  // 1. ICC profile 片段（JPEG APP2 / PNG iCCP / WebP ICCP）里出现 Adobe RGB 字样
  const head = bytes.subarray(0, Math.min(bytes.length, 1_000_000));
  const ascii = typeof TextDecoder !== 'undefined' ? new TextDecoder('ascii').decode(head) : '';
  if (/adobe\s*rgb/i.test(ascii)) return 'adobe-rgb';
  // 2. EXIF ColorSpace=1 即 sRGB
  if (parsed?.ColorSpace === 1) return 'srgb';
  if (parsed?.ColorSpace === 65535) return 'unknown';
  return 'unknown';
}

function buildTextValues(p: ParsedExif | null): ExifTextValues {
  const empty: ExifTextValues = {
    camera: '', make: '', model: '', shutter: '', aperture: '',
    iso: '', focal: '', lens: '', date: '', time: '',
  };
  if (!p) return empty;
  const { date, time } = formatDateTime(p.DateTimeOriginal as string | Date | undefined);
  const camera = friendlyCameraName(p.Make as string, p.Model as string);
  return {
    camera,
    make: (p.Make as string) ?? '',
    model: (p.Model as string) ?? '',
    shutter: formatShutter(p.ExposureTime),
    aperture: formatAperture(p.FNumber),
    iso: formatIso(p.ISO),
    focal: formatFocal(p.FocalLength),
    lens: (p.LensModel as string) ?? '',
    date,
    time,
  };
}

// ---------------- Orientation 1-8 ----------------

function swapDims(o: number): boolean {
  return o === 5 || o === 6 || o === 7 || o === 8;
}

export async function applyOrientation(
  source: ImageBitmap,
  orientation: number
): Promise<ImageBitmap> {
  if (orientation === 1) return source;
  const w = source.width;
  const h = source.height;
  const outW = swapDims(orientation) ? h : w;
  const outH = swapDims(orientation) ? w : h;
  const canvas = new OffscreenCanvas(outW, outH);
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;

  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, w, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, w, h); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, h); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, h, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, h, w); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, w); break;
    default: return source;
  }
  ctx.drawImage(source, 0, 0);
  return canvas.convertToBlob().then((blob) => createImageBitmap(blob));
}

// ---------------- 降采样 ----------------

/**
 * 经 OffscreenCanvas 重绘：把源位图固化为标准行序位图（行 0 = 视觉顶部），
 * 保证 WebGL UNPACK_FLIP_Y 行为确定；maxEdge 非空且超出时同步降采样。
 */
async function redrawBitmap(
  bitmap: ImageBitmap,
  maxEdge: number | null
): Promise<ImageBitmap> {
  const { width, height } = bitmap;
  let w = width;
  let h = height;
  if (maxEdge != null) {
    const longest = Math.max(width, height);
    if (longest > maxEdge) {
      const scale = maxEdge / longest;
      w = Math.max(1, Math.round(width * scale));
      h = Math.max(1, Math.round(height * scale));
    }
  }
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) return bitmap;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  const out = await createImageBitmap(canvas);
  bitmap.close();
  return out;
}

// ---------------- Adobe RGB(1998) -> sRGB 近似 ----------------

async function convertAdobeRgbToSrgb(bitmap: ImageBitmap): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return bitmap;
  ctx.drawImage(bitmap, 0, 0);
  const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // 反编码 Adobe RGB gamma 2.2
    const ar = Math.pow(d[i] / 255, 2.2);
    const ag = Math.pow(d[i + 1] / 255, 2.2);
    const ab = Math.pow(d[i + 2] / 255, 2.2);
    // Adobe RGB D65 -> XYZ
    const X = 0.5767309 * ar + 0.185554 * ag + 0.1881852 * ab;
    const Y = 0.2973769 * ar + 0.6273491 * ag + 0.0752741 * ab;
    const Z = 0.0270343 * ar + 0.0706872 * ag + 0.9911085 * ab;
    // XYZ -> linear sRGB
    let lr = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
    let lg = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
    let lb = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
    // sRGB gamma 编码
    d[i] = encSrgb(lr) * 255;
    d[i + 1] = encSrgb(lg) * 255;
    d[i + 2] = encSrgb(lb) * 255;
  }
  ctx.putImageData(img, 0, 0);
  const out = await createImageBitmap(canvas);
  bitmap.close();
  return out;
}

function encSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

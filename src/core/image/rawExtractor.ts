// ============================================================
// RAW 兼容：从相机 RAW 中提取内嵌的全尺寸 JPEG 预览。
//
// 路线（与「轻量、纯本地」一致，不引入 libraw/dcraw wasm）：
// 几乎所有相机 RAW（ARW/NEF/DNG/CR2/CR3/RAF/ORF/RW2/PEF…）都内嵌一张
// 全分辨率 JPEG（索尼 a7 系列内嵌图即传感器全像素）。扫描出其中「最大的
// 一张完整 JPEG」作为解码源，后续复用普通 JPEG 链路，零额外依赖、速度快。
//
// 已用真实索尼 ARW（7008×4672 全尺寸内嵌）验证 marker walk 正确。
// ============================================================

export type RawKind = 'tiff' | 'fuji-raf' | 'bmff' | 'by-name';

/** 常见 RAW 扩展名（小写、不含点） */
export const RAW_EXTENSIONS = [
  'arw', 'dng', 'nef', 'cr2', 'cr3', 'raf', 'orf', 'rw2', 'pef',
  'srw', 'mrw', 'erf', 'rwl', 'nrw', 'raw', 'kdc', 'dcr', 'mos', 'iiq', '3fr',
] as const;

const RAW_EXT_SET = new Set<string>(RAW_EXTENSIONS);

export function isRawFileName(name: string | null | undefined): boolean {
  if (!name) return false;
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return !!m && RAW_EXT_SET.has(m[1].toLowerCase());
}

function asciiAt(b: Uint8Array, off: number, s: string): boolean {
  if (off + s.length > b.length) return false;
  for (let i = 0; i < s.length; i++) if (b[off + i] !== s.charCodeAt(i)) return false;
  return true;
}

/** 按文件头签名识别 RAW 容器类型 */
export function detectRawKind(b: Uint8Array): RawKind | null {
  if (b.length < 12) return null;
  // TIFF 系：II*\0（小端）或 MM\0*（大端）——ARW/NEF/DNG/ORF/RW2/PEF/CR2
  const leTiff = b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00;
  const beTiff = b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a;
  if (leTiff || beTiff) return 'tiff';
  // 富士 RAF："FUJIFILMCCD-RAW "
  if (asciiAt(b, 0, 'FUJIFILM')) return 'fuji-raf';
  // ISO BMFF（CR3 / HEIF）：偏移 4 处为 'ftyp'
  if (asciiAt(b, 4, 'ftyp')) return 'bmff';
  return null;
}

interface JpegSpan {
  start: number;
  end: number;
  w: number;
  h: number;
}

/**
 * 从某个 SOI(FFD8) 做标准 JPEG marker walk，找到匹配 EOI，返回区间与 SOF 宽高。
 * 正确处理 SOS 后的熵数据（跳过填充/RSTn，遇下一个有效 marker 继续）。
 */
function walkJpeg(b: Uint8Array, start: number): { end: number; w: number; h: number } | null {
  const n = b.length;
  let i = start + 2;
  let w = 0;
  let h = 0;
  let sof = false;
  while (i + 1 < n) {
    if (b[i] !== 0xff) { i++; continue; }
    while (i < n && b[i] === 0xff) i++; // 跳过 0xFF 填充
    if (i >= n) return null;
    const marker = b[i]; i++;
    if (marker === 0xd9) return { end: i, w, h }; // EOI
    if (marker === 0xda) { // SOS：其后为熵数据
      if (i + 2 > n) return null;
      const segLen = (b[i] << 8) | b[i + 1];
      i += segLen;
      while (i + 1 < n) {
        if (
          b[i] === 0xff &&
          b[i + 1] !== 0x00 &&
          !(b[i + 1] >= 0xd0 && b[i + 1] <= 0xd7) &&
          b[i + 1] !== 0xff
        ) {
          break;
        }
        i++;
      }
      continue;
    }
    // standalone marker（SOI / RSTn）无长度段
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (i + 2 > n) return null;
    const len = (b[i] << 8) | b[i + 1];
    if (len < 2) return null;
    // SOF0..SOF15（排除 DHT=C4、JPG=C8、DAC=CC）记录尺寸
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      h = (b[i + 3] << 8) | b[i + 4];
      w = (b[i + 5] << 8) | b[i + 6];
      sof = true;
    }
    i += len;
  }
  void sof;
  return null;
}

/** 扫描文件内所有完整内嵌 JPEG，返回尺寸最大者的字节副本 */
export function extractLargestEmbeddedJpeg(b: Uint8Array): Uint8Array | null {
  const spans: JpegSpan[] = [];
  for (let i = 0; i + 3 < b.length; i++) {
    // SOI 且其后为常见段 marker（JFIF E0 / EXIF E1 / DQT DB / DHT C4 / SOF C0..），降低误报
    if (
      b[i] === 0xff && b[i + 1] === 0xd8 && b[i + 2] === 0xff &&
      (b[i + 3] === 0xe0 || b[i + 3] === 0xe1 || b[i + 3] === 0xdb ||
       b[i + 3] === 0xc4 || (b[i + 3] >= 0xc0 && b[i + 3] <= 0xc3) || b[i + 3] === 0xee)
    ) {
      const r = walkJpeg(b, i);
      if (r && r.w > 0 && r.h > 0 && r.end - i >= 4096) {
        spans.push({ start: i, end: r.end, w: r.w, h: r.h });
        i = r.end - 1; // 跳到本 JPEG 之后继续，避免嵌套重复
      }
    }
  }
  if (spans.length === 0) return null;
  spans.sort((a, c) => c.end - c.start - (a.end - a.start));
  const big = spans[0];
  return b.slice(big.start, big.end);
}

export interface RawPreview {
  jpeg: Uint8Array;
  kind: RawKind;
  width: number;
  height: number;
  /** TIFF 系 RAW 的原始字节（供 exifRewriter 只抽取拍摄元数据）；非 TIFF 系为 null */
  tiff: Uint8Array | null;
}

/**
 * 提取 RAW 内嵌预览。识别不出 RAW 或找不到内嵌 JPEG 时返回 null（调用方按不支持格式处理）。
 */
export function extractRawPreview(b: Uint8Array, fileName?: string): RawPreview | null {
  let kind = detectRawKind(b);
  if (!kind) {
    if (isRawFileName(fileName)) kind = 'by-name';
    else return null;
  }
  const jpeg = extractLargestEmbeddedJpeg(b);
  if (!jpeg) return null;
  // 读内嵌 JPEG 尺寸（再走一遍仅为取宽高，代价小）
  const dims = walkJpeg(jpeg, 0);
  return {
    jpeg,
    kind,
    width: dims?.w ?? 0,
    height: dims?.h ?? 0,
    tiff: kind === 'tiff' ? b.slice() : null,
  };
}

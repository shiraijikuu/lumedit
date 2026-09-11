// 容器格式嗅探 + 原始 EXIF(TIFF 流) 提取
export type ImageFormat = 'jpeg' | 'png' | 'webp';

export function sniffFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  ) {
    return 'png';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

function asciiMatch(bytes: Uint8Array, offset: number, str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    if (bytes[offset + i] !== str.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * 提取容器内的原始 TIFF 形式 EXIF（不含 "Exif00" 头 / chunk 头）。
 * JPEG: APP1 段；PNG: eXIf chunk；WebP: EXIF chunk。
 */
export function extractTiffBytes(
  bytes: Uint8Array,
  format: ImageFormat
): Uint8Array | null {
  try {
    if (format === 'jpeg') return extractFromJpeg(bytes);
    if (format === 'png') return extractFromPng(bytes);
    return extractFromWebp(bytes);
  } catch {
    return null;
  }
}

function extractFromJpeg(bytes: Uint8Array): Uint8Array | null {
  let i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    // SOS（扫描数据开始）后无元数据段
    if (marker === 0xda) break;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
    if (segLen < 2) break;
    if (marker === 0xe1 && i + 10 < bytes.length && asciiMatch(bytes, i + 4, 'Exif\x00\x00')) {
      return bytes.subarray(i + 10, i + 2 + segLen);
    }
    i += 2 + segLen;
  }
  return null;
}

function readPngChunks(bytes: Uint8Array): Array<{ type: string; start: number; end: number; dataStart: number; dataLen: number }> {
  const chunks: Array<{ type: string; start: number; end: number; dataStart: number; dataLen: number }> = [];
  let i = 8;
  while (i + 12 <= bytes.length) {
    const len = (bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3];
    const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
    const dataStart = i + 8;
    const end = dataStart + len + 4; // 含 CRC
    chunks.push({ type, start: i, end, dataStart, dataLen: len });
    if (type === 'IEND') break;
    i = end;
  }
  return chunks;
}

function extractFromPng(bytes: Uint8Array): Uint8Array | null {
  for (const c of readPngChunks(bytes)) {
    if (c.type === 'eXIf') return bytes.subarray(c.dataStart, c.dataStart + c.dataLen);
  }
  return null;
}

function extractFromWebp(bytes: Uint8Array): Uint8Array | null {
  let i = 12;
  while (i + 8 <= bytes.length) {
    const fourcc = String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
    const len = bytes[i + 4] | (bytes[i + 5] << 8) | (bytes[i + 6] << 16) | (bytes[i + 7] << 24);
    if (fourcc === 'EXIF') {
      return bytes.subarray(i + 8, i + 8 + len);
    }
    i += 8 + len + (len & 1); // RIFF chunk 偶数填充
  }
  return null;
}

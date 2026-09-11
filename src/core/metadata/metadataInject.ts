// 将重建后的 TIFF EXIF 回注到编码产物：JPEG(APP1) / PNG(eXIf) / WebP(EXIF)
import type { ImageFormat } from './containerFormat';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function strBytes(s: string): Uint8Array {
  return Uint8Array.from(s, (c) => c.charCodeAt(c as unknown as number));
}

function injectJpeg(jpeg: Uint8Array, tiff: Uint8Array): Uint8Array {
  // JPEG APP1 段长度字段仅 2 字节，TIFF 部分上限 = 65533 - 8 = 65525。
  // 超限则放弃回注（返回未注入 EXIF 的干净 JPEG），避免长度回绕写坏文件。
  if (tiff.length > 65525) {
    console.warn('[metadataInject] TIFF 超过 APP1 64KB 上限，跳过 EXIF 回注', tiff.length);
    return jpeg;
  }
  // FF D8 之后插入 APP1：marker(2)+段长(2)+"Exif00"(6)+TIFF
  const seg = new Uint8Array(tiff.length + 10);
  seg[0] = 0xff;
  seg[1] = 0xe1;
  const len = tiff.length + 8; // 段长含自身 2 字节 + "Exif00" 6 字节
  seg[2] = (len >> 8) & 0xff;
  seg[3] = len & 0xff;
  seg.set(strBytes('Exif\x00\x00'), 4);
  seg.set(tiff, 10);
  return concat([jpeg.subarray(0, 2), seg, jpeg.subarray(2)]);
}

function makePngChunk(type: string, data: Uint8Array): Uint8Array {
  const head = new Uint8Array(8);
  head[0] = (data.length >>> 24) & 0xff;
  head[1] = (data.length >>> 16) & 0xff;
  head[2] = (data.length >>> 8) & 0xff;
  head[3] = data.length & 0xff;
  const typeB = strBytes(type);
  head.set(typeB, 4);
  const crcInput = concat([typeB, data]);
  const crc = crc32(crcInput);
  const tail = new Uint8Array(4);
  tail[0] = (crc >>> 24) & 0xff;
  tail[1] = (crc >>> 16) & 0xff;
  tail[2] = (crc >>> 8) & 0xff;
  tail[3] = crc & 0xff;
  return concat([head, data, tail]);
}

function injectPng(png: Uint8Array, tiff: Uint8Array): Uint8Array {
  // 签名(8) 之后是 IHDR：4(length)+4(type)+data+4(crc)
  const ihdrLen = (png[8] << 24) | (png[9] << 16) | (png[10] << 8) | png[11];
  const ihdrEnd = 8 + 8 + ihdrLen + 4;
  const exifChunk = makePngChunk('eXIf', tiff);
  return concat([png.subarray(0, ihdrEnd), exifChunk, png.subarray(ihdrEnd)]);
}

function injectWebp(webp: Uint8Array, tiff: Uint8Array): Uint8Array {
  // RIFF(4) + size(4) + WEBP(4) 之后插入 EXIF chunk，并重算 RIFF size
  const pad = tiff.length & 1;
  const chunk = new Uint8Array(8 + tiff.length + pad);
  chunk.set(strBytes('EXIF'), 0);
  chunk[4] = tiff.length & 0xff;
  chunk[5] = (tiff.length >> 8) & 0xff;
  chunk[6] = (tiff.length >> 16) & 0xff;
  chunk[7] = (tiff.length >> 24) & 0xff;
  chunk.set(tiff, 8);
  const rest = webp.subarray(12);
  const body = concat([chunk, rest]); // 'WEBP' 之后全部内容
  const out = new Uint8Array(12 + body.length);
  out.set(strBytes('RIFF'), 0);
  const riffSize = body.length + 4; // 含 'WEBP'
  const dv = new DataView(out.buffer);
  dv.setUint32(4, riffSize, true);
  out.set(strBytes('WEBP'), 8);
  out.set(body, 12);
  return out;
}

/** 把 TIFF EXIF 回注到对应格式的编码字节中 */
export function injectExif(
  format: ImageFormat,
  encoded: Uint8Array,
  tiff: Uint8Array
): Uint8Array {
  if (format === 'jpeg') return injectJpeg(encoded, tiff);
  if (format === 'png') return injectPng(encoded, tiff);
  return injectWebp(encoded, tiff);
}

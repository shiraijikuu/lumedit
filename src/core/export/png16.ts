// ============================================================
// 零依赖 16-bit PNG 编码器（M6c）
// OffscreenCanvas.convertToBlob 只能出 8bit；这里手写 PNG 容器：
// IHDR(bit-depth=16) + IDAT(zlib stored/不压缩块) + IEND，自带 CRC32 / Adler32。
// 输入为每通道 0..65535 的线性 Uint16Array（RGB 三通道或 RGBA 四通道）。
// 输出的是 16bit/通道、sRGB 编码（非线性）的标准 PNG，可被 PS/LR/affinity 读取。
// ============================================================

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  const MOD = 65521;
  // 分块求模，避免大数精度问题
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a) >>> 0;
}

class ByteWriter {
  private chunks: Uint8Array[] = [];
  private len = 0;
  push(u8: Uint8Array): void {
    this.chunks.push(u8);
    this.len += u8.length;
  }
  byte(v: number): void {
    this.push(new Uint8Array([v & 0xff]));
  }
  u32be(v: number): void {
    this.push(new Uint8Array([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]));
  }
  get length(): number {
    return this.len;
  }
  toBytes(): Uint8Array {
    const out = new Uint8Array(this.len);
    let off = 0;
    for (const c of this.chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }
}

/** 写一个 PNG chunk：长度 + 类型 + 数据 + CRC（CRC 覆盖类型与数据） */
function writeChunk(w: ByteWriter, type: string, data: Uint8Array): void {
  w.u32be(data.length);
  const enc = new TextEncoder();
  const typeBytes = enc.encode(type);
  w.push(typeBytes);
  w.push(data);
  // CRC 覆盖 type+data：拼一块临时区计算
  const buf = new Uint8Array(typeBytes.length + data.length);
  buf.set(typeBytes, 0);
  buf.set(data, typeBytes.length);
  w.u32be(crc32(buf, 0, buf.length));
}

/** zlib（CMF=0x78 FLG=0x01）+ 不压缩 stored deflate 块 + adler32 尾 */
function zlibStored(raw: Uint8Array): Uint8Array {
  const MAXB = 65535;
  const blockCount = Math.max(1, Math.ceil(raw.length / MAXB));
  // 每块 5 字节头 + 数据，加 2 字节 zlib 头 + 4 字节 adler
  const out = new Uint8Array(2 + blockCount * 5 + raw.length + 4);
  let o = 0;
  out[o++] = 0x78;
  out[o++] = 0x01;
  let pos = 0;
  do {
    const chunk = Math.min(MAXB, raw.length - pos);
    const final = pos + chunk >= raw.length ? 1 : 0;
    out[o++] = final; // BFINAL + BTYPE=00
    out[o++] = chunk & 0xff; // LEN
    out[o++] = (chunk >> 8) & 0xff;
    const nlen = ~chunk & 0xffff; // NLEN = ~LEN
    out[o++] = nlen & 0xff;
    out[o++] = (nlen >> 8) & 0xff;
    if (chunk > 0) {
      out.set(raw.subarray(pos, pos + chunk), o);
      o += chunk;
      pos += chunk;
    }
  } while (pos < raw.length);
  const ad = adler32(raw);
  out[o++] = (ad >>> 24) & 0xff;
  out[o++] = (ad >>> 16) & 0xff;
  out[o++] = (ad >>> 8) & 0xff;
  out[o++] = ad & 0xff;
  return out.subarray(0, o);
}

/** WebGL FLOAT 读回（行序底部优先）→ PNG 顶起 RGB16；统一在这里翻转，避免导出倒置。 */
export function rgbaFloatToRgb16TopDown(buf: Float32Array, w: number, h: number): Uint16Array {
  const out = new Uint16Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const sy = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const si = (sy * w + x) * 4;
      const di = (y * w + x) * 3;
      out[di] = Math.max(0, Math.min(65535, Math.round(buf[si] * 65535)));
      out[di + 1] = Math.max(0, Math.min(65535, Math.round(buf[si + 1] * 65535)));
      out[di + 2] = Math.max(0, Math.min(65535, Math.round(buf[si + 2] * 65535)));
    }
  }
  return out;
}

/** WebGL UNSIGNED_BYTE 读回（行序底部优先）→ PNG 顶起 RGB16。 */
export function rgba8ToRgb16TopDown(buf: Uint8Array, w: number, h: number): Uint16Array {
  const out = new Uint16Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const sy = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const si = (sy * w + x) * 4;
      const di = (y * w + x) * 3;
      out[di] = buf[si] * 257;
      out[di + 1] = buf[si + 1] * 257;
      out[di + 2] = buf[si + 2] * 257;
    }
  }
  return out;
}

function png16Raw(samples: Uint16Array, w: number, h: number, channels: 3 | 4): Uint8Array {
  if (samples.length < w * h * channels) throw new Error('[png16] 样本数与尺寸不符');
  const rowBytes = w * channels * 2;
  const raw = new Uint8Array(h * (1 + rowBytes));
  let rp = 0;
  let sp = 0;
  for (let y = 0; y < h; y++) {
    raw[rp++] = 0; // filter type 0 (None)，逐行
    for (let x = 0; x < w * channels; x++) {
      const v = Math.max(0, Math.min(65535, Math.round(samples[sp++])));
      raw[rp++] = (v >> 8) & 0xff; // PNG 多字节整数为大端
      raw[rp++] = v & 0xff;
    }
  }
  return raw;
}

function png16WithIdat(idat: Uint8Array, w: number, h: number, channels: 3 | 4): Uint8Array {
  const colorType = channels === 4 ? 6 : 2;
  const wtr = new ByteWriter();
  // PNG signature
  wtr.push(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  // IHDR：13 字节
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 16; // bit depth
  ihdr[9] = colorType;
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  writeChunk(wtr, 'IHDR', ihdr);
  writeChunk(wtr, 'IDAT', idat);
  writeChunk(wtr, 'IEND', new Uint8Array(0));
  return wtr.toBytes();
}

async function zlibDeflate(raw: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') return zlibStored(raw);
  const stream = new CompressionStream('deflate');
  const writer = stream.writable.getWriter();
  void writer.write(raw);
  void writer.close();
  const compressed = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(compressed);
}

/**
 * 编码 16bit PNG。
 * @param samples Uint16Array，长度 w*h*channels，取值 0..65535
 * @param channels 3=RGB（color type 2），4=RGBA（color type 6）
 */
export function encodePng16(samples: Uint16Array, w: number, h: number, channels: 3 | 4): Uint8Array {
  return png16WithIdat(zlibStored(png16Raw(samples, w, h, channels)), w, h, channels);
}

/** 导出线程优先走原生 deflate 压缩：体积和写盘耗时远低于 stored 块。 */
export async function encodePng16Async(samples: Uint16Array, w: number, h: number, channels: 3 | 4): Promise<Uint8Array> {
  return png16WithIdat(await zlibDeflate(png16Raw(samples, w, h, channels)), w, h, channels);
}

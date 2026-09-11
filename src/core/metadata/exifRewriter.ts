// ============================================================
// TIFF/EXIF 重写器：保留 IFD0 / ExifIFD / InteropIFD，
// 真正剔除 GPS IFD（0x8825）、MakerNote（0x927C）、内嵌缩略图，
// 顺序重排并修正所有偏移指针。输出干净、可回注三容器的 TIFF 流。
// ============================================================

const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_INTEROP_IFD = 0xa005;
const TAG_MAKER_NOTE = 0x927c;

// 指向图像数据 / 子 IFD / 缩略图的标签，在纯元数据 EXIF 中无意义，统一剔除
const DROP_TAGS = new Set<number>([
  TAG_GPS_IFD,
  TAG_MAKER_NOTE,
  0x0111, // StripOffsets
  0x0117, // StripByteCounts
  0x014a, // SubIFDs
  0x0201, // JPEGInterchangeFormat（缩略图偏移）
  0x0202, // JPEGInterchangeFormatLength
]);

const TYPE_SIZE: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  7: 1, // UNDEFINED
  9: 4, // SLONG
  10: 8, // SRATIONAL
};

interface RawEntry {
  tag: number;
  type: number;
  count: number;
  /** 原始值字节（外部数据已拷贝出来，与原偏移无关） */
  value: Uint8Array;
  inline: boolean;
}

interface ParsedIfd {
  entries: RawEntry[];
}

class TiffReader {
  /** 严格限定到 TIFF 窗口的字节视图（关键：不能直接用 view.buffer，
   *  因为 tiff 往往是从整张原图共享出来的视图，其底层 ArrayBuffer 远大于 TIFF，
   *  直接切片会跨出 TIFF、把原图 JPEG 的 SOI/EOI 切进 EXIF，导致导出文件损坏）。 */
  private readonly bytes: Uint8Array;

  constructor(
    public readonly view: DataView,
    public readonly little: boolean,
    public readonly base: number
  ) {
    this.bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }

  u16(off: number): number {
    return this.view.getUint16(this.base + off, this.little);
  }
  u32(off: number): number {
    return this.view.getUint32(this.base + off, this.little);
  }

  /** 仅在 TIFF 窗口内切片；越界返回 null（丢弃异常 entry，绝不带出 TIFF 之外的字节） */
  private sliceInTiff(start: number, len: number): Uint8Array | null {
    const s = this.base + start;
    const e = s + len;
    if (s < 0 || e > this.bytes.length || len <= 0) return null;
    return this.bytes.slice(s, e);
  }

  readIfd(ifdOffset: number): ParsedIfd | null {
    if (ifdOffset === 0 || this.base + ifdOffset + 2 > this.bytes.length) return null;
    const count = this.u16(ifdOffset);
    if (!Number.isInteger(count) || count > 4096) return null; // 异常条目数防御
    const entries: RawEntry[] = [];
    for (let i = 0; i < count; i++) {
      const eo = ifdOffset + 2 + i * 12;
      if (this.base + eo + 12 > this.bytes.length) break;
      const tag = this.u16(eo);
      const type = this.u16(eo + 2);
      const num = this.u32(eo + 4);
      const unit = TYPE_SIZE[type];
      if (!unit) continue; // 未知类型直接丢弃，避免写出坏 EXIF
      if (!Number.isInteger(num) || num > 0x10000000) continue; // 异常计数防御
      const byteLen = unit * num;
      let value: Uint8Array | null;
      let inline: boolean;
      if (byteLen <= 4) {
        value = this.sliceInTiff(eo + 8, byteLen);
        inline = true;
      } else {
        const dataOff = this.u32(eo + 8);
        value = this.sliceInTiff(dataOff, byteLen);
        inline = false;
      }
      if (!value) continue; // 外部值越界 / 指向 TIFF 之外：丢弃该条目
      entries.push({ tag, type, count: num, value, inline });
    }
    return { entries };
  }

  findPointer(ifd: ParsedIfd | null, tag: number): number {
    if (!ifd) return 0;
    const e = ifd.entries.find((x) => x.tag === tag);
    if (!e) return 0;
    return this.little ? e.value[0] | (e.value[1] << 8) | (e.value[2] << 16) | (e.value[3] << 24)
      : ((e.value[0] << 24) | (e.value[1] << 16) | (e.value[2] << 8) | e.value[3]) >>> 0;
  }
}

class TiffWriter {
  private chunks: Uint8Array[] = [];
  private cursor = 0;
  constructor(private readonly little: boolean) {}

  get length(): number {
    return this.cursor;
  }

  align2(): void {
    if (this.cursor & 1) {
      this.chunks.push(new Uint8Array([0]));
      this.cursor++;
    }
  }

  u16(v: number): void {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, v, this.little);
    this.push(b);
  }

  u32(v: number): void {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v >>> 0, this.little);
    this.push(b);
  }

  push(b: Uint8Array): void {
    this.chunks.push(b);
    this.cursor += b.length;
  }

  /** 在指定绝对偏移处写 u32（回填指针） */
  patchU32(absOffset: number, v: number): void {
    let skipped = 0;
    for (const c of this.chunks) {
      if (absOffset >= skipped && absOffset + 4 <= skipped + c.length) {
        new DataView(c.buffer, c.byteOffset + (absOffset - skipped), 4).setUint32(0, v >>> 0, this.little);
        return;
      }
      skipped += c.length;
    }
    throw new Error(`patchU32: offset ${absOffset} 不可达`);
  }

  result(): Uint8Array {
    const out = new Uint8Array(this.cursor);
    let off = 0;
    for (const c of this.chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }
}

function makeEntry(tag: number, type: number, count: number, value: Uint8Array, inline: boolean): RawEntry {
  return { tag, type, count, value, inline };
}

function longEntry(little: boolean, tag: number, offset: number): RawEntry {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, offset >>> 0, little);
  return makeEntry(tag, 4, 1, b, true);
}

function shortEntry(little: boolean, tag: number, v: number): RawEntry {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, v, little);
  return makeEntry(tag, 3, 1, b, true);
}

function upsertEntry(list: RawEntry[], entry: RawEntry): void {
  const i = list.findIndex((x) => x.tag === entry.tag);
  if (i >= 0) list.splice(i, 1, entry);
  else list.push(entry);
  list.sort((a, b) => a.tag - b.tag);
}

/**
 * 重建 TIFF EXIF。
 * @param tiff 原始 TIFF 流
 * @param stripGps 是否剔除 GPS（默认 true）
 * @param dims 导出最终像素尺寸（回写 PixelXDimension/YDimension）；同时 Orientation 置 1
 * @returns 重建后的 TIFF 流；原始数据无法解析时返回 null（调用方放弃回注）
 */
export function rewriteTiffExif(
  tiff: Uint8Array,
  stripGps = true,
  dims?: { width: number; height: number }
): Uint8Array | null {
  try {
    if (tiff.length < 8) return null;
    // 独立紧凑副本：tiff 通常是从整张原图共享的视图（底层 ArrayBuffer 远大于 TIFF），
    // 复制后 view.buffer 即纯 TIFF，从根上杜绝跨边界切片。
    tiff = tiff.slice();
    const little = tiff[0] === 0x49 && tiff[1] === 0x49;
    const big = tiff[0] === 0x4d && tiff[1] === 0x4d;
    if (!little && !big) return null;
    const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
    const magic = view.getUint16(2, little);
    if (magic !== 42) return null;
    const ifd0Off = view.getUint32(4, little);
    const reader = new TiffReader(view, little, 0);

    const ifd0 = reader.readIfd(ifd0Off);
    if (!ifd0) return null;
    const exifOff = reader.findPointer(ifd0, TAG_EXIF_IFD);
    const exifIfd = exifOff ? reader.readIfd(exifOff) : null;
    const interopOff = exifIfd ? reader.findPointer(exifIfd, TAG_INTEROP_IFD) : 0;
    const interopIfd = interopOff ? reader.readIfd(interopOff) : null;

    // 过滤条目（GPS / MakerNote / 缩略图 / 旧指针，指针最后重建）
    const drop = new Set(DROP_TAGS);
    if (!stripGps) drop.delete(TAG_GPS_IFD);
    const filterEntries = (e: RawEntry[], extraDrops: number[]): RawEntry[] =>
      e
        .filter((x) => !drop.has(x.tag) && !extraDrops.includes(x.tag))
        .sort((a, b) => a.tag - b.tag);

    const ifd0List = filterEntries(ifd0.entries, [TAG_EXIF_IFD]);
    const exifList = exifIfd ? filterEntries(exifIfd.entries, [TAG_INTEROP_IFD]) : [];
    const interopList = interopIfd ? filterEntries(interopIfd.entries, []) : [];

    // 指针条目（按 tag 升序插入）
    if (exifIfd) ifd0List.push(longEntry(little, TAG_EXIF_IFD, 0));
    // 导出图已完成方向校正：Orientation(0x0112) 置 1
    upsertEntry(ifd0List, shortEntry(little, 0x0112, 1));
    ifd0List.sort((a, b) => a.tag - b.tag);
    if (interopIfd && exifIfd) exifList.push(longEntry(little, TAG_INTEROP_IFD, 0));
    // 回写最终像素尺寸 PixelXDimension(0xA002) / PixelYDimension(0xA003)
    if (dims) {
      upsertEntry(exifList, longEntry(little, 0xa002, dims.width));
      upsertEntry(exifList, longEntry(little, 0xa003, dims.height));
    }
    exifList.sort((a, b) => a.tag - b.tag);

    const w = new TiffWriter(little);
    // Header：字节序 + 42 + IFD0 偏移（固定为 8）
    w.push(tiff.subarray(0, 2));
    w.u16(42);
    w.u32(8);

    // 布局（两遍写入，严格与预算一致，避免 IFD 间指针错位）：
    //   Header | IFD0 目录 | Exif 目录 | Interop 目录 | 外部值数据区
    const ifdBlockSize = (n: number) => 2 + n * 12 + 4;
    const ifd0Start = w.length;
    const exifStart = ifd0Start + ifdBlockSize(ifd0List.length);
    const interopStart = exifStart + (exifIfd ? ifdBlockSize(exifList.length) : 0);

    // 第一遍：连续写各 IFD 目录块（外部值先占位，记录回填位置）
    const allExternal: Array<{ entry: RawEntry; fieldOffset: number }> = [];
    const writeIfdDir = (
      list: RawEntry[],
      pointerMap: Map<number, number>
    ): void => {
      w.u16(list.length);
      for (const e of list) {
        w.u16(e.tag);
        w.u16(e.type);
        w.u32(e.count);
        const fieldOffset = w.length;
        const pointerTarget = pointerMap.get(e.tag);
        if (pointerTarget !== undefined) {
          // IFD 间指针：目录布局与预算一致，target 此刻已知，直接写
          w.u32(pointerTarget);
        } else if (e.inline) {
          const field = new Uint8Array(4);
          field.set(e.value);
          w.push(field);
        } else {
          w.u32(0); // 占位，外部数据区写完后回填
          allExternal.push({ entry: e, fieldOffset });
        }
      }
      w.u32(0); // next IFD = 0
    };

    writeIfdDir(
      ifd0List,
      exifIfd ? new Map([[TAG_EXIF_IFD, exifStart]]) : new Map()
    );
    if (exifIfd) {
      writeIfdDir(
        exifList,
        interopIfd ? new Map([[TAG_INTEROP_IFD, interopStart]]) : new Map()
      );
    }
    if (interopIfd) {
      writeIfdDir(interopList, new Map());
    }

    // 第二遍：统一写外部值数据区，回填各占位偏移
    for (const { entry, fieldOffset } of allExternal) {
      w.align2();
      w.patchU32(fieldOffset, w.length);
      w.push(entry.value);
    }
    const result = w.result();
    // JPEG APP1 段长度字段仅 2 字节（上限 65533，含 "Exif00" 6B + 段长 2B）。
    // 若重建后仍超限（残留大块厂商注释等），宁可不回注 EXIF，也绝不能写坏文件。
    const MAX_APP1_TIFF = 65533 - 8;
    if (result.length > MAX_APP1_TIFF) {
      console.warn('[exifRewriter] 重建 TIFF 超过 APP1 上限，放弃回注 EXIF', result.length);
      return null;
    }
    return result;
  } catch (err) {
    console.warn('[exifRewriter] 重建失败，放弃回注 EXIF', err);
    return null;
  }
}

/** 快速判断 TIFF 流是否含 GPS IFD 指针 */
export function tiffHasGps(tiff: Uint8Array): boolean {
  try {
    const little = tiff[0] === 0x49;
    const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
    const ifd0Off = view.getUint32(4, little);
    const count = view.getUint16(ifd0Off, little);
    for (let i = 0; i < count; i++) {
      const eo = ifd0Off + 2 + i * 12;
      const tag = view.getUint16(eo, little);
      if (tag === TAG_GPS_IFD) return true;
    }
    return false;
  } catch {
    return false;
  }
}

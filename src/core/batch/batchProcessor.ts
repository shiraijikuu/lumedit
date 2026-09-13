// P1 批量处理调度：串行队列（单 Worker、控内存）+ 分阶段进度 + 失败汇总 + 可取消
import type { EditParams } from '@/types/EditParams';
import type { ImageMeta } from '../image/imageLoader';
import { decodeForPreview } from '../image/imageLoader';
import { runExport } from '../export/exporter';
import type { ExportFormat } from '../export/exportWorker';
import type { LutData } from '../render/lut/lutTypes';

export interface BatchSourceItem {
  path: string;
  name: string;
  buffer: ArrayBuffer;
}

export interface BatchOptions {
  items: BatchSourceItem[];
  params: EditParams;
  lut: LutData | null;
  format: ExportFormat;
  quality: number;
  keepExif: boolean;
  stripGps: boolean;
  scale: number;
  outputDir: string;
  suffix: string;
  writeFile: (absPath: string, bytes: Uint8Array) => Promise<void>;
  onItemStart?: (name: string, index: number) => void;
  /** 每张结束（成功或失败）后触发；index = 刚结束的条目下标 */
  onProgress?: (done: number, total: number, index: number) => void;
  /** 单张失败即时上报（按索引，避免不同目录同名文件混淆） */
  onItemError?: (index: number, error: string) => void;
  /** 取消探测：批量循环与导出内部（水印合成前后）都会轮询 */
  isCancelled?: () => boolean;
}

export interface BatchFailure {
  name: string;
  index: number;
  error: string;
}

export interface BatchResult {
  done: number;
  failed: BatchFailure[];
  cancelled: boolean;
}

export class CancelToken {
  cancelled = false;
  cancel(): void {
    this.cancelled = true;
  }
}

function stripExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

const EXT: Record<ExportFormat, string> = {
  jpeg: '.jpg',
  png: '.png',
  png16: '.png',
  webp: '.webp',
};

export async function runBatch(
  opts: BatchOptions,
  token: CancelToken
): Promise<BatchResult> {
  const failed: BatchFailure[] = [];
  let done = 0;
  const usedNames = new Set<string>();

  for (let i = 0; i < opts.items.length; i++) {
    if (token.cancelled) return { done, failed, cancelled: true };
    const item = opts.items[i];
    opts.onItemStart?.(item.name, i);

    try {
      // 每张图独立解析 EXIF/方向（参数相同，元数据各自不同）
      const decoded = await decodeForPreview(item.buffer.slice(0), item.name);
      const meta: ImageMeta = decoded.meta;
      decoded.bitmap.close();

      const resp = await runExport(
        {
          buffer: item.buffer.slice(0), // Worker 会 transfer，必须给副本
          meta,
          params: opts.params,
          lut: opts.lut,
          format: opts.format,
          quality: opts.quality,
          keepExif: opts.keepExif,
          stripGps: opts.stripGps,
          scale: opts.scale,
        },
        { isCancelled: () => token.cancelled }
      );
      // 取消发生在导出内部（如水印合成）：不计为失败，直接整体返回
      if (token.cancelled) return { done, failed, cancelled: true };
      if (!resp.ok || !resp.bytes) throw new Error(resp.error || '导出失败');

      // 文件名：原名 + 后缀，重名自动编号
      let base = `${stripExt(item.name)}${opts.suffix}`;
      let candidate = base + EXT[opts.format];
      let n = 1;
      while (usedNames.has(candidate.toLowerCase())) {
        candidate = `${base} (${n++})${EXT[opts.format]}`;
      }
      usedNames.add(candidate.toLowerCase());
      const absPath = `${opts.outputDir}/${candidate}`;
      await opts.writeFile(absPath, resp.bytes);
      done++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failed.push({ name: item.name, index: i, error: msg });
      opts.onItemError?.(i, msg);
    } finally {
      // 取消后的收尾不再推进进度条，避免把未完成条目标成已完成
      if (!token.cancelled) opts.onProgress?.(i + 1, opts.items.length, i);
    }
  }
  return { done, failed, cancelled: token.cancelled };
}

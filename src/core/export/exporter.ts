// 导出编排：Worker 用 WebGL2 渲染「调色后无水印」中间位图（无损 PNG），
// 回到主线程后按需调用 camera-watermark 离屏窗口合成水印，再缩放、编码最终格式并回注 EXIF。
// 单 Worker 串行队列（避免多个 WebGL2 上下文）。
import type { ExportFormat, ExportRequest, ExportResponse } from './exportWorker';
import { rewriteTiffExif } from '../metadata/exifRewriter';
import { injectExif } from '../metadata/metadataInject';

let worker: Worker | null = null;
let jobSeq = 1;
const pending = new Map<number, (resp: ExportResponse) => void>();

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./exportWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<ExportResponse>) => {
    const resolve = pending.get(e.data.jobId);
    if (resolve) {
      pending.delete(e.data.jobId);
      resolve(e.data);
    }
  };
  worker.onerror = (e) => {
    console.error('[exporter] worker error', e);
    for (const [id, resolve] of pending) {
      resolve({ jobId: id, ok: false, error: e.message || '导出线程崩溃' });
    }
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

function renderInWorker(req: Omit<ExportRequest, 'jobId'>): Promise<ExportResponse> {
  const w = ensureWorker();
  const jobId = jobSeq++;
  return new Promise((resolve) => {
    pending.set(jobId, resolve);
    const full: ExportRequest = { ...req, jobId };
    w.postMessage(full, [full.buffer]);
  });
}

async function bitmapToPngDataUrl(bmp: ImageBitmap, w: number, h: number): Promise<string> {
  const c = new OffscreenCanvas(w, h);
  c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  const blob = await c.convertToBlob({ type: 'image/png' });
  return await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

function mimeOf(format: ExportFormat): string {
  if (format === 'png') return 'image/png';
  if (format === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export interface ExportRunOptions {
  /** 取消探测：长耗时步骤（Worker 渲染、水印离屏合成）之后轮询，命中立即放弃 */
  isCancelled?: () => boolean;
}

function cancelledResponse(): ExportResponse {
  return { jobId: -1, ok: false, error: '已取消' };
}

export async function runExport(
  req: Omit<ExportRequest, 'jobId'>,
  opts?: ExportRunOptions
): Promise<ExportResponse> {
  const check = (): boolean => !!opts?.isCancelled?.();
  // 1) Worker 渲染调色后无水印 PNG
  const inter = await renderInWorker(req);
  if (check()) return cancelledResponse();
  if (!inter.ok || !inter.bytes || !inter.width || !inter.height) {
    return { jobId: -1, ok: false, error: inter.error || '中间位图渲染失败' };
  }

  // 16bit PNG：Worker 已产出最终文件（浮点读回 + 手写编码）。
  // 水印 / 缩放 / 8bit canvas 编码都会降到 8bit，这里全部旁路，仅按 PNG 容器回注 EXIF。
  if (req.format === 'png16') {
    let bytes16 = inter.bytes;
    if (req.keepExif && req.meta.tiff) {
      const tiff = rewriteTiffExif(req.meta.tiff, req.stripGps, { width: inter.width, height: inter.height });
      if (tiff) bytes16 = injectExif('png', bytes16, tiff);
    }
    return { jobId: -1, ok: true, bytes: bytes16, width: inter.width, height: inter.height };
  }

  let bmp: ImageBitmap;
  if (inter.raw) {
    const size = inter.width * inter.height * 4;
    if (inter.bytes.byteLength < size) {
      return { jobId: -1, ok: false, error: '导出像素数据不完整' };
    }
    const rgba = new Uint8ClampedArray(inter.bytes.buffer, inter.bytes.byteOffset, size);
    bmp = await createImageBitmap(new ImageData(rgba, inter.width, inter.height));
  } else {
    bmp = await createImageBitmap(new Blob([inter.bytes], { type: 'image/png' }));
  }
  if (check()) {
    bmp.close();
    return cancelledResponse();
  }
  let W = inter.width;
  let H = inter.height;

  // 2) 缩放（水印之前完成，保证水印按最终尺寸排版）
  if (req.scale > 0 && req.scale < 1) {
    W = Math.max(1, Math.round(W * req.scale));
    H = Math.max(1, Math.round(H * req.scale));
  }

  // 3) camera-watermark 离屏全分辨率合成（管线最后一步，最长可达 120s，取消必须在此把关）
  const wm = req.params.watermark;
  if (wm?.enabled && wm.cwmState) {
    if (check()) {
      bmp.close();
      return cancelledResponse();
    }
    const baseDataUrl = await bitmapToPngDataUrl(bmp, W, H);
    bmp.close();
    const composed = await window.api.composeCwm({
      baseDataUrl,
      state: wm.cwmState,
      meta: wm.cwmMeta ?? {},
      format: 'image/png',
      quality: 1,
    });
    if (check()) return cancelledResponse();
    bmp = await createImageBitmap(new Blob([composed.buffer], { type: 'image/png' }));
    W = composed.width;
    H = composed.height;
  }

  // 4) 最终格式编码（JPEG 黑底，防旋转透明区域）
  const oc = new OffscreenCanvas(W, H);
  const c2 = oc.getContext('2d');
  if (!c2) return { jobId: -1, ok: false, error: '最终编码画布不可用' };
  if (req.format === 'jpeg') {
    c2.fillStyle = '#000';
    c2.fillRect(0, 0, W, H);
  }
  c2.imageSmoothingEnabled = true;
  c2.imageSmoothingQuality = 'high';
  c2.drawImage(bmp, 0, 0, W, H);
  bmp.close();

  const mime = mimeOf(req.format);
  const finalBlob = await oc.convertToBlob({
    type: mime,
    quality: req.format === 'png' ? undefined : req.quality,
  });
  let bytes = new Uint8Array(await finalBlob.arrayBuffer());

  // 5) 回注 EXIF（尺寸以最终输出为准；容器格式必须跟「导出格式」一致，
  //    否则 JPEG 原图导出为 PNG/WebP 时会按错容器注入而破坏文件）
  if (req.keepExif && req.meta.tiff) {
    const tiff = rewriteTiffExif(req.meta.tiff, req.stripGps, { width: W, height: H });
    if (tiff) bytes = injectExif(req.format, bytes, tiff);
  }

  return { jobId: -1, ok: true, bytes, width: W, height: H };
}

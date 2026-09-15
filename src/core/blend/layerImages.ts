// 叠加图层位图加载（主线程）：通过文件路径引用读取（不嵌入工程），解码为 ImageBitmap 供 BlendStage 上传。
// 与 LUT/水印一致：只存路径，加载失败由调用方跳过该层并提示。
import { decodeAnyImageBitmap } from '@/core/image/imageLoader';

/** 预览端叠加层最长边，避免多个 RAW 图层占满内存 / 显存；导出 Worker 仍使用全分辨率。 */
export const BLEND_PREVIEW_MAX_EDGE = 2000;

async function downscaleLayerBitmap(bitmap: ImageBitmap, maxEdge: number): Promise<ImageBitmap> {
  const longest = Math.max(bitmap.width, bitmap.height);
  if (maxEdge <= 0 || longest <= maxEdge) return bitmap;
  const scale = maxEdge / longest;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return bitmap;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  const out = await createImageBitmap(canvas);
  bitmap.close();
  return out;
}

/** 读取一张叠加图层图片并解码（jpg/png/webp，以及 RAW：RAW 自动提取内嵌预览） */
export async function loadLayerBitmap(
  path: string,
  maxEdge = BLEND_PREVIEW_MAX_EDGE
): Promise<ImageBitmap> {
  const buf = await window.api.readBuffer(path);
  const bitmap = await decodeAnyImageBitmap(buf, path);
  try {
    return await downscaleLayerBitmap(bitmap, maxEdge);
  } catch (err) {
    bitmap.close();
    throw err;
  }
}

/** 图层显示名：取文件名去扩展名 */
export function baseName(path: string): string {
  const clean = path.replace(/[\\/]+$/, '');
  const seg = clean.split(/[\\/]/).pop() ?? clean;
  return seg.replace(/\.[^.]+$/, '');
}
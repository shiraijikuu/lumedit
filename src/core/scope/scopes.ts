// ============================================================
// 专业示波器分析纯函数（M4）：Waveform / Vectorscope / RGB Parade
// 输入为降采样后的 RGBA8 位图，输出供 Canvas 绘制的累计网格。
// 纯函数、无 DOM 依赖，可被冒烟测试直接断言（对齐 DaVinci 示波器语义）。
// ============================================================

export const SCOPE_COLS = 192;
export const SCOPE_ROWS = 128;
export const SCOPE_VEC_N = 128;

export interface WaveformGrid {
  cols: number;
  rows: number;
  /** 每通道 cols*rows 计数，索引 [col*rows + row]，row=0 为最暗（底部） */
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
}

export interface VectorscopeGrid {
  /** 方形网格边长 */
  n: number;
  /** n*n 落点计数，索引 [gy*n + gx]；x=Cb 轴，y=Cr 轴（已翻转，上为正 Cr） */
  grid: Uint32Array;
}

export interface ScopeData {
  wave: WaveformGrid;
  parade: WaveformGrid;
  vec: VectorscopeGrid;
}

function emptyWave(cols: number, rows: number): WaveformGrid {
  return { cols, rows, r: new Uint32Array(cols * rows), g: new Uint32Array(cols * rows), b: new Uint32Array(cols * rows) };
}

/** Rec.601 色差（输入输出均 0~1） */
export function rgbToCbCr(r: number, g: number, b: number): { cb: number; cr: number } {
  return {
    cb: -0.168736 * r - 0.331264 * g + 0.5 * b,
    cr: 0.5 * r - 0.418688 * g - 0.081312 * b,
  };
}

/** Vectorscope 六个目标色（R/M/B/C/G/Y）的归一化坐标，与数据同一映射 */
export function vectorscopeTargets(n: number, gain = 1.0): Record<string, { x: number; y: number }> {
  const defs: Record<string, [number, number, number]> = {
    R: [1, 0, 0],
    M: [1, 0, 1],
    B: [0, 0, 1],
    C: [0, 1, 1],
    G: [0, 1, 0],
    Y: [1, 1, 0],
  };
  const out: Record<string, { x: number; y: number }> = {};
  for (const [name, [r, g, b]] of Object.entries(defs)) {
    const { cb, cr } = rgbToCbCr(r, g, b);
    out[name] = {
      x: (cb * gain + 0.5) * n,
      y: (0.5 - cr * gain) * n,
    };
  }
  return out;
}

/**
 * 分析一张 RGBA8 位图。
 * @param rgba 像素数据（长度 w*h*4）
 * @param w 图宽 @param h 图高
 */
export function analyzeScopes(
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  cols = SCOPE_COLS,
  rows = SCOPE_ROWS,
  vecN = SCOPE_VEC_N
): ScopeData {
  const wave = emptyWave(cols, rows);
  const parade = emptyWave(cols, rows);
  const vec: VectorscopeGrid = { n: vecN, grid: new Uint32Array(vecN * vecN) };
  if (w <= 0 || h <= 0) return { wave, parade, vec };

  const gain = 1.0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r8 = rgba[i];
      const g8 = rgba[i + 1];
      const b8 = rgba[i + 2];
      const cx = Math.min(cols - 1, Math.floor((x / Math.max(1, w - 1)) * cols));
      const rr = Math.min(rows - 1, Math.round((r8 / 255) * (rows - 1)));
      const gr = Math.min(rows - 1, Math.round((g8 / 255) * (rows - 1)));
      const br = Math.min(rows - 1, Math.round((b8 / 255) * (rows - 1)));
      wave.r[cx * rows + rr]++;
      wave.g[cx * rows + gr]++;
      wave.b[cx * rows + br]++;
      // Parade 与 wave 同源数据，绘制时横向三分即可
      parade.r[cx * rows + rr]++;
      parade.g[cx * rows + gr]++;
      parade.b[cx * rows + br]++;

      const { cb, cr } = rgbToCbCr(r8 / 255, g8 / 255, b8 / 255);
      const gx = Math.round((cb * gain + 0.5) * vecN);
      const gy = Math.round((0.5 - cr * gain) * vecN);
      if (gx >= 0 && gx < vecN && gy >= 0 && gy < vecN) vec.grid[gy * vecN + gx]++;
    }
  }
  return { wave, parade, vec };
}

/** 从 ImageBitmap 降采样并分析（rAF 调用方负责节流） */
export async function analyzeBitmap(
  bitmap: ImageBitmap,
  sampleW = 224
): Promise<ScopeData> {
  const w = sampleW;
  const h = Math.max(1, Math.round((bitmap.height / bitmap.width) * w));
  const cv = new OffscreenCanvas(w, h);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('scope 2d ctx failed');
  ctx.drawImage(bitmap, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  return analyzeScopes(img.data, w, h);
}

<template>
  <div class="scopes">
    <div class="scope-tabs">
      <button
        v-for="m in MODES"
        :key="m.id"
        class="scope-tab"
        :class="{ active: mode === m.id }"
        @click="mode = m.id"
      >
        {{ t(m.labelKey) }}
      </button>
    </div>
    <canvas ref="canvasRef" class="scope-canvas"></canvas>
  </div>
</template>

<script setup lang="ts">
import { onUnmounted, ref, watch, nextTick } from 'vue';
import { useEditorStore } from '@/stores/editor';
import { t } from '@/i18n';
import {
  analyzeBitmap,
  vectorscopeTargets,
  type ScopeData,
  type WaveformGrid,
} from '@/core/scope/scopes';

const store = useEditorStore();

const MODES = [
  { id: 'waveform', labelKey: 'scope.waveform' },
  { id: 'vectorscope', labelKey: 'scope.vectorscope' },
  { id: 'parade', labelKey: 'scope.parade' },
] as const;
type Mode = (typeof MODES)[number]['id'];
const mode = ref<Mode>('waveform');

const canvasRef = ref<HTMLCanvasElement | null>(null);
let raf = 0;
let cached: ScopeData | null = null;
let cacheToken = 0;

// 在 cols×rows 离屏画布上按密度成像，再整体放大（避免上万 fillRect）
function gridImage(grid: WaveformGrid, parade: boolean): HTMLCanvasElement {
  const { cols, rows, r, g, b } = grid;
  const cv = document.createElement('canvas');
  cv.width = cols;
  cv.height = rows;
  const c = cv.getContext('2d')!;
  const img = c.createImageData(cols, rows);
  // 列内最大计数（密度归一，波形按列更易读）
  const colMax = new Float32Array(cols);
  if (parade) {
    const block = cols / 3;
    for (let ox = 0; ox < cols; ox++) {
      const blockIdx = Math.min(2, Math.floor(ox / block));
      const srcCol = Math.min(cols - 1, Math.floor(((ox % block) / block) * cols));
      const chan = blockIdx === 0 ? r : blockIdx === 1 ? g : b;
      let mx = 1;
      for (let row = 0; row < rows; row++) mx = Math.max(mx, chan[srcCol * rows + row]);
      for (let row = 0; row < rows; row++) {
        const v = Math.min(255, Math.round(255 * Math.sqrt(chan[srcCol * rows + row] / mx) * 1.5));
        const oi = (row * cols + ox) * 4;
        if (blockIdx === 0) img.data[oi] = v;
        else if (blockIdx === 1) img.data[oi + 1] = v;
        else img.data[oi + 2] = v;
        img.data[oi + 3] = v ? 255 : 0;
      }
      colMax[ox] = mx;
    }
  } else {
    for (let cx = 0; cx < cols; cx++) {
      let mx = 1;
      for (let row = 0; row < rows; row++) {
        mx = Math.max(mx, r[cx * rows + row], g[cx * rows + row], b[cx * rows + row]);
      }
      for (let row = 0; row < rows; row++) {
        const k = cx * rows + row;
        const rr = Math.min(255, Math.round(255 * Math.sqrt(r[k] / mx) * 1.6));
        const gg = Math.min(255, Math.round(255 * Math.sqrt(g[k] / mx) * 1.6));
        const bb = Math.min(255, Math.round(255 * Math.sqrt(b[k] / mx) * 1.6));
        const oi = k * 4;
        img.data[oi] = rr;
        img.data[oi + 1] = gg;
        img.data[oi + 2] = bb;
        img.data[oi + 3] = rr | gg | bb ? 255 : 0;
      }
      colMax[cx] = mx;
    }
  }
  c.putImageData(img, 0, 0);
  return cv;
}

function vecImage(data: ScopeData): HTMLCanvasElement {
  const n = data.vec.n;
  const cv = document.createElement('canvas');
  cv.width = n;
  cv.height = n;
  const c = cv.getContext('2d')!;
  const img = c.createImageData(n, n);
  let mx = 1;
  for (let i = 0; i < data.vec.grid.length; i++) mx = Math.max(mx, data.vec.grid[i]);
  for (let i = 0; i < data.vec.grid.length; i++) {
    const v = Math.min(255, Math.round(255 * Math.sqrt(data.vec.grid[i] / mx) * 1.8));
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = v ? 230 : 0;
  }
  c.putImageData(img, 0, 0);
  return cv;
}

function drawGridlines(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    const y = (i / 4) * H;
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
}

function render(): void {
  const canvas = canvasRef.value;
  if (!canvas || !cached) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 260;
  const cssH = canvas.clientHeight || 120;
  const W = Math.round(cssW * dpr);
  const H = Math.round(cssH * dpr);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = '#0a0a0c';
  ctx.fillRect(0, 0, W, H);

  if (mode.value === 'vectorscope') {
    const src = vecImage(cached);
    // 留出安全边距，目标色标签不贴边裁切
    const pad = Math.max(8, Math.round(8 * dpr));
    const side = Math.max(1, Math.min(W, H) - pad * 2);
    const originX = (W - side) / 2;
    const originY = (H - side) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(originX, originY, side, side);
    ctx.clip();
    ctx.translate(originX, originY);
    // 参考圆 + 十字
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.arc(side / 2, side / 2, side * 0.46, 0, Math.PI * 2);
    ctx.moveTo(0, side / 2);
    ctx.lineTo(side, side / 2);
    ctx.moveTo(side / 2, 0);
    ctx.lineTo(side / 2, side);
    ctx.stroke();
    ctx.drawImage(src, 0, 0, side, side);
    // 目标色标记：坐标钳制在绘制区内，避免 R/B 等边缘色标被裁掉
    const targets = vectorscopeTargets(cached.vec.n);
    const scale = side / cached.vec.n;
    const labelPad = 7 * dpr;
    ctx.font = `${10 * dpr}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [name, p] of Object.entries(targets)) {
      const x = Math.min(side - labelPad, Math.max(labelPad, p.x * scale));
      const y = Math.min(side - labelPad, Math.max(labelPad, p.y * scale));
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(name, x, y);
    }
    ctx.restore();
  } else {
    const src = gridImage(mode.value === 'parade' ? cached.parade : cached.wave, mode.value === 'parade');
    drawGridlines(ctx, W, H);
    ctx.save();
    ctx.translate(0, H);
    ctx.scale(1, -1); // 波形底部为黑、顶部为白
    ctx.drawImage(src, 0, 0, W, H);
    ctx.restore();
    if (mode.value === 'parade') {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(W / 3, 0); ctx.lineTo(W / 3, H);
      ctx.moveTo((2 * W) / 3, 0); ctx.lineTo((2 * W) / 3, H);
      ctx.stroke();
    }
  }
}

async function recompute(): Promise<void> {
  const bitmap = store.previewBitmap;
  if (!bitmap) return;
  const token = ++cacheToken;
  const data = await analyzeBitmap(bitmap);
  if (token !== cacheToken) return; // 过期结果丢弃
  cached = data;
  await nextTick();
  render();
}

function schedule(): void {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(recompute);
}

watch(() => store.previewBitmap, schedule, { immediate: true });
watch(mode, () => requestAnimationFrame(render));
if (typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(() => requestAnimationFrame(render));
  watch(canvasRef, (el, _, onCleanup) => {
    if (el) ro.observe(el);
    onCleanup(() => ro.disconnect());
  }, { immediate: true });
}
onUnmounted(() => cancelAnimationFrame(raf));
</script>

<style scoped>
.scopes {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}
.scope-tabs {
  display: flex;
  gap: 4px;
}
.scope-tab {
  flex: 1;
  min-width: 0;
  padding: 5px 0;
  font-size: 11px;
  line-height: 1.2;
  white-space: normal;
  overflow-wrap: anywhere;
  border-radius: 7px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  transition: all 0.15s ease;
}
.scope-tab.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.scope-canvas {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  height: 120px;
  box-sizing: border-box;
  display: block;
  border-radius: 8px;
  background: #0a0a0c;
  border: 1px solid var(--line);
}
</style>

<template>
  <canvas ref="canvasRef" class="histogram"></canvas>
</template>

<script setup lang="ts">
import { onUnmounted, ref, watch, nextTick } from 'vue';
import { useEditorStore } from '@/stores/editor';

const store = useEditorStore();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const BINS = 256;
let raf = 0;

function compute(bitmap: ImageBitmap): { r: Float32Array; g: Float32Array; b: Float32Array; l: Float32Array } {
  const w = 128;
  const h = Math.max(1, Math.round((bitmap.height / bitmap.width) * w) || 96);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('histogram 2d ctx failed');
  ctx.drawImage(bitmap, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const r = new Float32Array(BINS);
  const g = new Float32Array(BINS);
  const b = new Float32Array(BINS);
  const l = new Float32Array(BINS);
  for (let i = 0; i < data.length; i += 4) {
    const ri = data[i] >> 0;
    const gi = data[i + 1] >> 0;
    const bi = data[i + 2] >> 0;
    r[ri]++; g[gi]++; b[bi]++;
    l[(ri * 0.299 + gi * 0.587 + bi * 0.114) | 0]++;
  }
  return { r, g, b, l };
}

function drawChannel(
  ctx: CanvasRenderingContext2D,
  hist: Float32Array,
  max: number,
  fill: string,
  w: number,
  h: number
): void {
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i < BINS; i++) {
    const v = Math.sqrt(hist[i] / max); // sqrt 压缩，暗部更易读
    const x = (i / (BINS - 1)) * w;
    const y = h - v * h;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function render(): void {
  const canvas = canvasRef.value;
  const bitmap = store.previewBitmap;
  if (!canvas || !bitmap) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 260;
  const cssH = canvas.clientHeight || 72;
  const W = Math.round(cssW * dpr);
  const H = Math.round(cssH * dpr);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { r, g, b, l } = compute(bitmap);
  let max = 1;
  for (let i = 0; i < BINS; i++) max = Math.max(max, r[i], g[i], b[i], l[i]);
  ctx.clearRect(0, 0, W, H);
  drawChannel(ctx, r, max, 'rgba(255,69,58,0.28)', W, H);
  drawChannel(ctx, g, max, 'rgba(48,209,88,0.28)', W, H);
  drawChannel(ctx, b, max, 'rgba(10,132,255,0.32)', W, H);
  // 明度轮廓
  ctx.beginPath();
  for (let i = 0; i < BINS; i++) {
    const v = Math.sqrt(l[i] / max);
    const x = (i / (BINS - 1)) * W;
    const y = H - v * H;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1 * dpr;
  ctx.stroke();
}

function schedule(): void {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => nextTick(render));
}

watch(() => store.previewBitmap, schedule, { immediate: true });
if (typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(schedule);
  watch(canvasRef, (el, _, onCleanup) => {
    if (el) ro.observe(el);
    onCleanup(() => ro.disconnect());
  }, { immediate: true });
}
onUnmounted(() => cancelAnimationFrame(raf));
</script>

<style scoped>
.histogram {
  width: 100%;
  height: 72px;
  display: block;
  border-radius: 8px;
  background: var(--bg-0);
  border: 1px solid var(--line);
}
</style>

<template>
  <div class="curve-editor" :style="{ '--curve-color': color }">
    <svg
      ref="svgRef"
      class="curve-svg"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      @pointerdown="onSvgDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @dblclick.prevent
    >
      <!-- 四分参考网格 -->
      <g class="grid" stroke="rgba(255,255,255,0.08)" stroke-width="0.4">
        <line x1="25" y1="0" x2="25" y2="100" />
        <line x1="50" y1="0" x2="50" y2="100" />
        <line x1="75" y1="0" x2="75" y2="100" />
        <line x1="0" y1="25" x2="100" y2="25" />
        <line x1="0" y1="50" x2="100" y2="50" />
        <line x1="0" y1="75" x2="100" y2="75" />
      </g>
      <line class="diag" x1="0" y1="100" x2="100" y2="0" />
      <polyline
        class="curve-line"
        :points="linePoints"
        fill="none"
        :stroke="color"
        stroke-width="1.4"
        vector-effect="non-scaling-stroke"
        stroke-linejoin="round"
      />
      <circle
        v-for="(p, i) in points"
        :key="i"
        :cx="p.x * 100"
        :cy="(1 - p.y) * 100"
        r="3.2"
        class="curve-point"
        :class="{ active: dragIndex === i }"
        @pointerdown.stop="onPointDown($event, i)"
        @dblclick.stop="onPointDbl(i)"
      />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CurvePoint } from '@/types/EditParams';

const props = defineProps<{
  modelValue: CurvePoint[];
  color?: string;
}>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: CurvePoint[]): void;
  (e: 'scrubStart'): void;
  (e: 'scrubEnd'): void;
}>();

const svgRef = ref<SVGSVGElement | null>(null);
const dragIndex = ref<number | null>(null);
let scrubbing = false;

const points = computed(() => props.modelValue);
const linePoints = computed(() =>
  props.modelValue.map((p) => `${(p.x * 100).toFixed(2)},${((1 - p.y) * 100).toFixed(2)}`).join(' ')
);

function toLocal(e: PointerEvent): { x: number; y: number } {
  const svg = svgRef.value!;
  const rect = svg.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = 1 - (e.clientY - rect.top) / rect.height;
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}

function beginScrub(): void {
  if (!scrubbing) {
    scrubbing = true;
    emit('scrubStart');
  }
}

function emitPoints(next: CurvePoint[]): void {
  next.sort((a, b) => a.x - b.x);
  emit('update:modelValue', next);
}

function onPointDown(e: PointerEvent, i: number): void {
  (e.target as Element).setPointerCapture?.(e.pointerId);
  dragIndex.value = i;
  beginScrub();
}

function onSvgDown(e: PointerEvent): void {
  const local = toLocal(e);
  const next = props.modelValue.map((p) => ({ ...p }));
  // 找到插入位置（保持 x 升序）
  let idx = next.findIndex((p) => p.x > local.x);
  if (idx === -1) idx = next.length - 1;
  // 与已有点 x 过近则直接拖该点
  const near = next.findIndex((p) => Math.abs(p.x - local.x) < 0.012);
  if (near >= 0) {
    dragIndex.value = near;
  } else {
    next.splice(idx, 0, { x: local.x, y: local.y });
    emitPoints(next);
    dragIndex.value = idx;
  }
  beginScrub();
  svgRef.value?.setPointerCapture?.(e.pointerId);
}

function onMove(e: PointerEvent): void {
  if (dragIndex.value === null) return;
  const local = toLocal(e);
  const next = props.modelValue.map((p) => ({ ...p }));
  const i = dragIndex.value;
  const isEnd = i === 0 || i === next.length - 1;
  if (!isEnd) {
    const lo = next[i - 1].x + 0.004;
    const hi = next[i + 1].x - 0.004;
    next[i].x = Math.min(hi, Math.max(lo, local.x));
  }
  next[i].y = local.y;
  emitPoints(next);
}

function onUp(): void {
  if (dragIndex.value === null) return;
  dragIndex.value = null;
  if (scrubbing) {
    scrubbing = false;
    emit('scrubEnd');
  }
}

function onPointDbl(i: number): void {
  if (i === 0 || i === props.modelValue.length - 1) return; // 端点不可删
  beginScrub();
  emit('update:modelValue', props.modelValue.filter((_, idx) => idx !== i));
  if (scrubbing) {
    scrubbing = false;
    emit('scrubEnd');
  }
}
</script>

<style scoped>
.curve-editor {
  width: 100%;
}
.curve-svg {
  width: 100%;
  height: 180px;
  display: block;
  border-radius: 8px;
  background: var(--bg-0);
  border: 1px solid var(--line);
  touch-action: none;
  cursor: crosshair;
}
.diag {
  stroke: rgba(255, 255, 255, 0.18);
  stroke-width: 0.5;
  stroke-dasharray: 2 2;
  vector-effect: non-scaling-stroke;
}
.curve-point {
  fill: var(--curve-color, #fff);
  stroke: #0b0c0f;
  stroke-width: 0.8;
  cursor: grab;
}
.curve-point.active {
  r: 4.2;
}
</style>

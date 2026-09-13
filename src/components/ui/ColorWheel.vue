<template>
  <div class="wheel-wrap">
    <div
      ref="wheel"
      class="color-wheel"
      :aria-label="label"
      @pointerdown="onDown"
    >
      <span
        class="wheel-knob"
        :style="{ left: `${50 + modelValue.x * 50}%`, top: `${50 - modelValue.y * 50}%` }"
      ></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

export interface WheelValue {
  x: number;
  y: number;
  luma: number;
}

const props = defineProps<{ modelValue: WheelValue; label?: string }>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: WheelValue): void;
  (e: 'drag-start'): void;
  (e: 'drag-end'): void;
}>();

const wheel = ref<HTMLDivElement | null>(null);
let dragging = false;

function pointFromEvent(e: PointerEvent): { x: number; y: number } {
  const el = wheel.value;
  if (!el) return { x: 0, y: 0 };
  const r = el.getBoundingClientRect();
  const radius = Math.max(1, Math.min(r.width, r.height) / 2);
  let x = (e.clientX - (r.left + r.width / 2)) / radius;
  let y = (r.top + r.height / 2 - e.clientY) / radius;
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  return { x, y };
}

function onMove(e: PointerEvent): void {
  if (!dragging) return;
  const p = pointFromEvent(e);
  emit('update:modelValue', { ...props.modelValue, x: p.x, y: p.y });
}

function onUp(): void {
  if (!dragging) return;
  dragging = false;
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onUp);
  emit('drag-end');
}

function onDown(e: PointerEvent): void {
  e.preventDefault();
  dragging = true;
  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  emit('drag-start');
  onMove(e);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}
</script>

<style scoped>
.wheel-wrap {
  display: flex;
  justify-content: center;
}
.color-wheel {
  position: relative;
  width: 82px;
  height: 82px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background:
    radial-gradient(circle, rgba(245, 245, 245, 0.96) 0%, rgba(245, 245, 245, 0.28) 38%, transparent 70%),
    conic-gradient(#ff3b30, #ffcc00, #34c759, #00c7be, #007aff, #af52de, #ff2d55, #ff3b30);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25), 0 2px 8px rgba(0, 0, 0, 0.28);
  touch-action: none;
  cursor: crosshair;
}
.wheel-knob {
  position: absolute;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 2px solid #fff;
  background: rgba(20, 20, 24, 0.72);
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.65);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
</style>

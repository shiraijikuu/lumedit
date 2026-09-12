<template>
  <div class="slider-row">
    <label>{{ label }}</label>
    <input
      class="range"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      @pointerdown="$emit('scrubStart')"
      @pointerup="$emit('scrubEnd')"
      @input="onInput"
      @dblclick="$emit('reset')"
    />
    <input
      v-if="editing"
      ref="inputEl"
      v-model="draft"
      class="val val-edit"
      type="number"
      :min="min"
      :max="max"
      :step="step"
      @keydown.enter.prevent="commit"
      @keydown.esc.prevent="cancel"
      @blur="commit"
    />
    <button v-else type="button" class="val val-btn" :title="t('slider.valTitle', { min, max })" @click="startEdit">
      {{ display }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { t } from '@/i18n';

const props = defineProps<{
  label: string;
  modelValue: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: number): void;
  (e: 'scrubStart'): void;
  (e: 'scrubEnd'): void;
  (e: 'reset'): void;
}>();

const decimals = computed(() => props.decimals ?? 2);
const display = computed(() => String(Number(props.modelValue.toFixed(decimals.value))));

const editing = ref(false);
const draft = ref('');
const inputEl = ref<HTMLInputElement | null>(null);

function onInput(e: Event): void {
  emit('update:modelValue', Number((e.target as HTMLInputElement).value));
}

function startEdit(): void {
  draft.value = String(Number(props.modelValue.toFixed(decimals.value)));
  editing.value = true;
  nextTick(() => {
    inputEl.value?.focus();
    inputEl.value?.select();
  });
}

function cancel(): void {
  editing.value = false;
}

function commit(): void {
  if (!editing.value) return;
  editing.value = false;
  const v = parseFloat(draft.value);
  if (!Number.isFinite(v)) return;
  let clamped = Math.min(props.max, Math.max(props.min, v));
  if (props.step > 0) clamped = Math.round(clamped / props.step) * props.step;
  clamped = Number(clamped.toFixed(decimals.value));
  if (clamped === props.modelValue) return;
  // 与拖动一致：一次编辑只压一次撤销栈
  emit('scrubStart');
  emit('update:modelValue', clamped);
  emit('scrubEnd');
}
</script>

<style scoped>
.slider-row {
  display: grid;
  grid-template-columns: 52px 1fr 56px;
  align-items: center;
  gap: 10px;
  height: 30px;
}
.slider-row label {
  font-size: 12.5px;
  color: var(--txt-1);
  white-space: nowrap;
}
.range {
  width: 100%;
  height: 4px;
  accent-color: var(--accent);
  cursor: pointer;
}
.val {
  width: 56px;
  box-sizing: border-box;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  border-radius: 7px;
}
.val-btn {
  padding: 4px 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--txt-0);
  cursor: text;
  transition: background 0.15s var(--ease), border-color 0.15s var(--ease);
}
.val-btn:hover {
  background: var(--bg-2);
  border-color: var(--line);
}
.val-edit {
  padding: 4px 6px;
  background: var(--bg-0);
  border: 1px solid var(--accent);
  color: var(--txt-0);
  outline: none;
  -moz-appearance: textfield;
}
.val-edit::-webkit-outer-spin-button,
.val-edit::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
</style>

<template>
  <div class="tone">
    <template v-for="g in groups" :key="g.title">
      <p class="group-label">
        {{ t(g.title) }}
        <button
          v-if="g.picker"
          type="button"
          class="ghost mini picker-btn"
          :class="{ active: store.pickerActive }"
          :title="t('adjust.pickerTitle')"
          @click="store.togglePicker()"
        >
          {{ t('adjust.picker') }}
        </button>
      </p>
      <SliderRow
        v-for="s in g.items"
        :key="s.key"
        :label="t(s.label)"
        :model-value="store.params.adjust[s.key]"
        :min="s.min"
        :max="s.max"
        :step="0.01"
        :decimals="2"
        @update:model-value="onSlider(s.key, $event)"
        @scrub-start="store.mutate(() => {}, true)"
        @scrub-end="store.endScrub()"
        @reset="onReset(s.key)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { AdjustParams } from '@/types/EditParams';
import { defaultEditParams } from '@/types/EditParams';
import { useEditorStore } from '@/stores/editor';
import { t } from '@/i18n';
import SliderRow from '../../ui/SliderRow.vue';

const store = useEditorStore();

type Item = { key: keyof AdjustParams; label: string; min: number; max: number };
const groups: Array<{ title: string; items: Item[]; picker?: boolean }> = [
  {
    title: 'adjust.wb',
    picker: true,
    items: [
      { key: 'temperature', label: 'adjust.temperature', min: -1, max: 1 },
      { key: 'tint', label: 'adjust.tint', min: -1, max: 1 },
    ],
  },
  {
    title: 'adjust.light',
    items: [
      { key: 'exposure', label: 'adjust.exposure', min: -2, max: 2 },
      { key: 'contrast', label: 'adjust.contrast', min: -1, max: 1 },
      { key: 'highlights', label: 'adjust.highlights', min: -1, max: 1 },
      { key: 'shadows', label: 'adjust.shadows', min: -1, max: 1 },
      { key: 'whites', label: 'adjust.whites', min: -1, max: 1 },
      { key: 'blacks', label: 'adjust.blacks', min: -1, max: 1 },
      { key: 'brightness', label: 'adjust.brightness', min: -1, max: 1 },
    ],
  },
  {
    title: 'adjust.presence',
    items: [
      { key: 'clarity', label: 'adjust.clarity', min: -1, max: 1 },
      { key: 'dehaze', label: 'adjust.dehaze', min: -1, max: 1 },
      { key: 'vibrance', label: 'adjust.vibrance', min: -1, max: 1 },
      { key: 'saturation', label: 'adjust.saturation', min: -1, max: 1 },
    ],
  },
];

function onSlider(key: keyof AdjustParams, v: number): void {
  store.params.adjust[key] = v;
}
function onReset(key: keyof AdjustParams): void {
  store.mutate((p) => {
    p.adjust[key] = defaultEditParams.adjust[key];
  });
}
</script>

<style scoped>
.group-label {
  margin: 10px 0 2px;
  font-size: 11px;
  font-weight: 600;
  color: var(--txt-2);
  letter-spacing: 0.5px;
}
.group-label:first-child {
  margin-top: 0;
}
.group-label {
  display: flex;
  align-items: center;
  gap: 8px;
}
.picker-btn {
  margin-left: auto;
  font-size: 10.5px;
  padding: 1px 7px;
}
.picker-btn.active {
  color: var(--accent);
  border-color: var(--accent);
}
</style>

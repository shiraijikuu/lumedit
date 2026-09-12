<template>
  <div class="effects">
    <SliderRow
      v-for="s in sliders"
      :key="s.key"
      :label="t(s.label)"
      :model-value="store.params.effects[s.key]"
      :min="s.min"
      :max="s.max"
      :step="0.01"
      :decimals="2"
      @update:model-value="onSlider(s.key, $event)"
      @scrub-start="store.mutate(() => {}, true)"
      @scrub-end="store.endScrub()"
      @reset="onReset(s.key)"
    />
  </div>
</template>

<script setup lang="ts">
import type { EffectsParams } from '@/types/EditParams';
import { defaultEditParams } from '@/types/EditParams';
import { useEditorStore } from '@/stores/editor';
import { t } from '@/i18n';
import SliderRow from '../../ui/SliderRow.vue';

const store = useEditorStore();
const sliders: Array<{ key: keyof EffectsParams; label: string; min: number; max: number }> = [
  { key: 'vignette', label: 'adjust.vignette', min: -1, max: 1 },
  { key: 'grain', label: 'adjust.grain', min: 0, max: 1 },
  { key: 'sharpen', label: 'adjust.sharpen', min: 0, max: 1 },
  { key: 'denoise', label: 'adjust.denoise', min: 0, max: 1 },
];

function onSlider(key: keyof EffectsParams, v: number): void {
  store.params.effects[key] = v;
}
function onReset(key: keyof EffectsParams): void {
  store.mutate((p) => {
    p.effects[key] = defaultEditParams.effects[key];
  });
}
</script>

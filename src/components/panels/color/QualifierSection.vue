<template>
  <div class="qual">
    <div class="opt-row">
      <span>{{ t('qualifier.enable') }}</span>
      <ToggleSwitch
        :model-value="q.enabled"
        @update:model-value="set((x) => (x.enabled = $event))"
      />
    </div>
    <template v-if="q.enabled">
      <button type="button" class="picker-btn" :class="{ active: store.qualifierPicker }" @click="store.toggleQualifierPicker()">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg>
        {{ store.qualifierPicker ? t('qualifier.picking') : t('qualifier.pick') }}
        <span class="hue-badge" :style="{ background: `hsl(${q.centerHue},80%,55%)` }"></span>
        {{ Math.round(q.centerHue) }}°
      </button>
      <SliderRow :label="t('qualifier.centerHue')" :model-value="q.centerHue" :min="0" :max="360" :step="1" :decimals="0" @update:model-value="set((x) => (x.centerHue = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((x) => (x.centerHue = 0))" />
      <SliderRow :label="t('qualifier.hueRange')" :model-value="q.hueRange" :min="5" :max="180" :step="1" :decimals="0" @update:model-value="set((x) => (x.hueRange = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((x) => (x.hueRange = 30))" />
      <SliderRow :label="t('qualifier.hueFeather')" :model-value="q.hueFeather" :min="0" :max="60" :step="1" :decimals="0" @update:model-value="set((x) => (x.hueFeather = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((x) => (x.hueFeather = 15))" />
      <p class="group-label">{{ t('qualifier.adjust') }}</p>
      <SliderRow :label="t('adjust.exposure')" :model-value="q.exposure" :min="-2" :max="2" :step="0.01" :decimals="2" @update:model-value="set((x) => (x.exposure = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((x) => (x.exposure = 0))" />
      <SliderRow :label="t('adjust.temperature')" :model-value="q.temperature" :min="-1" :max="1" :step="0.01" :decimals="2" @update:model-value="set((x) => (x.temperature = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((x) => (x.temperature = 0))" />
      <SliderRow :label="t('adjust.saturation')" :model-value="q.saturation" :min="-1" :max="1" :step="0.01" :decimals="2" @update:model-value="set((x) => (x.saturation = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((x) => (x.saturation = 0))" />
      <p class="hint">{{ t('qualifier.hint') }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { QualifierParams } from '@/types/EditParams';
import { useEditorStore } from '@/stores/editor';
import { t } from '@/i18n';
import SliderRow from '../../ui/SliderRow.vue';
import ToggleSwitch from '../../ui/ToggleSwitch.vue';

const store = useEditorStore();
const q = computed<QualifierParams>(() => store.params.qualifier);

function set(fn: (x: QualifierParams) => void): void {
  store.mutate((p) => fn(p.qualifier));
}
</script>

<style scoped>
.group-label {
  margin: 10px 0 2px;
  font-size: 11px;
  font-weight: 600;
  color: var(--txt-2);
}
.hint {
  margin-top: 8px;
  font-size: 11px;
  color: var(--txt-2);
  line-height: 1.5;
}
.picker-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 10px;
  margin: 4px 0 8px;
  border-radius: 8px;
  border: 1px solid var(--bg-3);
  background: var(--bg-2);
  color: var(--txt-1);
  font-size: 12px;
  cursor: pointer;
}
.picker-btn.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}
.hue-badge {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.4);
  display: inline-block;
}
</style>

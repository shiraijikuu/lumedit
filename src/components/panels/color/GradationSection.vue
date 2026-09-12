<template>
  <div class="grad">
    <div class="opt-row">
      <span>{{ t('gradation.enable') }}</span>
      <ToggleSwitch
        :model-value="store.params.gradation.enabled"
        @update:model-value="onEnabled($event)"
      />
    </div>
    <template v-if="store.params.gradation.enabled">
      <p class="group-label">{{ t('gradation.type') }}</p>
      <div class="segmented">
        <button :class="{ active: store.params.gradation.type === 'linear' }" @click="set((g) => (g.type = 'linear'))">
          {{ t('gradation.linear') }}
        </button>
        <button :class="{ active: store.params.gradation.type === 'radial' }" @click="set((g) => (g.type = 'radial'))">
          {{ t('gradation.radial') }}
        </button>
      </div>
      <SliderRow :label="t('adjust.exposure')" :model-value="store.params.gradation.exposure" :min="-2" :max="2" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.exposure = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.exposure = 0))" />
      <SliderRow :label="t('adjust.temperature')" :model-value="store.params.gradation.temperature" :min="-1" :max="1" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.temperature = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.temperature = 0))" />
      <SliderRow :label="t('adjust.tint')" :model-value="store.params.gradation.tint" :min="-1" :max="1" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.tint = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.tint = 0))" />
      <p class="group-label">{{ t('gradation.region') }}</p>
      <SliderRow :label="t('gradation.posX')" :model-value="store.params.gradation.x" :min="0" :max="1" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.x = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.x = 0.2))" />
      <SliderRow :label="t('gradation.posY')" :model-value="store.params.gradation.y" :min="0" :max="1" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.y = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.y = 0.2))" />
      <SliderRow :label="t('gradation.width')" :model-value="store.params.gradation.w" :min="0.05" :max="1" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.w = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.w = 0.6))" />
      <SliderRow :label="t('gradation.height')" :model-value="store.params.gradation.h" :min="0.05" :max="1" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.h = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.h = 0.6))" />
      <SliderRow :label="t('gradation.rotation')" :model-value="store.params.gradation.rotation" :min="-180" :max="180" :step="1" :decimals="0" @update:model-value="set((g) => (g.rotation = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.rotation = 0))" />
      <p class="hint">{{ t('gradation.hint') }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { GradationParams } from '@/types/EditParams';
import { useEditorStore } from '@/stores/editor';
import { t } from '@/i18n';
import SliderRow from '../../ui/SliderRow.vue';
import ToggleSwitch from '../../ui/ToggleSwitch.vue';

const store = useEditorStore();

function set(fn: (g: GradationParams) => void): void {
  store.mutate((p) => {
    fn(p.gradation);
  });
}
function onEnabled(v: boolean): void {
  store.mutate((p) => {
    p.gradation.enabled = v;
  });
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
</style>

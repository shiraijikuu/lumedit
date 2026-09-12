<template>
  <div class="hsl">
    <div class="hue-grid">
      <button
        v-for="h in HSL_HUES"
        :key="h"
        type="button"
        class="hue-chip"
        :class="{ active: active === h }"
        @click="active = h"
      >
        <span class="dot" :style="{ background: DOT[h] }"></span>{{ t(`adjust.hue${cap(h)}`) }}
      </button>
    </div>

    <SliderRow
      :label="t('adjust.hue')"
      :model-value="store.params.hsl[active].hue"
      :min="-1"
      :max="1"
      :step="0.01"
      :decimals="2"
      @update:model-value="set('hue', $event)"
      @scrub-start="store.mutate(() => {}, true)"
      @scrub-end="store.endScrub()"
      @reset="reset('hue')"
    />
    <SliderRow
      :label="t('adjust.sat')"
      :model-value="store.params.hsl[active].sat"
      :min="-1"
      :max="1"
      :step="0.01"
      :decimals="2"
      @update:model-value="set('sat', $event)"
      @scrub-start="store.mutate(() => {}, true)"
      @scrub-end="store.endScrub()"
      @reset="reset('sat')"
    />
    <SliderRow
      :label="t('adjust.lum')"
      :model-value="store.params.hsl[active].lum"
      :min="-1"
      :max="1"
      :step="0.01"
      :decimals="2"
      @update:model-value="set('lum', $event)"
      @scrub-start="store.mutate(() => {}, true)"
      @scrub-end="store.endScrub()"
      @reset="reset('lum')"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { HSL_HUES, type HslHue, type HslChannel } from '@/types/EditParams';
import { defaultEditParams } from '@/types/EditParams';
import { useEditorStore } from '@/stores/editor';
import { t } from '@/i18n';
import SliderRow from '../../ui/SliderRow.vue';

const store = useEditorStore();
const active = ref<HslHue>('red');
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const DOT: Record<HslHue, string> = {
  red: '#ff453a',
  orange: '#ff9f0a',
  yellow: '#ffd60a',
  green: '#30d158',
  aqua: '#64d2ff',
  blue: '#0a84ff',
  purple: '#bf5af2',
  magenta: '#ff375f',
};

function set(key: keyof HslChannel, v: number): void {
  store.params.hsl[active.value][key] = v;
}
function reset(key: keyof HslChannel): void {
  store.mutate((p) => {
    p.hsl[active.value][key] = defaultEditParams.hsl[active.value][key];
  });
}
</script>

<style scoped>
.hue-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-bottom: 10px;
}
.hue-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 6px 2px;
  font-size: 11.5px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--txt-1);
}
.hue-chip.active {
  background: var(--accent-soft);
  border-color: rgba(10, 132, 255, 0.5);
  color: #7db8ff;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
</style>

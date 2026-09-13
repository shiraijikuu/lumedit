<template>
  <div class="grad">
    <div class="mask-toolbar">
      <button type="button" class="ghost mini" :disabled="list.length >= MAX" @click="store.addGradation('linear')">
        ＋ {{ t('gradation.addLinear') }}
      </button>
      <button type="button" class="ghost mini" :disabled="list.length >= MAX" @click="store.addGradation('radial')">
        ＋ {{ t('gradation.addRadial') }}
      </button>
      <span class="mask-count">{{ list.length }}/{{ MAX }}</span>
    </div>

    <div v-if="!list.length" class="mask-empty">{{ t('gradation.empty') }}</div>
    <div v-else class="mask-list">
      <div
        v-for="(g, i) in list"
        :key="g.id"
        class="mask-chip"
        :class="{ active: current?.id === g.id }"
      >
        <button type="button" class="mask-name" @click="store.selectGradation(g.id)">
          {{ i + 1 }}. {{ g.type === 'linear' ? t('gradation.linear') : t('gradation.radial') }}
          <span v-if="!g.enabled" class="mask-off">{{ t('gradation.off') }}</span>
        </button>
        <button type="button" class="mask-op" :title="t('gradation.duplicate')" @click="store.duplicateGradation(g.id)">⧉</button>
        <button type="button" class="mask-op" :title="t('common.delete')" @click="store.removeGradation(g.id)">×</button>
      </div>
    </div>

    <template v-if="current">
      <div class="opt-row">
        <span>{{ t('gradation.enable') }}</span>
        <ToggleSwitch
          :model-value="current.enabled"
          @update:model-value="set((g) => (g.enabled = $event))"
        />
      </div>
      <template v-if="current.enabled">
        <p class="group-label">{{ t('gradation.type') }}</p>
        <div class="segmented">
          <button :class="{ active: current.type === 'linear' }" @click="set((g) => (g.type = 'linear'))">
            {{ t('gradation.linear') }}
          </button>
          <button :class="{ active: current.type === 'radial' }" @click="set((g) => (g.type = 'radial'))">
            {{ t('gradation.radial') }}
          </button>
        </div>
        <SliderRow :label="t('adjust.exposure')" :model-value="current.exposure" :min="-2" :max="2" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.exposure = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.exposure = 0))" />
        <SliderRow :label="t('adjust.temperature')" :model-value="current.temperature" :min="-1" :max="1" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.temperature = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.temperature = 0))" />
        <SliderRow :label="t('adjust.tint')" :model-value="current.tint" :min="-1" :max="1" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.tint = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.tint = 0))" />
        <p class="group-label">{{ t('gradation.region') }}</p>
        <SliderRow :label="t('gradation.p1x')" :model-value="current.x1" :min="-0.5" :max="1.5" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.x1 = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.x1 = 0.15))" />
        <SliderRow :label="t('gradation.p1y')" :model-value="current.y1" :min="-0.5" :max="1.5" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.y1 = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.y1 = 0.5))" />
        <SliderRow :label="t('gradation.p2x')" :model-value="current.x2" :min="-0.5" :max="1.5" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.x2 = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.x2 = 0.85))" />
        <SliderRow :label="t('gradation.p2y')" :model-value="current.y2" :min="-0.5" :max="1.5" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.y2 = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.y2 = 0.5))" />
        <p class="hint">{{ t('gradation.hint') }}</p>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { GradationItem } from '@/types/EditParams';
import { MAX_GRADATIONS } from '@/types/EditParams';
import { useEditorStore } from '@/stores/editor';
import { t } from '@/i18n';
import SliderRow from '../../ui/SliderRow.vue';
import ToggleSwitch from '../../ui/ToggleSwitch.vue';

const store = useEditorStore();
const MAX = MAX_GRADATIONS;

const list = computed(() => store.params.gradations);
const current = computed<GradationItem | null>(() => {
  const all = store.params.gradations;
  if (!all.length) return null;
  return all.find((g) => g.id === store.selectedGradId) ?? all[0];
});

function set(fn: (g: GradationItem) => void): void {
  if (current.value) store.mutateGrad(current.value.id, fn);
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
.mask-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.mask-toolbar button {
  flex: 1;
  padding: 5px 4px;
  font-size: 11px;
}
.mask-count {
  font-size: 11px;
  color: var(--txt-2);
  font-variant-numeric: tabular-nums;
}
.mask-empty {
  font-size: 11.5px;
  color: var(--txt-2);
  padding: 6px 0 10px;
}
.mask-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}
.mask-chip {
  display: flex;
  align-items: center;
  gap: 2px;
  border-radius: 8px;
  border: 1px solid var(--bg-3);
  background: var(--bg-2);
  padding: 2px 4px 2px 8px;
}
.mask-chip.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.mask-name {
  flex: 1;
  text-align: left;
  font-size: 12px;
  color: var(--txt-1);
  background: transparent;
  border: none;
  padding: 4px 0;
  cursor: pointer;
}
.mask-off {
  color: var(--txt-2);
  font-size: 10.5px;
  margin-left: 6px;
}
.mask-op {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--txt-2);
  cursor: pointer;
  font-size: 13px;
}
.mask-op:hover {
  background: var(--bg-3);
  color: var(--txt-1);
}
</style>

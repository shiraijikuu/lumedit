<template>
  <div class="grad">
    <div class="mask-toolbar">
      <button type="button" class="ghost mini" :disabled="list.length >= MAX" @click="store.addGradation('linear')">
        ＋ {{ t('gradation.addLinear') }}
      </button>
      <button type="button" class="ghost mini" :disabled="list.length >= MAX" @click="store.addGradation('radial')">
        ＋ {{ t('gradation.addRadial') }}
      </button>
      <button type="button" class="ghost mini" :disabled="list.length >= MAX" @click="store.addGradation('brush')">
        ＋ {{ t('gradation.addBrush') }}
      </button>
      <button type="button" class="ghost mini" :disabled="list.length >= MAX" @click="store.addGradation('luminance')">
        ＋ {{ t('gradation.addLuma') }}
      </button>
      <button type="button" class="ghost mini" :disabled="list.length >= MAX" @click="store.addGradation('color')">
        ＋ {{ t('gradation.addColor') }}
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
          {{ i + 1 }}. {{ t('gradation.' + g.type) }}
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
          <button :class="{ active: current.type === 'brush' }" @click="set((g) => (g.type = 'brush'))">
            {{ t('gradation.brush') }}
          </button>
          <button :class="{ active: current.type === 'luminance' }" @click="set((g) => (g.type = 'luminance'))">
            {{ t('gradation.luminance') }}
          </button>
          <button :class="{ active: current.type === 'color' }" @click="set((g) => (g.type = 'color'))">
            {{ t('gradation.color') }}
          </button>
        </div>
        <p class="group-label">{{ t('gradation.combine') }}</p>
        <div class="segmented">
          <button
            v-for="op in ([0, 1, 2] as const)"
            :key="op"
            :class="{ active: current.combine === (op === 0 ? 'union' : op === 1 ? 'intersect' : 'subtract') }"
            :disabled="firstEnabledId === current.id"
            @click="set((g) => (g.combine = op === 0 ? 'union' : op === 1 ? 'intersect' : 'subtract'))"
          >
            {{ t(op === 0 ? 'gradation.combineUnion' : op === 1 ? 'gradation.combineIntersect' : 'gradation.combineSubtract') }}
          </button>
        </div>
        <p v-if="firstEnabledId === current.id" class="hint">{{ t('gradation.firstHint') }}</p>
        <SliderRow :label="t('adjust.exposure')" :model-value="current.exposure" :min="-2" :max="2" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.exposure = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.exposure = 0))" />
        <SliderRow :label="t('adjust.temperature')" :model-value="current.temperature" :min="-1" :max="1" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.temperature = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.temperature = 0))" />
        <SliderRow :label="t('adjust.tint')" :model-value="current.tint" :min="-1" :max="1" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.tint = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.tint = 0))" />
        <template v-if="current.type === 'linear' || current.type === 'radial'">
          <p class="group-label">{{ t('gradation.region') }}</p>
          <SliderRow :label="t('gradation.p1x')" :model-value="current.x1" :min="-0.5" :max="1.5" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.x1 = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.x1 = 0.15))" />
          <SliderRow :label="t('gradation.p1y')" :model-value="current.y1" :min="-0.5" :max="1.5" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.y1 = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.y1 = 0.5))" />
          <SliderRow :label="t('gradation.p2x')" :model-value="current.x2" :min="-0.5" :max="1.5" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.x2 = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.x2 = 0.85))" />
          <SliderRow :label="t('gradation.p2y')" :model-value="current.y2" :min="-0.5" :max="1.5" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.y2 = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.y2 = 0.5))" />
        </template>
        <template v-else-if="current.type === 'luminance'">
          <p class="group-label">{{ t('gradation.lumaBand') }}</p>
          <SliderRow :label="t('gradation.lumaLo')" :model-value="current.lumaLo" :min="0" :max="1" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.lumaLo = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.lumaLo = 0.25))" />
          <SliderRow :label="t('gradation.lumaHi')" :model-value="current.lumaHi" :min="0" :max="1" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.lumaHi = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.lumaHi = 0.75))" />
          <SliderRow :label="t('gradation.lumaSoft')" :model-value="current.lumaSoft" :min="0" :max="0.5" :step="0.01" :decimals="2" @update:model-value="set((g) => (g.lumaSoft = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.lumaSoft = 0.15))" />
        </template>
        <template v-else-if="current.type === 'color'">
          <p class="group-label">{{ t('gradation.hueBand') }}</p>
          <SliderRow :label="t('qualifier.centerHue')" :model-value="current.hueCenter" :min="0" :max="360" :step="1" :decimals="0" @update:model-value="set((g) => (g.hueCenter = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.hueCenter = 0))" />
          <SliderRow :label="t('qualifier.hueRange')" :model-value="current.hueRange" :min="0" :max="180" :step="1" :decimals="0" @update:model-value="set((g) => (g.hueRange = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.hueRange = 30))" />
          <SliderRow :label="t('qualifier.hueFeather')" :model-value="current.hueFeather" :min="0" :max="90" :step="1" :decimals="0" @update:model-value="set((g) => (g.hueFeather = $event))" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="set((g) => (g.hueFeather = 15))" />
        </template>
        <template v-else-if="current.type === 'brush'">
          <div class="opt-row">
            <span>{{ t('gradation.painting') }}</span>
            <ToggleSwitch
              :model-value="store.paintBrushId === current.id"
              @update:model-value="store.setPaintBrush($event ? current.id : null)"
            />
          </div>
          <SliderRow :label="t('gradation.brushSize')" :model-value="store.brushRadius" :min="0.02" :max="0.3" :step="0.005" :decimals="3" @update:model-value="store.brushRadius = $event" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="store.brushRadius = 0.08" />
          <SliderRow :label="t('gradation.brushHard')" :model-value="store.brushHardness" :min="0" :max="1" :step="0.05" :decimals="2" @update:model-value="store.brushHardness = $event" @scrub-start="store.mutate(() => {}, true)" @scrub-end="store.endScrub()" @reset="store.brushHardness = 0.7" />
          <p class="hint">{{ t('gradation.brushHint') }}</p>
        </template>
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

/** 第一个启用中的蒙版（其组合方式由渲染端忽略） */
const firstEnabledId = computed(() => list.value.find((g) => g.enabled)?.id ?? null);
</script>

<style scoped>
.opt-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  font-size: 12px;
  color: var(--txt-1);
}
.opt-row > span {
  min-width: 0;
  overflow-wrap: anywhere;
}
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
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.mask-toolbar button {
  min-width: 0;
  width: 100%;
  padding: 5px 4px;
  font-size: 11px;
  line-height: 1.25;
  white-space: normal;
  overflow-wrap: anywhere;
}
.mask-count {
  grid-column: 1 / -1;
  text-align: right;
  font-size: 11px;
  color: var(--txt-2);
  font-variant-numeric: tabular-nums;
}
.grad .segmented {
  flex-wrap: wrap;
}
.grad .segmented button {
  min-width: 0;
  flex: 1 1 30%;
  padding: 5px 2px;
  font-size: 10.5px;
  line-height: 1.25;
  white-space: normal;
  overflow-wrap: anywhere;
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
  min-width: 0;
  text-align: left;
  font-size: 12px;
  color: var(--txt-1);
  background: transparent;
  border: none;
  padding: 4px 0;
  cursor: pointer;
  white-space: normal;
  overflow-wrap: anywhere;
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

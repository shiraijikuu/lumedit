<template>
  <div class="log-wheels">
    <div class="log-head">
      <span>{{ t('adjust.logWheelsEnable') }}</span>
      <ToggleSwitch
        :model-value="store.params.logWheels.enabled"
        @update:model-value="store.mutate((p) => (p.logWheels.enabled = $event))"
      />
    </div>

    <template v-if="store.params.logWheels.enabled">
      <div v-for="g in groups" :key="g.key" class="wheel-row">
        <ColorWheel
          :label="t(g.label)"
          :model-value="store.params.logWheels[g.key]"
          @update:model-value="setWheel(g.key, $event)"
          @drag-start="store.mutate(() => {}, true)"
          @drag-end="store.endScrub()"
        />
        <div class="wheel-meta">
          <div class="wheel-name">{{ t(g.label) }}</div>
          <SliderRow
            :label="t('adjust.logLuma')"
            :model-value="store.params.logWheels[g.key].luma"
            :min="-1"
            :max="1"
            :step="0.01"
            :decimals="2"
            @update:model-value="setLuma(g.key, $event)"
            @scrub-start="store.mutate(() => {}, true)"
            @scrub-end="store.endScrub()"
            @reset="reset(g.key)"
          />
        </div>
      </div>
      <p class="hint">{{ t('adjust.logHint') }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { LogWheel, LogWheelsParams } from '@/types/EditParams';
import { defaultEditParams } from '@/types/EditParams';
import { useEditorStore } from '@/stores/editor';
import { t } from '@/i18n';
import ColorWheel, { type WheelValue } from '../../ui/ColorWheel.vue';
import SliderRow from '../../ui/SliderRow.vue';
import ToggleSwitch from '../../ui/ToggleSwitch.vue';

type WheelKey = keyof Pick<LogWheelsParams, 'lift' | 'gamma' | 'gain'>;
const store = useEditorStore();
const groups: Array<{ key: WheelKey; label: string }> = [
  { key: 'lift', label: 'adjust.logLift' },
  { key: 'gamma', label: 'adjust.logGamma' },
  { key: 'gain', label: 'adjust.logGain' },
];

function setWheel(key: WheelKey, v: WheelValue): void {
  store.params.logWheels[key].x = v.x;
  store.params.logWheels[key].y = v.y;
}
function setLuma(key: WheelKey, value: number): void {
  store.params.logWheels[key].luma = value;
}
function reset(key: WheelKey): void {
  store.mutate((p) => {
    const d: LogWheel = defaultEditParams.logWheels[key];
    p.logWheels[key] = { x: d.x, y: d.y, luma: d.luma };
  });
}
</script>

<style scoped>
.log-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0 8px;
  color: var(--txt-1);
  font-size: 12px;
}
.wheel-row {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 7px 0;
  border-top: 1px solid var(--line);
}
.wheel-meta {
  min-width: 0;
}
.wheel-name {
  margin-bottom: 2px;
  color: var(--txt-2);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.4px;
}
.hint {
  margin-top: 8px;
  font-size: 11px;
  color: var(--txt-2);
  line-height: 1.5;
}
</style>

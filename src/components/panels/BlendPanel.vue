<template>
  <div class="blend">
    <div class="panel-section">
      <div class="panel-title" style="margin-bottom: 0">
        {{ t('blend.title') }}
        <ToggleSwitch
          :model-value="!!store.params.blend?.enabled"
          @update:model-value="store.setBlendEnabled($event)"
        />
      </div>
    </div>

    <template v-if="store.params.blend?.enabled">
      <div class="panel-section">
        <div class="add-row">
          <button type="button" class="primary add-btn" :disabled="layers.length >= MAX" @click="store.addBlendLayerFromPicker()">
            ＋ {{ t('blend.addLayer') }}
          </button>
          <span class="layer-count">{{ layers.length }}/{{ MAX }}</span>
        </div>

        <p class="group-label">{{ t('blend.position') }}</p>
        <div class="segmented">
          <button :class="{ active: position === 'before-lut' }" @click="store.setBlendPosition('before-lut')">
            {{ t('blend.beforeLut') }}
          </button>
          <button :class="{ active: position === 'after-lut' }" @click="store.setBlendPosition('after-lut')">
            {{ t('blend.afterLut') }}
          </button>
        </div>
        <p class="hint">{{ t('blend.positionHint') }}</p>
      </div>

      <div class="panel-section" v-if="!layers.length">
        <div class="layer-empty">{{ t('blend.empty') }}</div>
      </div>

      <div class="panel-section" v-else>
        <div class="layer-list">
          <div
            v-for="(l, i) in layers"
            :key="l.id"
            class="layer-chip"
            :class="{ active: current?.id === l.id }"
          >
            <button type="button" class="layer-name" @click="store.selectBlendLayer(l.id)">
              <span class="layer-idx">{{ i + 1 }}</span>
              <span class="layer-txt">{{ l.name }}</span>
              <span v-if="!l.visible" class="layer-off">{{ t('blend.off') }}</span>
            </button>
            <button type="button" class="layer-op" :title="t('blend.eye')" @click="store.toggleBlendLayerVisible(l.id)">
              {{ l.visible ? '◉' : '○' }}
            </button>
            <button type="button" class="layer-op" :title="t('blend.up')" :disabled="i === 0" @click="store.moveBlendLayer(l.id, -1)">↓</button>
            <button type="button" class="layer-op" :title="t('blend.down')" :disabled="i === layers.length - 1" @click="store.moveBlendLayer(l.id, 1)">↑</button>
            <button type="button" class="layer-op" :title="t('blend.duplicate')" @click="store.duplicateBlendLayer(l.id)">⧉</button>
            <button type="button" class="layer-op danger" :title="t('common.delete')" @click="store.removeBlendLayer(l.id)">×</button>
          </div>
        </div>
      </div>

      <template v-if="current">
        <div class="panel-section">
          <p class="group-label">{{ t('blend.modeLabel') }}</p>
          <div class="select-wrap">
            <select :value="current.mode" @change="onModeChange(($event.target as HTMLSelectElement).value as BlendMode)">
              <option v-for="m in MODES" :key="m" :value="m">{{ t('blend.mode.' + m) }}</option>
            </select>
          </div>

          <SliderRow
            :label="t('blend.opacity')"
            :model-value="current.opacity"
            :min="0" :max="1" :step="0.01" :decimals="2"
            @update:model-value="set((l) => (l.opacity = $event), true)"
            @scrub-start="store.mutate(() => {}, true)"
            @scrub-end="store.endScrub()"
            @reset="set((l) => (l.opacity = 1))"
          />
          <SliderRow
            :label="t('blend.scale')"
            :model-value="current.scale"
            :min="0.05" :max="5" :step="0.01" :decimals="2"
            @update:model-value="set((l) => (l.scale = $event), true)"
            @scrub-start="store.mutate(() => {}, true)"
            @scrub-end="store.endScrub()"
            @reset="set((l) => (l.scale = 1))"
          />
          <SliderRow
            :label="t('blend.rotation')"
            :model-value="current.rotation"
            :min="-180" :max="180" :step="1" :decimals="0"
            @update:model-value="set((l) => (l.rotation = $event), true)"
            @scrub-start="store.mutate(() => {}, true)"
            @scrub-end="store.endScrub()"
            @reset="set((l) => (l.rotation = 0))"
          />
          <SliderRow
            :label="t('blend.posX')"
            :model-value="current.x"
            :min="-0.5" :max="1.5" :step="0.005" :decimals="3"
            @update:model-value="set((l) => (l.x = $event), true)"
            @scrub-start="store.mutate(() => {}, true)"
            @scrub-end="store.endScrub()"
            @reset="set((l) => (l.x = 0.5))"
          />
          <SliderRow
            :label="t('blend.posY')"
            :model-value="current.y"
            :min="-0.5" :max="1.5" :step="0.005" :decimals="3"
            @update:model-value="set((l) => (l.y = $event), true)"
            @scrub-start="store.mutate(() => {}, true)"
            @scrub-end="store.endScrub()"
            @reset="set((l) => (l.y = 0.5))"
          />

          <p class="group-label">{{ t('blend.flip') }}</p>
          <div class="segmented">
            <button :class="{ active: current.flipH }" @click="set((l) => (l.flipH = !l.flipH))">{{ t('blend.flipH') }}</button>
            <button :class="{ active: current.flipV }" @click="set((l) => (l.flipV = !l.flipV))">{{ t('blend.flipV') }}</button>
          </div>
          <p class="hint">{{ t('blend.hint') }}</p>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useEditorStore } from '@/stores/editor';
import { t } from '@/i18n';
import { BLEND_MODES, MAX_BLEND_LAYERS, type BlendLayer, type BlendMode } from '@/types/EditParams';
import SliderRow from '../ui/SliderRow.vue';
import ToggleSwitch from '../ui/ToggleSwitch.vue';

const store = useEditorStore();
const MAX = MAX_BLEND_LAYERS;
const MODES = BLEND_MODES;

const layers = computed(() => store.params.blend?.layers ?? []);
const position = computed(() => store.params.blend?.position ?? 'after-lut');
const current = computed<BlendLayer | null>(() => {
  const all = store.params.blend?.layers ?? [];
  if (!all.length) return null;
  return all.find((l) => l.id === store.selectedBlendId) ?? all[all.length - 1];
});

function set(fn: (l: BlendLayer) => void, scrub = false): void {
  if (current.value) store.mutateBlendLayer(current.value.id, fn, scrub);
}
function onModeChange(mode: BlendMode): void {
  if (current.value) store.setBlendMode(current.value.id, mode);
}
</script>

<style scoped>
.add-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.add-btn {
  flex: 1;
}
.layer-count {
  font-size: 11px;
  color: var(--txt-2);
  font-variant-numeric: tabular-nums;
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
.layer-empty {
  font-size: 11.5px;
  color: var(--txt-2);
  padding: 4px 0 8px;
}
.layer-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.layer-chip {
  display: flex;
  align-items: center;
  gap: 1px;
  border-radius: 8px;
  border: 1px solid var(--bg-3);
  background: var(--bg-2);
  padding: 2px 4px 2px 6px;
}
.layer-chip.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.layer-name {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  text-align: left;
  font-size: 12px;
  color: var(--txt-1);
  background: transparent;
  border: none;
  padding: 4px 0;
  cursor: pointer;
}
.layer-idx {
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--bg-3);
  font-size: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.layer-txt {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.layer-off {
  color: var(--txt-2);
  font-size: 10.5px;
  margin-left: 4px;
}
.layer-op {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--txt-2);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}
.layer-op:hover:not(:disabled) {
  background: var(--bg-3);
  color: var(--txt-1);
}
.layer-op:disabled {
  opacity: 0.3;
  cursor: default;
}
.layer-op.danger:hover {
  color: #ff453a;
}
.select-wrap {
  margin-top: 4px;
}
.select-wrap select {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--bg-3);
  background: var(--bg-2);
  color: var(--txt-1);
  font-size: 12.5px;
  outline: none;
  cursor: pointer;
}
.select-wrap select:focus {
  border-color: var(--accent);
}
.segmented {
  display: flex;
  gap: 2px;
  margin-top: 4px;
}
.segmented button {
  flex: 1;
  min-width: 0;
  padding: 6px 4px;
  font-size: 11px;
  white-space: normal;
  overflow-wrap: anywhere;
}
</style>

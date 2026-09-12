<template>
  <div>
    <div class="panel-section">
      <div class="panel-title">{{ t('exportPanel.format') }}</div>
      <div class="segmented">
        <button
          v-for="f in formats"
          :key="f.v"
          :class="{ active: store.exportOptions.format === f.v }"
          @click="store.exportOptions.format = f.v"
        >
          {{ f.label }}
        </button>
      </div>
      <SliderRow
        v-if="store.exportOptions.format !== 'png'"
        :label="t('exportPanel.quality')"
        :model-value="store.exportOptions.quality"
        :min="0.3"
        :max="1"
        :step="0.01"
        :decimals="2"
        style="margin-top: 12px"
        @update:model-value="store.exportOptions.quality = $event"
      />
    </div>

    <div class="panel-section">
      <div class="panel-title">{{ t('exportPanel.outputSize') }}</div>
      <div class="segmented">
        <button
          v-for="s in scales"
          :key="s.v"
          :class="{ active: store.exportOptions.scale === s.v }"
          @click="store.exportOptions.scale = s.v"
        >
          {{ s.label }}
        </button>
      </div>
    </div>

    <div class="panel-section">
      <div class="panel-title">{{ t('exportPanel.metadata') }}</div>
      <div class="opt-row">
        <span>{{ t('exportPanel.keepExif') }}</span>
        <ToggleSwitch
          :model-value="store.exportOptions.keepExif"
          @update:model-value="store.exportOptions.keepExif = $event"
        />
      </div>
      <div class="opt-row">
        <span>
          {{ t('exportPanel.stripGps') }}
          <i v-if="store.meta?.hasGps" class="gps-warn">{{ t('exportPanel.gpsInSrc') }}</i>
        </span>
        <ToggleSwitch
          :model-value="store.exportOptions.stripGps"
          @update:model-value="store.exportOptions.stripGps = $event"
        />
      </div>
      <p class="hint">{{ t('exportPanel.hint') }}</p>
    </div>

    <div class="panel-section">
      <button class="primary export-btn" :disabled="!store.hasImage || store.exporting" @click="store.exportCurrent()">
        {{ store.exporting ? t('exportPanel.exporting') : t('exportPanel.exportBtn') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEditorStore } from '@/stores/editor';
import { t } from '@/i18n';
import SliderRow from '../ui/SliderRow.vue';
import ToggleSwitch from '../ui/ToggleSwitch.vue';

const store = useEditorStore();
const formats = [
  { v: 'jpeg' as const, label: 'JPG' },
  { v: 'png' as const, label: 'PNG' },
  { v: 'webp' as const, label: 'WebP' },
];
const scales = [
  { v: 1, label: '100%' },
  { v: 0.75, label: '75%' },
  { v: 0.5, label: '50%' },
];
</script>

<style scoped>
.opt-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 0;
  color: var(--txt-1);
  font-size: 12.5px;
}
.gps-warn {
  font-style: normal;
  color: var(--warn);
  font-size: 11px;
  margin-left: 6px;
}
.hint {
  margin-top: 8px;
  font-size: 11px;
  color: var(--txt-2);
  line-height: 1.5;
}
.export-btn {
  width: 100%;
  padding: 9px;
  font-size: 13px;
}
</style>

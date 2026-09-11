<template>
  <div class="panel-section">
    <div class="panel-title">
      基础调色
      <button class="ghost" @click="store.resetAdjust()">全部重置</button>
    </div>

    <SliderRow
      v-for="s in sliders"
      :key="s.key"
      :label="s.label"
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
    <p class="hint">双击滑块数值可复位单项</p>
  </div>
</template>

<script setup lang="ts">
import type { AdjustParams } from '@/types/EditParams';
import { defaultEditParams } from '@/types/EditParams';
import { useEditorStore } from '@/stores/editor';
import SliderRow from '../ui/SliderRow.vue';

const store = useEditorStore();

const sliders: Array<{ key: keyof AdjustParams; label: string; min: number; max: number }> = [
  { key: 'exposure', label: '曝光', min: -2, max: 2 },
  { key: 'brightness', label: '亮度', min: -1, max: 1 },
  { key: 'contrast', label: '对比', min: -1, max: 1 },
  { key: 'saturation', label: '饱和', min: -1, max: 1 },
  { key: 'temperature', label: '色温', min: -1, max: 1 },
];

// 直接写响应式参数；scrubStart 已保证整段拖动只压一次撤销栈
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
.hint {
  margin-top: 8px;
  font-size: 11px;
  color: var(--txt-2);
}
</style>

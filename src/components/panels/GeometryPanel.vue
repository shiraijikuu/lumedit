<template>
  <div>
    <div class="panel-section">
      <div class="panel-title">
        裁剪比例
        <button class="ghost" @click="store.resetCrop()">复位选框</button>
      </div>
      <div class="chip-wrap">
        <span
          v-for="r in ratios"
          :key="r.label"
          class="chip"
          :class="{ active: store.cropAspect === r.value }"
          @click="store.setCropAspect(r.value)"
        >
          {{ r.label }}
        </span>
      </div>
      <button
        class="primary crop-enter"
        :style="{ marginTop: '12px', width: '100%' }"
        @click="store.setMode('crop')"
      >
        {{ store.mode === 'crop' ? '正在裁剪（在图上拖选）' : '进入裁剪拖拽' }}
      </button>
    </div>

    <div class="panel-section">
      <div class="panel-title">旋转</div>
      <div class="row" style="margin-bottom: 10px">
        <button style="flex: 1" @click="store.rotate90(-1)">↺ 90°</button>
        <button style="flex: 1" @click="store.rotate90(1)">90° ↻</button>
      </div>
      <SliderRow
        label="角度"
        :model-value="store.params.geometry.rotation"
        :min="-180"
        :max="180"
        :step="1"
        :decimals="0"
        @update:model-value="onAngle"
        @scrub-start="store.mutate(() => {}, true)"
        @scrub-end="store.endScrub()"
        @reset="onAngle(0)"
      />
    </div>

    <div class="panel-section">
      <div class="panel-title">翻转</div>
      <div class="row">
        <button
          class="ghost"
          :style="{ flex: 1, borderColor: store.params.geometry.flipH ? 'var(--accent)' : undefined }"
          @click="store.toggleFlipH()"
        >
          ⇋ 水平
        </button>
        <button
          class="ghost"
          :style="{ flex: 1, borderColor: store.params.geometry.flipV ? 'var(--accent)' : undefined }"
          @click="store.toggleFlipV()"
        >
          ⇅ 垂直
        </button>
      </div>
      <button class="ghost" style="width: 100%; margin-top: 12px" @click="store.resetGeometryAll()">
        重置全部几何
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEditorStore } from '@/stores/editor';
import SliderRow from '../ui/SliderRow.vue';

const store = useEditorStore();

const ratios = [
  { label: '自由', value: null },
  { label: '1:1', value: 1 },
  { label: '3:2', value: 3 / 2 },
  { label: '2:3', value: 2 / 3 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
];

function onAngle(v: number): void {
  // 拖动过程中不重复压栈（scrubStart 已压一次）
  store.params.geometry.rotation = v;
}
</script>

<style scoped>
.chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
</style>

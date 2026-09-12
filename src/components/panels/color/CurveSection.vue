<template>
  <div class="curve-section">
    <Histogram />
    <div class="segmented chan-switch">
      <button
        v-for="c in channels"
        :key="c.v"
        :class="{ active: chan === c.v }"
        :style="chan === c.v ? { color: c.color } : {}"
        @click="chan = c.v"
      >
        {{ t(c.label) }}
      </button>
    </div>
    <CurveEditor
      :model-value="store.params.curve[chan]"
      :color="current.color"
      @update:model-value="onCurve"
      @scrub-start="store.mutate(() => {}, true)"
      @scrub-end="store.endScrub()"
    />
    <div class="curve-foot">
      <button type="button" class="ghost" @click="resetChan">{{ t('adjust.resetCurve') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CurveParams } from '@/types/EditParams';
import { linearCurve } from '@/types/EditParams';
import { useEditorStore } from '@/stores/editor';
import { t } from '@/i18n';
import Histogram from '../../ui/Histogram.vue';
import CurveEditor from '../../color/CurveEditor.vue';

type Chan = keyof CurveParams;
const store = useEditorStore();
const chan = ref<Chan>('master');

const channels: Array<{ v: Chan; label: string; color: string }> = [
  { v: 'master', label: 'adjust.master', color: '#f2f3f7' },
  { v: 'red', label: 'adjust.red', color: '#ff453a' },
  { v: 'green', label: 'adjust.green', color: '#30d158' },
  { v: 'blue', label: 'adjust.blue', color: '#0a84ff' },
];
const current = computed(() => channels.find((c) => c.v === chan.value)!);

function onCurve(pts: CurveParams[Chan]): void {
  store.params.curve[chan.value] = pts;
}
function resetChan(): void {
  store.mutate((p) => {
    p.curve[chan.value] = linearCurve();
  });
}
</script>

<style scoped>
.chan-switch {
  margin: 10px 0;
}
.curve-foot {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}
</style>

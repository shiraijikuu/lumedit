<template>
  <div class="roll">
    <SliderRow
      :label="t('tonemap.highlights')"
      :model-value="tm.highlights"
      :min="0" :max="1" :step="0.01" :decimals="2"
      @update:model-value="set((x) => (x.highlights = $event))"
      @scrub-start="store.mutate(() => {}, true)"
      @scrub-end="store.endScrub()"
      @reset="set((x) => (x.highlights = 0))"
    />
    <SliderRow
      :label="t('tonemap.shadows')"
      :model-value="tm.shadows"
      :min="0" :max="1" :step="0.01" :decimals="2"
      @update:model-value="set((x) => (x.shadows = $event))"
      @scrub-start="store.mutate(() => {}, true)"
      @scrub-end="store.endScrub()"
      @reset="set((x) => (x.shadows = 0))"
    />
    <p class="hint">{{ t('tonemap.hint') }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ToneRollParams } from '@/types/EditParams';
import { useEditorStore } from '@/stores/editor';
import { t } from '@/i18n';
import SliderRow from '../../ui/SliderRow.vue';

const store = useEditorStore();
const tm = computed<ToneRollParams>(() => store.params.tonemap);

function set(fn: (x: ToneRollParams) => void): void {
  store.mutate((p) => fn(p.tonemap));
}
</script>

<style scoped>
.hint {
  margin-top: 8px;
  font-size: 11px;
  color: var(--txt-2);
  line-height: 1.5;
}
</style>

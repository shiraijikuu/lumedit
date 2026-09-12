<template>
  <div class="grade">
    <div v-for="g in groups" :key="g.v" class="grade-group">
      <p class="group-label">
        {{ t(g.label) }}
        <span class="swatch" :style="{ background: swatch(g.v) }"></span>
      </p>
      <SliderRow
        :label="t('adjust.hue')"
        :model-value="store.params.colorGrade[g.v].hue"
        :min="0"
        :max="360"
        :step="1"
        :decimals="0"
        @update:model-value="set(g.v, 'hue', $event)"
        @scrub-start="store.mutate(() => {}, true)"
        @scrub-end="store.endScrub()"
        @reset="reset(g.v, 'hue')"
      />
      <SliderRow
        :label="t('adjust.sat')"
        :model-value="store.params.colorGrade[g.v].sat"
        :min="0"
        :max="1"
        :step="0.01"
        :decimals="2"
        @update:model-value="set(g.v, 'sat', $event)"
        @scrub-start="store.mutate(() => {}, true)"
        @scrub-end="store.endScrub()"
        @reset="reset(g.v, 'sat')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ColorGradeParams, GradeWheel } from '@/types/EditParams';
import { defaultEditParams } from '@/types/EditParams';
import { useEditorStore } from '@/stores/editor';
import { t } from '@/i18n';
import SliderRow from '../../ui/SliderRow.vue';

type Group = keyof ColorGradeParams;
const store = useEditorStore();
const groups: Array<{ v: Group; label: string }> = [
  { v: 'shadows', label: 'adjust.gradeSh' },
  { v: 'midtones', label: 'adjust.gradeMid' },
  { v: 'highlights', label: 'adjust.gradeHi' },
];

function set(g: Group, key: keyof GradeWheel, v: number): void {
  store.params.colorGrade[g][key] = v;
}
function reset(g: Group, key: keyof GradeWheel): void {
  store.mutate((p) => {
    p.colorGrade[g][key] = defaultEditParams.colorGrade[g][key];
  });
}
function hsvToCss(h: number, s: number): string {
  const c = s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  let r = 0, gg = 0, b = 0;
  if (h < 60) [r, gg, b] = [c, x, 0];
  else if (h < 120) [r, gg, b] = [x, c, 0];
  else if (h < 180) [r, gg, b] = [0, c, x];
  else if (h < 240) [r, gg, b] = [0, x, c];
  else if (h < 300) [r, gg, b] = [x, 0, c];
  else [r, gg, b] = [c, 0, x];
  return `rgb(${Math.round(r * 255)},${Math.round(gg * 255)},${Math.round(b * 255)})`;
}
function swatch(g: Group): string {
  const w = store.params.colorGrade[g];
  return hsvToCss(w.hue, w.sat);
}
</script>

<style scoped>
.grade-group {
  margin-bottom: 8px;
}
.group-label {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 10px 0 2px;
  font-size: 11px;
  font-weight: 600;
  color: var(--txt-2);
  letter-spacing: 0.5px;
}
.swatch {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  border: 1px solid var(--line-strong);
  background: #888;
}
</style>

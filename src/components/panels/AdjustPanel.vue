<template>
  <div class="color-panel">
    <CollapseSection>
      <template #title>
        {{ t('adjust.tone') }}
      </template>
      <template #actions>
        <button type="button" class="ghost mini" @click="store.resetAdjust()">{{ t('common.reset') }}</button>
      </template>
      <ToneSection />
    </CollapseSection>

    <CollapseSection>
      <template #title>{{ t('adjust.curve') }}</template>
      <template #actions>
        <button type="button" class="ghost mini" @click="resetCurve">{{ t('common.reset') }}</button>
      </template>
      <CurveSection />
    </CollapseSection>

    <template v-if="IS_FULL">
      <CollapseSection :default-open="false">
        <template #title>
          {{ t('adjust.hsl') }}<span class="pro-badge">{{ t('adjust.proBadge') }}</span>
        </template>
        <template #actions>
          <button type="button" class="ghost mini" @click="resetHsl">{{ t('common.reset') }}</button>
        </template>
        <HslSection />
      </CollapseSection>

      <CollapseSection :default-open="false">
        <template #title>
          {{ t('adjust.grade') }}<span class="pro-badge">{{ t('adjust.proBadge') }}</span>
        </template>
        <template #actions>
          <button type="button" class="ghost mini" @click="resetGrade">{{ t('common.reset') }}</button>
        </template>
        <GradeSection />
      </CollapseSection>

      <CollapseSection :default-open="false">
        <template #title>
          {{ t('adjust.effects') }}<span class="pro-badge">{{ t('adjust.proBadge') }}</span>
        </template>
        <template #actions>
          <button type="button" class="ghost mini" @click="resetEffects">{{ t('common.reset') }}</button>
        </template>
        <EffectsSection />
      </CollapseSection>
    </template>

    <div class="panel-foot">
      <button type="button" class="ghost" @click="resetAll">{{ t('common.resetAll') }}</button>
    </div>
    <p class="hint">{{ t('adjust.hint') }}</p>
  </div>
</template>

<script setup lang="ts">
import { defaultEditParams, linearCurve } from '@/types/EditParams';
import { useEditorStore } from '@/stores/editor';
import { t } from '@/i18n';
import { IS_FULL_TIER as IS_FULL } from '@/config/tier';
import CollapseSection from '../ui/CollapseSection.vue';
import ToneSection from './color/ToneSection.vue';
import CurveSection from './color/CurveSection.vue';
import HslSection from './color/HslSection.vue';
import GradeSection from './color/GradeSection.vue';
import EffectsSection from './color/EffectsSection.vue';

const store = useEditorStore();

function resetCurve(): void {
  store.mutate((p) => {
    p.curve = {
      master: linearCurve(),
      red: linearCurve(),
      green: linearCurve(),
      blue: linearCurve(),
    };
  });
}
function resetHsl(): void {
  store.mutate((p) => {
    p.hsl = JSON.parse(JSON.stringify(defaultEditParams.hsl));
  });
}
function resetGrade(): void {
  store.mutate((p) => {
    p.colorGrade = JSON.parse(JSON.stringify(defaultEditParams.colorGrade));
  });
}
function resetEffects(): void {
  store.mutate((p) => {
    p.effects = { ...defaultEditParams.effects };
  });
}
function resetAll(): void {
  store.resetColorAll();
}
</script>

<style scoped>
.color-panel {
  padding-bottom: 4px;
}
.pro-badge {
  margin-left: 6px;
  padding: 1px 6px;
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: #7db8ff;
  background: var(--accent-soft);
  border-radius: 5px;
  text-transform: none;
}
button.mini {
  padding: 2px 8px;
  font-size: 11px;
}
.panel-foot {
  padding: 12px 16px 0;
}
.panel-foot button {
  width: 100%;
}
.hint {
  padding: 10px 16px 4px;
  font-size: 11px;
  color: var(--txt-2);
  line-height: 1.5;
}
</style>

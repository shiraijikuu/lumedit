<template>
  <div class="color-panel">
    <CollapseSection :default-open="false">
      <template #title>{{ t('preset.title') }}</template>
      <template #actions>
        <button type="button" class="ghost mini" :disabled="saveName.trim() === '' || !store.hasImage" @click="savePreset">
          {{ t('preset.save') }}
        </button>
      </template>
      <div class="preset-save">
        <input
          v-model="saveName"
          class="preset-input"
          :placeholder="t('preset.namePlaceholder')"
          maxlength="40"
          @keydown.enter="savePreset"
        />
      </div>
      <div v-if="!presetStore.list.length" class="preset-empty">{{ t('preset.empty') }}</div>
      <div v-for="p in presetStore.list" :key="p.id" class="preset-row">
        <button type="button" class="preset-apply" :title="t('preset.applyTip')" @click="store.applyPreset(p.name, p.params)">
          {{ p.name }}
        </button>
        <button type="button" class="ghost mini" @click="presetStore.remove(p.id)">×</button>
      </div>
      <p class="preset-hint">{{ t('preset.hint') }}</p>
    </CollapseSection>

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
        <template #title>{{ t('gradation.title') }}<span class="pro-badge">{{ t('adjust.proBadge') }}</span></template>
        <template #actions>
          <button type="button" class="ghost mini" @click="resetGradation">{{ t('common.reset') }}</button>
        </template>
        <GradationSection />
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

    <div class="panel-foot">
      <button type="button" class="ghost" @click="resetAll">{{ t('common.resetAll') }}</button>
    </div>
    <p class="hint">{{ t('adjust.hint') }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { defaultEditParams, linearCurve, pickPresetParams } from '@/types/EditParams';
import { useEditorStore } from '@/stores/editor';
import { usePresetStore } from '@/stores/presets';
import { t } from '@/i18n';
import CollapseSection from '../ui/CollapseSection.vue';
import ToneSection from './color/ToneSection.vue';
import CurveSection from './color/CurveSection.vue';
import HslSection from './color/HslSection.vue';
import GradeSection from './color/GradeSection.vue';
import EffectsSection from './color/EffectsSection.vue';
import GradationSection from './color/GradationSection.vue';

const store = useEditorStore();
const presetStore = usePresetStore();
const saveName = ref('');

function savePreset(): void {
  const name = saveName.value.trim();
  if (!name || !store.hasImage) return;
  void presetStore.save(name, pickPresetParams(store.params)).then((ok) => {
    if (ok) saveName.value = '';
  });
}

void presetStore.load();

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
const GRADATION_DEFAULT = {
  enabled: false,
  type: 'linear' as const,
  x: 0.2,
  y: 0.2,
  w: 0.6,
  h: 0.6,
  rotation: 0,
  exposure: 0,
  temperature: 0,
  tint: 0,
};

function resetGradation(): void {
  store.mutate((p) => {
    p.gradation = { ...GRADATION_DEFAULT };
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

.preset-save {
  margin-bottom: 8px;
}
.preset-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 9px;
  border-radius: 7px;
  border: 1px solid var(--bg-3);
  background: var(--bg-2);
  color: var(--txt-1);
  font-size: 12px;
  outline: none;
}
.preset-input:focus {
  border-color: var(--accent);
}
.preset-empty {
  text-align: center;
  color: var(--txt-2);
  font-size: 11.5px;
  padding: 10px 0;
}
.preset-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
}
.preset-apply {
  flex: 1;
  text-align: left;
  padding: 6px 9px;
  border-radius: 7px;
  background: var(--bg-2);
  color: var(--txt-1);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preset-apply:hover {
  background: var(--bg-3);
  color: var(--accent);
}
.preset-hint {
  margin-top: 8px;
  font-size: 11px;
  color: var(--txt-2);
  line-height: 1.5;
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
</style>

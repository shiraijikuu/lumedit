<template>
  <div>
    <div class="panel-section">
      <div class="panel-title">
        {{ t('lut.scene') }}（{{ store.builtinLuts.length }}）
        <span v-if="store.lutLoading" class="loading">{{ t('lut.loading') }}</span>
      </div>
      <div v-for="cat in categories" :key="cat.id" class="cat-block">
        <div class="cat-name">{{ cat.name }}</div>
        <div class="lut-grid">
          <div
            v-for="lut in byCategory(cat.id)"
            :key="lut.id"
            class="lut-card"
            :class="{ active: store.params.lut.id === lut.id }"
            :title="lut.description"
            @click="store.selectBuiltin(lut.id)"
          >
            <div class="lut-swatch" :style="{ background: swatch(lut.id) }"></div>
            <span>{{ lut.name }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="panel-section">
      <div class="panel-title">{{ t('lut.mine') }}（{{ store.userLuts.length }}）</div>
      <button class="ghost" style="width: 100%" @click="store.importUserLuts()">
        {{ t('lut.importToLib') }}
      </button>

      <div v-for="g in userGroups" :key="g.category" class="cat-block">
        <div class="cat-name">{{ catLabel(g.category) }}</div>
        <div class="lut-grid">
          <div
            v-for="lut in g.items"
            :key="lut.id"
            class="lut-card user"
            :class="{ active: store.params.lut.path === 'user-lut:' + lut.id }"
            :title="lut.name"
            @click="store.selectUserLut(lut.id)"
          >
            <div class="lut-swatch user-swatch"></div>
            <span class="lut-name">{{ lut.name }}</span>
            <button
              class="lut-edit"
              :title="t('lut.editTitle')"
              @click.stop="startEdit(lut.id, lut.name, lut.category)"
            >
              ✎
            </button>
          </div>
        </div>
      </div>

      <!-- 内联命名 / 分类 / 删除 -->
      <div v-if="editingId" class="user-edit glass">
        <div class="ue-row">
          <span class="ue-label">{{ t('lut.name') }}</span>
          <input v-model="editName" class="ue-input" @keyup.enter="commitEdit" />
        </div>
        <div class="ue-row">
          <span class="ue-label">{{ t('lut.category') }}</span>
          <input v-model="editCategory" class="ue-input" list="user-lut-cats" :placeholder="t('lut.uncategorized')" />
          <datalist id="user-lut-cats">
            <option v-for="c in categoryOptions" :key="c" :value="catLabel(c)"></option>
          </datalist>
        </div>
        <div class="ue-actions">
          <button class="ghost ue-del" @click="deleteEditing">{{ t('common.delete') }}</button>
          <button class="ghost" @click="cancelEdit">{{ t('common.cancel') }}</button>
          <button class="primary" @click="commitEdit">{{ t('common.save') }}</button>
        </div>
      </div>

      <!-- 一次性临时导入（不入库） -->
      <button class="ghost text-btn" @click="store.loadExternalCube()">
        {{ t('lut.tempOpen') }}
      </button>
      <div v-if="store.externalLut && !store.params.lut.path?.startsWith('user-lut:')" class="ext-row">
        <span class="ext-name">{{ t('lut.tempPrefix') }}：{{ store.externalLut.name }}</span>
      </div>
    </div>

    <div class="panel-section" v-if="store.params.lut.id || store.params.lut.path">
      <div class="panel-title">
        {{ store.currentLutName ?? 'LUT' }}
        <button class="ghost" @click="store.removeLut()">{{ t('lut.remove') }}</button>
      </div>
      <SliderRow
        :label="t('lut.strength')"
        :model-value="store.params.lut.strength"
        :min="0"
        :max="1"
        :step="0.01"
        :decimals="2"
        @update:model-value="onStrength"
        @scrub-start="store.mutate(() => {}, true)"
        @scrub-end="store.endScrub()"
      />
      <div class="row" style="margin-top: 4px">
        <span class="chip" @click="onStrength(0.5)">50%</span>
        <span class="chip" @click="onStrength(0.8)">80%</span>
        <span class="chip" @click="onStrength(1)">100%</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useEditorStore } from '@/stores/editor';
import { lutManager } from '@/core/render/lut/lutManager';
import { t } from '@/i18n';
import SliderRow from '../ui/SliderRow.vue';

const store = useEditorStore();
const categories = lutManager.categories();
const byCategory = (id: string) => store.builtinLuts.filter((l) => l.category === id);

// 默认分类的内部存储值（跨语言保持一致），仅在显示层翻译
const UNCAT = '未分类';
function catLabel(c: string): string {
  return c === UNCAT ? t('lut.uncategorized') : c;
}

// ---- 用户 LUT 库：按分类分组 ----
const userGroups = computed(() => {
  const map = new Map<string, typeof store.userLuts>();
  for (const lut of store.userLuts) {
    const cat = lut.category?.trim() || '未分类';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(lut);
  }
  // 已用分类排序，未分类垫底
  return [...map.entries()]
    .map(([category, items]) => ({ category, items }))
    .sort((a, b) => {
      if (a.category === '未分类') return 1;
      if (b.category === '未分类') return -1;
      return a.category.localeCompare(b.category, 'zh');
    });
});
// 分类候选：内置分类名 + 用户已建分类
const categoryOptions = computed(() => {
  const set = new Set<string>(categories.map((c) => c.name));
  for (const l of store.userLuts) if (l.category) set.add(l.category);
  return [...set];
});

// ---- 命名 / 分类 / 删除 ----
const editingId = ref<string | null>(null);
const editName = ref('');
const editCategory = ref('');
function startEdit(id: string, name: string, category: string): void {
  editingId.value = id;
  editName.value = name;
  editCategory.value = category === '未分类' ? '' : category;
}
function cancelEdit(): void {
  editingId.value = null;
}
async function commitEdit(): Promise<void> {
  if (!editingId.value) return;
  await store.renameUserLut(editingId.value, editName.value || '未命名 LUT');
  await store.categorizeUserLut(editingId.value, editCategory.value.trim() || '未分类');
  editingId.value = null;
}
async function deleteEditing(): Promise<void> {
  if (!editingId.value) return;
  if (!window.confirm(t('lut.confirmDelete'))) return;
  await store.removeUserLut(editingId.value);
  editingId.value = null;
}

function onStrength(v: number): void {
  store.params.lut.strength = v;
}

// 每款 LUT 的示意色块（风格近似的 CSS 渐变）
const SWATCHES: Record<string, string> = {
  'kodak-2383': 'linear-gradient(135deg,#3a2c20,#e8b888)',
  'fuji-3510': 'linear-gradient(135deg,#27403c,#cfe0d2)',
  'cinestill-800t': 'linear-gradient(135deg,#10203a,#e07a3a)',
  'classic-neg': 'linear-gradient(135deg,#2e3a38,#e6d8c8)',
  'teal-orange': 'linear-gradient(135deg,#0e6e6e,#e08a3a)',
  'cinematic-warm': 'linear-gradient(135deg,#4a2a1a,#ffd9a8)',
  'cinematic-cool': 'linear-gradient(135deg,#1a2f4a,#a8d4ff)',
  'dark-mood': 'linear-gradient(135deg,#05060a,#5a6070)',
  'portra-400': 'linear-gradient(135deg,#8a6a52,#f0d8c0)',
  'soft-cream': 'linear-gradient(135deg,#b89a88,#fff0e4)',
  airy: 'linear-gradient(135deg,#c8d4e0,#ffffff)',
  velvia: 'linear-gradient(135deg,#0a5a2a,#e83a2a)',
  autumn: 'linear-gradient(135deg,#7a3a10,#f0b040)',
  'crisp-fresh': 'linear-gradient(135deg,#2a8ab8,#8ae06a)',
  'bw-classic': 'linear-gradient(135deg,#2b2b2b,#d0d0d0)',
  'ilford-hp5': 'linear-gradient(135deg,#000,#fff)',
  cyberpunk: 'linear-gradient(135deg,#3a0a6a,#ff2a8a)',
  'fade-matte': 'linear-gradient(135deg,#9a95a8,#efe9f2)',
  'japanese-film': 'linear-gradient(135deg,#a8b8c0,#f8ece0)',
};
function swatch(id: string): string {
  return SWATCHES[id] ?? 'linear-gradient(135deg,#666,#bbb)';
}
</script>

<style scoped>
.cat-block {
  margin-bottom: 14px;
}
.cat-block:last-child {
  margin-bottom: 0;
}
.cat-name {
  font-size: 11.5px;
  color: var(--txt-2);
  margin-bottom: 7px;
  letter-spacing: 0.5px;
}
.lut-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 7px;
}
.lut-card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: center;
  font-size: 10.5px;
  color: var(--txt-1);
  cursor: pointer;
  padding: 5px 2px;
  border-radius: 8px;
  border: 1px solid transparent;
  transition: all 0.14s var(--ease);
}
.lut-card:hover {
  background: rgba(255, 255, 255, 0.05);
}
.lut-card.active {
  border-color: var(--accent);
  color: #fff;
  background: var(--accent-soft);
}
.lut-swatch {
  width: 100%;
  height: 30px;
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
}
.ext-row {
  margin-top: 8px;
}
.ext-name {
  font-size: 11.5px;
  color: var(--txt-2);
  word-break: break-all;
}
/* 用户 LUT 卡片 */
.lut-card.user {
  position: relative;
}
.lut-card .lut-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-swatch {
  background: linear-gradient(135deg, #b54708, #f59e0b 45%, #0ea5e9);
}
.lut-edit {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 18px;
  height: 18px;
  line-height: 1;
  font-size: 10px;
  padding: 0;
  border-radius: 6px;
  border: none;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  opacity: 0;
  transition: opacity 0.14s;
  cursor: pointer;
}
.lut-card.user:hover .lut-edit,
.lut-card.user.active .lut-edit {
  opacity: 1;
}
.user-edit {
  margin: 9px 0;
  padding: 10px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.ue-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ue-label {
  font-size: 11px;
  color: var(--txt-2);
  width: 30px;
  flex: none;
}
.ue-input {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  border-radius: 7px;
  border: 1px solid var(--line);
  background: var(--bg-2, #1c1d24);
  color: var(--txt-1);
  font-size: 12px;
}
.ue-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 2px;
}
.ue-actions button {
  padding: 5px 12px;
  font-size: 11.5px;
  border-radius: 7px;
}
.ue-del {
  margin-right: auto;
  color: var(--warn, #ff6b6b);
}
.text-btn {
  width: 100%;
  margin-top: 8px;
  font-size: 11px;
  opacity: 0.75;
}
.loading {
  font-size: 11px;
  color: var(--accent);
}
</style>

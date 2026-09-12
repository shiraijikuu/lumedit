// 调色预设 store：整套颜色参数（影调/曲线/HSL/分级/效果/LUT）的保存与应用
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { toast } from './toast';
import { t } from '@/i18n';
import type { PresetColorParams } from '@/types/EditParams';

export interface PresetRecord {
  id: string;
  name: string;
  createdAt: number;
  params: PresetColorParams;
}

export const usePresetStore = defineStore('presets', () => {
  const list = ref<PresetRecord[]>([]);
  const loaded = ref(false);

  async function load(): Promise<void> {
    try {
      list.value = ((await window.api.presets.list()) ?? []) as PresetRecord[];
      loaded.value = true;
    } catch {
      list.value = [];
    }
  }

  async function save(name: string, params: PresetColorParams): Promise<boolean> {
    const trimmed = name.trim();
    if (!trimmed) return false;
    try {
      list.value = ((await window.api.presets.save(trimmed, params)) ?? []) as PresetRecord[];
      toast('success', t('preset.saved', { v: trimmed }));
      return true;
    } catch (err) {
      toast('error', t('msg.presetFail', { v: err instanceof Error ? err.message : String(err) }));
      return false;
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      list.value = ((await window.api.presets.remove(id)) ?? []) as PresetRecord[];
      toast('info', t('preset.removed'));
    } catch (err) {
      toast('error', t('msg.presetFail', { v: err instanceof Error ? err.message : String(err) }));
    }
  }

  return { list, loaded, load, save, remove };
});

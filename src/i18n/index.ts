// 轻量 i18n：无第三方依赖，reactive 语言切换 + localStorage 持久化。
// 组件中 import { t }，模板内 {{ t('key') }} 即随语言响应式更新。
import { reactive } from 'vue';
import zhCN from './locales/zh-CN';
import en from './locales/en';

export type LocaleCode = 'zh-CN' | 'en';
export const LOCALES: Array<{ code: LocaleCode; label: string }> = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en', label: 'English' },
];

type DictNode = { [key: string]: string | DictNode };
const DICTS: Record<LocaleCode, DictNode> = {
  'zh-CN': zhCN as DictNode,
  en: en as DictNode,
};

const STORAGE_KEY = 'lumedit.locale';

function detectLocale(): LocaleCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh-CN' || saved === 'en') return saved;
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'zh-CN';
  return nav && nav.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

const state = reactive<{ locale: LocaleCode }>({ locale: detectLocale() });

function lookup(obj: DictNode | undefined, path: string): string | null {
  if (!obj) return null;
  let cur: DictNode | string = obj;
  for (const seg of path.split('.')) {
    if (cur && typeof cur === 'object') {
      cur = (cur as DictNode)[seg];
    } else {
      return null;
    }
  }
  return typeof cur === 'string' ? cur : null;
}

/** 翻译；缺失时回退中文，再缺失返回 key 本身。params 用于 {name} 插值。 */
export function t(path: string, params?: Record<string, string | number>): string {
  let str =
    lookup(DICTS[state.locale], path) ??
    lookup(DICTS['zh-CN'], path) ??
    path;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}

export function getLocale(): LocaleCode {
  return state.locale;
}

export function setLocale(locale: LocaleCode): void {
  state.locale = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  // 同步主进程菜单/对话框语言
  try {
    void window.api?.setLocale?.(locale);
  } catch {
    /* ignore */
  }
}

export function toggleLocale(): void {
  setLocale(state.locale === 'zh-CN' ? 'en' : 'zh-CN');
}

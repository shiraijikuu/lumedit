// 轻量 toast 通知：替代阻塞式 alert()，错误 6s / 成功 3s / 信息 4s 自动消失
import { reactive } from 'vue';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

const state = reactive<{ list: ToastItem[] }>({ list: [] });
let seq = 1;
const DURATION: Record<ToastKind, number> = { info: 4000, success: 3000, error: 6000 };
const MAX_VISIBLE = 4;

export function useToasts() {
  return state;
}

export function toast(kind: ToastKind, text: string): void {
  const id = seq++;
  state.list.push({ id, kind, text });
  while (state.list.length > MAX_VISIBLE) state.list.shift();
  window.setTimeout(() => dismissToast(id), DURATION[kind]);
}

export function dismissToast(id: number): void {
  const i = state.list.findIndex((t) => t.id === id);
  if (i >= 0) state.list.splice(i, 1);
}

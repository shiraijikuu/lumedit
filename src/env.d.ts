/// <reference types="vite/client" />

export {};

// camera-watermark 编辑窗初始化载荷（主窗口 → studio 窗口）
export interface CwmStudioInit {
  /** LumEdit 调色后预览底图（长边 ≤ 2200，dataURL） */
  baseDataUrl: string;
  /** 原始文件字节，供 camera-watermark 读取完整 EXIF（可选） */
  origBuffer?: ArrayBuffer | null;
  fileName: string;
  mime?: string;
  /** 上次应用保存的 camera-watermark state（可选） */
  savedState?: Record<string, unknown> | null;
}

// camera-watermark「应用」回传载荷（studio 窗口 → 主窗口）
export interface CwmApplyResult {
  state: Record<string, unknown>;
  meta: Record<string, unknown>;
  previewDataUrl: string;
  width: number;
  height: number;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

// Vite ?raw 文本导入（.cube LUT 文件）
declare module '*?raw' {
  const content: string;
  export default content;
}

export interface OpenImageResult {
  path: string;
  name: string;
  buffer: ArrayBuffer;
}

// 用户自建 LUT 库记录
export interface UserLutRecord {
  id: string;
  name: string;
  category: string;
  file: string;
  addedAt: number;
}

export interface UpdaterEvent {
  type: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
}

// preload 暴露的安全 IPC 桥（contextBridge）
export interface LumeditAPI {
  openImages: (multi: boolean) => Promise<OpenImageResult[] | null>;
  openCube: () => Promise<{ path: string; name: string; text: string } | null>;
  lutLib: {
    list: () => Promise<UserLutRecord[]>;
    import: () => Promise<{ lib: UserLutRecord[]; imported: UserLutRecord[] } | null>;
    read: (id: string) => Promise<{ record: UserLutRecord; text: string } | null>;
    update: (id: string, patch: { name?: string; category?: string }) => Promise<UserLutRecord[]>;
    remove: (id: string) => Promise<UserLutRecord[]>;
  };
  readBuffer: (path: string) => Promise<ArrayBuffer>;
  saveBuffer: (
    defaultName: string,
    filters: { name: string; extensions: string[] }[],
    buffer: ArrayBuffer | Uint8Array
  ) => Promise<string | null>;
  saveProject: (defaultName: string, json: string) => Promise<string | null>;
  openProject: () => Promise<{ path: string; text: string } | null>;
  pickDir: () => Promise<string | null>;
  writeFile: (absPath: string, buffer: ArrayBuffer | Uint8Array) => Promise<void>;
  appMeta: () => Promise<{ version: string; build: number }>;
  openExternal: (url: string) => Promise<void>;
  checkAutoUpdater: () => Promise<{ ok: boolean; error?: string }>;
  installUpdate: () => Promise<void>;
  fetchRemoteUpdate: () => Promise<{
    version: string;
    build?: number;
    releaseDate?: string;
    downloads?: { windows?: string };
    download_url?: string;
    notes?: { zh?: string; en?: string };
  } | null>;
  onUpdaterEvent: (cb: (ev: UpdaterEvent) => void) => () => void;
  onMenuAction: (cb: (action: string) => void) => () => void;
  // camera-watermark 水印工作室
  openCwm: (payload: CwmStudioInit) => Promise<boolean>;
  composeCwm: (payload: {
    baseDataUrl: string;
    state: unknown;
    meta: unknown;
    format: string;
    quality: number;
  }) => Promise<{ buffer: ArrayBuffer; width: number; height: number }>;
  onCwmApplied: (cb: (payload: CwmApplyResult) => void) => () => void;
  cwmRequestInit: () => Promise<CwmStudioInit | null>;
  cwmApply: (result: CwmApplyResult) => Promise<void>;
  cwmCancel: () => Promise<void>;
  cwmComposeResult: (result: { buffer: ArrayBuffer; width: number; height: number }) => Promise<void>;
}

declare global {
  interface Window {
    api: LumeditAPI;
  }
}

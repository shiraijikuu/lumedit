// 安全 IPC 桥：contextIsolation 下只暴露白名单方法
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // 文件
  openImages: (multi: boolean) => ipcRenderer.invoke('dialog:openImages', multi),
  openCube: () => ipcRenderer.invoke('dialog:openCube'),
  // 用户自建 LUT 库（命名 / 分类 / 持久化）
  lutLib: {
    list: () => ipcRenderer.invoke('lut:list'),
    import: () => ipcRenderer.invoke('lut:import'),
    read: (id: string) => ipcRenderer.invoke('lut:read', id),
    update: (id: string, patch: { name?: string; category?: string }) =>
      ipcRenderer.invoke('lut:update', { id, ...patch }),
    remove: (id: string) => ipcRenderer.invoke('lut:delete', id),
  },
  readBuffer: (p: string) => ipcRenderer.invoke('fs:readBuffer', p),
  saveBuffer: (
    defaultName: string,
    filters: { name: string; extensions: string[] }[],
    bytes: ArrayBuffer | Uint8Array
  ) => ipcRenderer.invoke('dialog:saveBuffer', { defaultName, filters, bytes }),
  saveProject: (defaultName: string, text: string) =>
    ipcRenderer.invoke('dialog:saveProject', { defaultName, text }),
  openProject: () => ipcRenderer.invoke('dialog:openProject'),
  pickDir: () => ipcRenderer.invoke('dialog:pickDir'),
  writeFile: (absPath: string, bytes: ArrayBuffer | Uint8Array) =>
    ipcRenderer.invoke('fs:writeFile', absPath, bytes),

  // 应用 / 更新
  appMeta: () => ipcRenderer.invoke('app:meta'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  checkAutoUpdater: () => ipcRenderer.invoke('updater:check'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  fetchRemoteUpdate: () => ipcRenderer.invoke('update:fetchRemote'),
  onUpdaterEvent: (cb: (ev: { type: string; version?: string; percent?: number; message?: string }) => void) => {
    const handler = (_e: unknown, v: never) => cb(v);
    ipcRenderer.on('updater:event', handler);
    return () => ipcRenderer.removeListener('updater:event', handler);
  },

  // 菜单动作
  onMenuAction: (cb: (action: string) => void) => {
    const handler = (_e: unknown, action: string) => cb(action);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  },

  // camera-watermark 水印工作室（主窗口发起 / studio 窗口消费）
  openCwm: (payload: unknown) => ipcRenderer.invoke('cwm:open', payload),
  composeCwm: (payload: {
    baseDataUrl: string;
    state: unknown;
    meta: unknown;
    format: string;
    quality: number;
  }) =>
    ipcRenderer.invoke('cwm:compose', payload) as Promise<{
      buffer: ArrayBuffer;
      width: number;
      height: number;
    }>,
  onCwmApplied: (cb: (result: never) => void) => {
    const handler = (_e: unknown, result: never) => cb(result);
    ipcRenderer.on('cwm:applied', handler);
    return () => ipcRenderer.removeListener('cwm:applied', handler);
  },
  // studio 页面使用
  cwmRequestInit: () => ipcRenderer.invoke('cwm:requestInit'),
  cwmApply: (result: unknown) => ipcRenderer.invoke('cwm:apply', result),
  cwmCancel: () => ipcRenderer.invoke('cwm:cancel'),
  cwmComposeResult: (result: { buffer: ArrayBuffer; width: number; height: number }) =>
    ipcRenderer.invoke('cwm:composeResult', result),
};

contextBridge.exposeInMainWorld('api', api);

export type LumeditBridge = typeof api;

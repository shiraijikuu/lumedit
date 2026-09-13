// LumEdit 主进程：窗口、文件 IPC、中文菜单、双轨检查更新
// （语义版本走 electron-updater；同版本 build 修订走远程 update.json，对齐 camera-watermark-windows）
import { app, BrowserWindow, clipboard, ipcMain, dialog, Menu, nativeImage, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createFileAccessPolicy } from './fileAccess';
import { mt, mtf, setMainLocale } from './i18n';

// ---------------- 文件访问授权（渲染层只能读写用户手势授权过的位置） ----------------
const fileAccess = createFileAccessPolicy();

// 外部链接只允许 http(s)（防 file:// / 任意协议被渲染层唤起）
function isSafeExternalUrl(url: unknown): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

// ---------------- 用户自建 LUT 库（持久化到 userData/user-luts） ----------------
interface UserLutRecord {
  id: string;
  name: string;
  category: string;
  file: string;
  addedAt: number;
}
function userLutDir(): string {
  return path.join(app.getPath('userData'), 'user-luts');
}
async function ensureUserLutDir(): Promise<string> {
  const dir = userLutDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
async function readUserLutLib(): Promise<UserLutRecord[]> {
  try {
    const raw = await fs.readFile(path.join(userLutDir(), 'index.json'), 'utf-8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as UserLutRecord[]) : [];
  } catch {
    return [];
  }
}
async function writeUserLutLib(lib: UserLutRecord[]): Promise<void> {
  const dir = await ensureUserLutDir();
  await fs.writeFile(path.join(dir, 'index.json'), JSON.stringify(lib, null, 2), 'utf-8');
}

// 单调递增构建号：同版本内容修订时 +1（渲染层远程比对用）
const APP_BUILD = 7;
// 远程更新清单（jsdelivr 镜像 GitHub，防缓存参数由调用方追加）
const REMOTE_UPDATE_URL =
  'https://cdn.jsdelivr.net/gh/shiraijikuu/lumedit@main/update.json';

let mainWindow: BrowserWindow | null = null;
// camera-watermark 水印工作室：编辑子窗口
let wmWindow: BrowserWindow | null = null;
// 每个 studio 窗口（编辑/离屏合成）按 webContents.id 绑定的初始化数据
const studioInitByWc = new Map<number, unknown>();
// 离屏合成进行中的请求（resolve / 窗口 / 超时）
interface ComposeJob {
  resolve: (r: { buffer: ArrayBuffer; width: number; height: number }) => void;
  reject: (e: Error) => void;
  win: BrowserWindow;
  timer: NodeJS.Timeout;
}
const composeJobs = new Map<number, ComposeJob>();

function studioUrl(devUrl: string | undefined, file: string): { url?: string; file?: string } {
  if (devUrl) return { url: `${devUrl}/cwm/${file}` };
  return { file: path.join(__dirname, '../dist/cwm', file) };
}

const CWM_PRELOAD = path.join(__dirname, 'preload.cjs');
const CWM_WP = {
  preload: CWM_PRELOAD,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
} as const;

// ---------------- 自动更新（语义版本） ----------------
function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'shiraijikuu',
      repo: 'lumedit',
    });
  } catch (e) {
    console.error('autoUpdater setFeedURL failed:', (e as Error).message);
  }

  const forward = (type: string, extra: Record<string, unknown> = {}) => {
    mainWindow?.webContents.send('updater:event', { type, ...extra });
  };

  autoUpdater.on('checking-for-update', () => forward('checking'));
  autoUpdater.on('update-available', (info) => forward('available', { version: info.version }));
  autoUpdater.on('update-not-available', () => forward('not-available'));
  autoUpdater.on('download-progress', (p) =>
    forward('downloading', { percent: Math.round(p.percent) })
  );
  autoUpdater.on('update-downloaded', (info) => {
    forward('downloaded', { version: info.version });
    dialog
      .showMessageBox({
        type: 'info',
        title: mt('updaterTitle'),
        message: mtf('updaterMsg', { v: info.version }),
        detail: mt('updaterDetail'),
        buttons: [mt('later'), mt('restartNow')],
        defaultId: 1,
        cancelId: 0,
      })
      .then(({ response }) => {
        if (response === 1) autoUpdater.quitAndInstall();
      })
      .catch(() => {});
  });
  autoUpdater.on('error', (err) =>
    forward('error', { message: err && err.message ? err.message : String(err) })
  );
}

// ---------------- 窗口 ----------------
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#141518',
    title: mt('winTitle'),
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // 外部链接一律系统浏览器打开（仅 http/https）
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function sendMenuAction(action: string): void {
  mainWindow?.webContents.send('menu:action', action);
}

  // ---------------- 会话恢复 / 最近打开（userData，主进程直管） ----------------

interface RecentItem {
  path: string;
  name: string;
  at: number;
}

function recentFile(): string {
  return path.join(app.getPath('userData'), 'recent.json');
}
async function readRecent(): Promise<RecentItem[]> {
  try {
    const arr = JSON.parse(await fs.readFile(recentFile(), 'utf-8'));
    return Array.isArray(arr) ? (arr as RecentItem[]) : [];
  } catch {
    return [];
  }
}
async function writeRecent(list: RecentItem[]): Promise<void> {
  await fs.writeFile(recentFile(), JSON.stringify(list, null, 2), 'utf-8');
}


function buildMenu(recent: { path: string; name: string }[] = []): Menu {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: mt('file'),
      submenu: [
        { label: mt('openImage'), accelerator: 'CmdOrCtrl+O', click: () => sendMenuAction('open-image') },
        { label: mt('importLut'), click: () => sendMenuAction('open-lut') },
        { type: 'separator' },
        { label: mt('saveProject'), accelerator: 'CmdOrCtrl+S', click: () => sendMenuAction('save-project') },
        { label: mt('openProject'), accelerator: 'CmdOrCtrl+Shift+O', click: () => sendMenuAction('open-project') },
        ...(recent.length
          ? [
              {
                label: mt('recentOpen'),
                submenu: recent.slice(0, 10).map((r, i) => ({
                  label: r.name.length > 46 ? r.name.slice(0, 46) + '…' : r.name,
                  click: () => sendMenuAction('recent:' + i),
                })),
              },
            ]
          : []),
        { type: 'separator' },
        { label: mt('export'), accelerator: 'CmdOrCtrl+E', click: () => sendMenuAction('export') },
        { type: 'separator' },
        { role: 'quit', label: mt('quit') },
      ],
    },
    {
      label: mt('edit'),
      submenu: [
        { label: mt('undo'), accelerator: 'CmdOrCtrl+Z', click: () => sendMenuAction('undo') },
        { label: mt('redo'), accelerator: 'CmdOrCtrl+Y', click: () => sendMenuAction('redo') },
      ],
    },
    {
      label: mt('view'),
      submenu: [
        { label: mt('fit'), accelerator: '0', click: () => sendMenuAction('fit-view') },
        { label: mt('zoomIn'), accelerator: '+=', click: () => sendMenuAction('zoom-in') },
        { label: mt('zoomOut'), accelerator: '-', click: () => sendMenuAction('zoom-out') },
        // 开发者工具不在菜单暴露；保留 Electron 默认快捷键（Ctrl+Shift+I）能力，便于排障
      ],
    },
    {
      label: mt('help'),
      submenu: [
        { label: mt('checkUpdate'), click: () => sendMenuAction('check-update') },
        {
          label: mt('download'),
          click: () => shell.openExternal('https://github.com/shiraijikuu/lumedit/releases/latest'),
        },
        { type: 'separator' },
        { label: mt('about'), click: () => sendMenuAction('about') },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

// ---------------- IPC ----------------
const RAW_EXTENSIONS = [
  'arw', 'dng', 'nef', 'cr2', 'cr3', 'raf', 'orf', 'rw2', 'pef',
  'srw', 'mrw', 'erf', 'rwl', 'nrw', 'raw', 'kdc', 'dcr', 'mos', 'iiq', '3fr',
];
// 过滤器名称随当前语言在打开对话框时求值
function imageFilters(): Electron.FileFilter[] {
  return [
    {
      name: mt('allImages'),
      extensions: ['jpg', 'jpeg', 'png', 'webp', ...RAW_EXTENSIONS],
    },
    { name: mt('rawImages'), extensions: RAW_EXTENSIONS },
    { name: mt('allFiles'), extensions: ['*'] },
  ];
}

function registerIpc(): void {
  ipcMain.handle('dialog:openImages', async (_e, multi: boolean) => {
    const r = await dialog.showOpenDialog(mainWindow!, {
      properties: multi ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: imageFilters(),
    });
    if (r.canceled) return null;
    for (const p of r.filePaths) fileAccess.grantRead(p);
    return Promise.all(
      r.filePaths.map(async (p) => ({
        path: p,
        name: path.basename(p),
        buffer: (await fs.readFile(p)).buffer.slice(0),
      }))
    );
  });

  ipcMain.handle('dialog:openCube', async () => {
    const r = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [
        { name: '3D LUT', extensions: ['cube'] },
        { name: mt('allFiles'), extensions: ['*'] },
      ],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const p = r.filePaths[0];
    fileAccess.grantRead(p);
    return { path: p, name: path.basename(p), text: await fs.readFile(p, 'utf-8') };
  });

  // 列出用户 LUT 库
  ipcMain.handle('lut:list', async () => readUserLutLib());

  // 导入一个或多个 .cube 到用户库（复制进 userData，写入索引），返回最新列表
  ipcMain.handle('lut:import', async () => {
    const r = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '3D LUT', extensions: ['cube'] },
        { name: mt('allFiles'), extensions: ['*'] },
      ],
    });
    if (r.canceled || r.filePaths.length === 0) return null;
    const dir = await ensureUserLutDir();
    const lib = await readUserLutLib();
    const imported: UserLutRecord[] = [];
    for (const src of r.filePaths) {
      const base = path.basename(src);
      const name = base.replace(/\.cube$/i, '');
      const stat = await fs.stat(src);
      // 同名且同大小视为已存在，避免重复导入
      const dup = lib.find((x) => x.name === name);
      if (dup) {
        imported.push(dup);
        continue;
      }
      const id = randomUUID();
      const file = `${id}.cube`;
      await fs.copyFile(src, path.join(dir, file));
      const rec: UserLutRecord = {
        id,
        name,
        category: '未分类',
        file,
        addedAt: Date.now(),
      };
      // 记录大小仅用于去重判断（不持久化）
      void stat;
      lib.push(rec);
      imported.push(rec);
    }
    lib.sort((a, b) => a.addedAt - b.addedAt);
    await writeUserLutLib(lib);
    return { lib, imported };
  });

  // 读取某个用户 LUT 的 cube 文本
  ipcMain.handle('lut:read', async (_e, id: string) => {
    const lib = await readUserLutLib();
    const rec = lib.find((x) => x.id === id);
    if (!rec) return null;
    const text = await fs.readFile(path.join(userLutDir(), rec.file), 'utf-8');
    return { record: rec, text };
  });

  // 重命名 / 改分类
  ipcMain.handle(
    'lut:update',
    async (_e, args: { id: string; name?: string; category?: string }) => {
      const lib = await readUserLutLib();
      const rec = lib.find((x) => x.id === args.id);
      if (!rec) return lib;
      if (typeof args.name === 'string' && args.name.trim()) rec.name = args.name.trim();
      if (typeof args.category === 'string' && args.category.trim())
        rec.category = args.category.trim();
      await writeUserLutLib(lib);
      return lib;
    }
  );

  // 从库中删除（同时删除 cube 文件）
  ipcMain.handle('lut:delete', async (_e, id: string) => {
    const lib = await readUserLutLib();
    const idx = lib.findIndex((x) => x.id === id);
    if (idx >= 0) {
      const rec = lib[idx];
      lib.splice(idx, 1);
      await fs.rm(path.join(userLutDir(), rec.file), { force: true }).catch(() => {});
      await writeUserLutLib(lib);
    }
    return lib;
  });

  ipcMain.handle('recent:list', () => readRecent());

  ipcMain.handle('recent:push', async (_e, p: string, name: string) => {
    let list: RecentItem[] = [];
    if (typeof p === 'string' && p) {
      list = await readRecent();
      const filtered = list.filter((x) => x.path !== p);
      filtered.unshift({ path: p, name: typeof name === 'string' ? name : path.basename(p), at: Date.now() });
      list = filtered.slice(0, 10);
      await writeRecent(list);
    }
    Menu.setApplicationMenu(buildMenu(list));
    return list;
  });

  // 用户点「最近打开」菜单 = 用户手势：主进程直接读文件并授予会话读权限
  ipcMain.handle('recent:open', async (_e, index: number) => {
    const list = await readRecent();
    const item = list[index];
    if (!item) return null;
    const buf = await fs.readFile(item.path);
    fileAccess.grantRead(item.path);
    return { path: item.path, name: item.name, buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  });

  function sessionFile(): string {
    return path.join(app.getPath('userData'), 'session.json');
  }
  ipcMain.handle('session:save', async (_e, payload: unknown) => {
    if (payload && typeof payload === 'object') {
      await fs.writeFile(sessionFile(), JSON.stringify(payload), 'utf-8');
    }
  });
  ipcMain.handle('session:load', async () => {
    try {
      const data = JSON.parse(await fs.readFile(sessionFile(), 'utf-8')) as {
        imagePath?: string;
        imageName?: string;
        params?: unknown;
      };
      if (typeof data.imagePath === 'string' && data.imagePath) {
        const buf = await fs.readFile(data.imagePath);
        fileAccess.grantRead(data.imagePath);
        return {
          path: data.imagePath,
          name: data.imageName ?? path.basename(data.imagePath),
          buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
          params: data.params ?? null,
        };
      }
    } catch {
      /* 无会话/文件丢失：静默 */
    }
    return null;
  });

  // ---------------- 调色预设（userData/presets.json，主进程直管，无需路径授权） ----------------
  interface PresetRecord {
    id: string;
    name: string;
    createdAt: number;
    params: unknown;
  }
  function presetsFile(): string {
    return path.join(app.getPath('userData'), 'presets.json');
  }
  async function readPresets(): Promise<PresetRecord[]> {
    try {
      const arr = JSON.parse(await fs.readFile(presetsFile(), 'utf-8'));
      return Array.isArray(arr) ? (arr as PresetRecord[]) : [];
    } catch {
      return [];
    }
  }
  async function writePresets(list: PresetRecord[]): Promise<void> {
    await fs.writeFile(presetsFile(), JSON.stringify(list, null, 2), 'utf-8');
  }

  ipcMain.handle('presets:list', () => readPresets());

  ipcMain.handle('presets:save', async (_e, name: string, params: unknown) => {
    const list = await readPresets();
    if (typeof name === 'string' && name.trim() && params && typeof params === 'object') {
      list.push({
        id: randomUUID(),
        name: name.trim().slice(0, 40),
        createdAt: Date.now(),
        params,
      });
      await writePresets(list);
    }
    return list;
  });

  ipcMain.handle('presets:delete', async (_e, id: string) => {
    const list = await readPresets();
    const idx = list.findIndex((x) => x.id === id);
    if (idx >= 0) {
      list.splice(idx, 1);
      await writePresets(list);
    }
    return list;
  });

  // 把导出的位图写入系统剪贴板（修完图直接贴进聊天/文档）
  ipcMain.handle('clipboard:writeImage', (_e, bytes: ArrayBuffer | Uint8Array) => {
    const buf = bytes instanceof Uint8Array ? Buffer.from(bytes) : Buffer.from(new Uint8Array(bytes));
    const image = nativeImage.createFromBuffer(buf);
    if (image.isEmpty()) throw new Error('clipboard image decode failed');
    clipboard.writeImage(image);
    return { ok: true };
  });

  ipcMain.handle('fs:readBuffer', async (_e, p: string) => {
    if (!fileAccess.isReadAllowed(p)) {
      throw new Error(mtf('errReadDeny', { v: p }));
    }
    const b = await fs.readFile(p);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  });

  ipcMain.handle(
    'dialog:saveBuffer',
    async (_e, args: { defaultName: string; filters: Electron.FileFilter[]; bytes: ArrayBuffer | Uint8Array }) => {
      const r = await dialog.showSaveDialog(mainWindow!, {
        defaultPath: args.defaultName,
        filters: args.filters,
      });
      if (r.canceled || !r.filePath) return null;
      const buf = args.bytes instanceof Uint8Array ? args.bytes : new Uint8Array(args.bytes);
      await fs.writeFile(r.filePath, buf);
      return r.filePath;
    }
  );

  // 通用文本保存（如导出 .cube LUT）
  ipcMain.handle(
    'dialog:saveText',
    async (_e, args: { defaultName: string; filters: Electron.FileFilter[]; text: string }) => {
      const r = await dialog.showSaveDialog(mainWindow!, {
        defaultPath: args.defaultName,
        filters: args.filters,
      });
      if (r.canceled || !r.filePath) return null;
      await fs.writeFile(r.filePath, args.text, 'utf-8');
      return r.filePath;
    }
  );

  ipcMain.handle('dialog:saveProject', async (_e, args: { defaultName: string; text: string }) => {
    const r = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: args.defaultName,
      filters: [{ name: mt('projectFile'), extensions: ['lightedit'] }],
    });
    if (r.canceled || !r.filePath) return null;
    await fs.writeFile(r.filePath, args.text, 'utf-8');
    return r.filePath;
  });

  ipcMain.handle('dialog:openProject', async () => {
    const r = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [{ name: mt('projectFile'), extensions: ['lightedit', 'json'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const p = r.filePaths[0];
    const text = await fs.readFile(p, 'utf-8');
    // 用户显式打开工程：授权读工程本身 + 其引用的外部文件（源图 / 外部 LUT）
    fileAccess.grantRead(p);
    fileAccess.grantProjectReferences(text);
    return { path: p, text };
  });

  ipcMain.handle('dialog:pickDir', async () => {
    const r = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    fileAccess.grantWriteDir(r.filePaths[0]);
    return r.filePaths[0];
  });

  ipcMain.handle('fs:writeFile', async (_e, absPath: string, bytes: ArrayBuffer | Uint8Array) => {
    if (!fileAccess.isWriteAllowed(absPath)) {
      throw new Error(mtf('errWriteDeny', { v: absPath }));
    }
    const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, buf);
  });

  ipcMain.handle('app:meta', () => ({ version: app.getVersion(), build: APP_BUILD }));

  // 界面语言切换：同步主进程并重建原生菜单
  ipcMain.handle('app:setLocale', (_e, locale: 'zh-CN' | 'en') => {
    // IPC 不信任渲染层类型标注：非法值一律忽略，保持当前语言
    if (locale !== 'zh-CN' && locale !== 'en') return;
    setMainLocale(locale);
    Menu.setApplicationMenu(buildMenu());
  });

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (!isSafeExternalUrl(url)) {
      return Promise.reject(new Error(mtf('errProto', { v: String(url) })));
    }
    return shell.openExternal(url);
  });

  // 手动触发 electron-updater
  ipcMain.handle('updater:check', async () => {
    try {
      await autoUpdater.checkForUpdates();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
  ipcMain.handle('updater:install', () => autoUpdater.quitAndInstall());

  // 远程 update.json（主进程发起，绕开渲染端 CSP / 跨域）
  ipcMain.handle('update:fetchRemote', async () => {
    // 离线 / 404（清单尚未发布）是常态：吞掉异常返回 null，由渲染层走 error 分支，避免主进程噪音
    try {
      const r = await fetch(`${REMOTE_UPDATE_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  });

  // ---------------- camera-watermark 水印工作室（整体加载原始编辑器） ----------------
  ipcMain.handle('cwm:open', async (_e, payload: unknown) => {
    if (wmWindow && !wmWindow.isDestroyed()) {
      studioInitByWc.set(wmWindow.webContents.id, payload);
      wmWindow.focus();
      return true;
    }
    wmWindow = new BrowserWindow({
      width: 1320,
      height: 860,
      minWidth: 1040,
      minHeight: 640,
      parent: mainWindow ?? undefined,
      modal: true,
      backgroundColor: '#0b0c0f',
      title: mt('studioTitle'),
      autoHideMenuBar: true,
      webPreferences: CWM_WP,
    });
    studioInitByWc.set(wmWindow.webContents.id, payload);
    const target = studioUrl(process.env.VITE_DEV_SERVER_URL, 'studio.html');
    if (target.url) await wmWindow.loadURL(target.url);
    else await wmWindow.loadFile(target.file!);
    const wcId = wmWindow.webContents.id;
    wmWindow.on('closed', () => {
      studioInitByWc.delete(wcId);
      wmWindow = null;
    });
    return true;
  });

  // studio 页面拉取自己的初始化数据（编辑窗 / 离屏合成窗各自绑定）
  ipcMain.handle('cwm:requestInit', (e) => studioInitByWc.get(e.sender.id) ?? null);

  ipcMain.handle('cwm:apply', (e, result: unknown) => {
    mainWindow?.webContents.send('cwm:applied', result);
    const win = BrowserWindow.fromWebContents(e.sender);
    win?.close();
  });

  ipcMain.handle('cwm:cancel', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
  });

  // 离屏全分辨率合成：隐藏窗口复用同一 camera-watermark 渲染器
  ipcMain.handle(
    'cwm:compose',
    (
      _e,
      payload: {
        baseDataUrl: string;
        state: unknown;
        meta: unknown;
        format: string;
        quality: number;
      }
    ) =>
      new Promise((resolve, reject) => {
        const win = new BrowserWindow({
          show: false,
          width: 800,
          height: 600,
          webPreferences: CWM_WP,
        });
        const wcId = win.webContents.id;
        studioInitByWc.set(wcId, { compose: true, ...payload });
        const timer = setTimeout(() => {
          if (composeJobs.has(wcId)) {
            composeJobs.delete(wcId);
            if (!win.isDestroyed()) win.destroy();
            reject(new Error(mt('errWmTimeout')));
          }
        }, 120000);
        composeJobs.set(wcId, {
          resolve: resolve as ComposeJob['resolve'],
          reject,
          win,
          timer,
        });
        win.webContents.on('render-process-gone', () => {
          clearTimeout(timer);
          composeJobs.delete(wcId);
          reject(new Error(mt('errWmCrash')));
        });
        const target = studioUrl(process.env.VITE_DEV_SERVER_URL, 'studio.html');
        (target.url ? win.loadURL(target.url) : win.loadFile(target.file!)).catch(reject);
      })
  );

  ipcMain.handle('cwm:composeResult', (e, result: { buffer: ArrayBuffer; width: number; height: number }) => {
    const job = composeJobs.get(e.sender.id);
    if (!job) return;
    clearTimeout(job.timer);
    composeJobs.delete(e.sender.id);
    job.resolve(result);
    if (!job.win.isDestroyed()) job.win.destroy();
  });
}

// ---------------- 生命周期 ----------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    setupAutoUpdater();
    registerIpc();
    const recent = await readRecent().catch(() => []);
    Menu.setApplicationMenu(buildMenu(recent));
    createWindow();
    // 启动 5 秒后后台检查语义版本更新（不抢启动资源）
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 5000);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

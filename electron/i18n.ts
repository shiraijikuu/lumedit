// 主进程文案（原生菜单 / 系统对话框）。渲染层语言切换时经 IPC 同步到这里并重建菜单。
export type MainLocale = 'zh-CN' | 'en';

type Dict = Record<string, string>;

const ZH: Dict = {
  // 原生菜单
  file: '文件',
  openImage: '打开图片…',
  importLut: '导入 .cube LUT…',
  saveProject: '保存工程…',
  openProject: '打开工程…',
  recentOpen: '最近打开',
  export: '导出…',
  quit: '退出',
  edit: '编辑',
  undo: '撤销',
  redo: '重做',
  view: '视图',
  fit: '适应窗口',
  zoomIn: '放大',
  zoomOut: '缩小',
  help: '帮助',
  checkUpdate: '检查更新',
  download: '下载页（浏览器打开）',
  about: '关于 LumEdit',
  // 系统对话框 / 过滤器 / 窗口标题
  winTitle: 'LumEdit 光影轻修',
  allImages: '所有支持的图片',
  rawImages: 'RAW 原始格式',
  allFiles: '所有文件',
  projectFile: 'LumEdit 工程',
  studioTitle: '水印工作室 · camera-watermark',
  updaterTitle: '更新已下载',
  updaterMsg: '新版本 v{v} 已下载完成，是否立即重启安装？',
  updaterDetail: '重启后将自动安装更新，当前未保存的工程请先保存。',
  later: '稍后重启',
  restartNow: '立即重启',
  errReadDeny: '拒绝读取：{v}\n（仅允许本次会话中用户选择的文件或工程引用的文件）',
  errWriteDeny: '拒绝写入：{v}\n（仅允许用户选择的输出目录之内）',
  errProto: '拒绝打开非 http(s) 链接：{v}',
  errWmTimeout: '水印全分辨率合成超时',
  errWmCrash: '合成窗口崩溃',
};

const EN: Dict = {
  file: 'File',
  openImage: 'Open Image…',
  importLut: 'Import .cube LUT…',
  saveProject: 'Save Project…',
  openProject: 'Open Project…',
  recentOpen: 'Recent',
  export: 'Export…',
  quit: 'Quit',
  edit: 'Edit',
  undo: 'Undo',
  redo: 'Redo',
  view: 'View',
  fit: 'Fit to Window',
  zoomIn: 'Zoom In',
  zoomOut: 'Zoom Out',
  help: 'Help',
  checkUpdate: 'Check for Updates',
  download: 'Releases (open in browser)',
  about: 'About LumEdit',
  winTitle: 'LumEdit',
  allImages: 'All supported images',
  rawImages: 'RAW formats',
  allFiles: 'All files',
  projectFile: 'LumEdit Project',
  studioTitle: 'Watermark Studio · camera-watermark',
  updaterTitle: 'Update Downloaded',
  updaterMsg: 'Version v{v} has finished downloading. Restart and install now?',
  updaterDetail: 'The update installs after restart; save any unsaved project first.',
  later: 'Later',
  restartNow: 'Restart Now',
  errReadDeny: 'Read denied: {v}\n(only files chosen by you or referenced by a project this session are allowed)',
  errWriteDeny: 'Write denied: {v}\n(only inside the output folder you chose is allowed)',
  errProto: 'Refusing to open a non-http(s) link: {v}',
  errWmTimeout: 'Watermark full-resolution compose timed out',
  errWmCrash: 'Compose window crashed',
};

const DICTS: Record<MainLocale, Dict> = { 'zh-CN': ZH, en: EN };

let current: MainLocale = 'zh-CN';

export function setMainLocale(locale: MainLocale): void {
  if (locale === 'zh-CN' || locale === 'en') current = locale;
}
export function getMainLocale(): MainLocale {
  return current;
}
export function mt(key: string): string {
  return DICTS[current][key] ?? ZH[key] ?? key;
}
/** 带 {name} 插值的主进程翻译 */
export function mtf(key: string, vars: Record<string, string | number>): string {
  let s = mt(key);
  for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  return s;
}

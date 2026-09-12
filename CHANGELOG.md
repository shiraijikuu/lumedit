# 更新日志（CHANGELOG）

## v0.2.0（2026-09-12，build 4）

### 新增
- **RAW 兼容**：支持索尼 ARW、DNG、NEF、CR2/CR3、RAF、ORF、RW2 等 20 种 RAW 扩展名。采用「提取 RAW 内嵌全尺寸 JPEG 预览」路线（不做 libraw 解拜耳），真实索尼 a7c2 ARW 验证可提取 7008×4672 全尺寸内嵌图；RAW 的拍摄元数据从 TIFF 容器抽取并在导出时回写
- **中英双语**：界面文案全量抽离到 i18n 词典，顶栏可一键切换 简体中文 / English 并持久化；原生菜单、系统对话框、更新提示同步双语；Chromium 语言包裁剪到 zh-CN / en-US（安装包体积下降约 7MB）
- **深化调色（对标 Lightroom / 达芬奇）**：
  - 第一档（基础版与完整版均含）：曝光、亮度、对比度、高光、阴影、白色、黑色、色温、色调、清晰度、去朦胧、饱和度、自然饱和，以及 RGB 主/红/绿/蓝四通道色调曲线（可加点、拖拽、双击删点）+ 实时直方图
  - 第二档（仅完整版）：8 色相 HSL 混色器（色相/饱和/明度）、阴影/中间调/高光颜色分级、晕影/颗粒/锐化/降噪效果
- **双版本发行**：同一套源码经编译期档位开关 `__APP_TIER__`（`LUMEDIT_TIER=basic/full`）产出「基础版 LumEdit Basic（仅第一档）」与「完整版 LumEdit（第一档+第二档）」，独立 appId/产品名/安装目录，可共存

### 修复（build 4）
- 修复 RAW 图片打开「水印工作室」失败：camera-watermark 无法直接解码 ARW / DNG / NEF 等 RAW 容器，现改为复用 LumEdit 已提取的内嵌预览与 EXIF，不再把 RAW 原始字节交给工作室解码
- 工作室初始化增加原图 ingest 失败回退，即使遇到其他浏览器不支持的原始格式，也能使用调色后预览正常进入编辑界面
- 修复 RAW 竖图导入后变横：RAW 内嵌 JPEG 缺失 Orientation 标签时，按 RAW TIFF 的 Orientation 手动转正
- 修复水印应用到图片后离屏预览重建失败：IPC 发送前将 Vue reactive 水印状态转换为普通对象，避免 “An object could not be cloned”

### 工程
- 渲染管线新增 Curve / HSL / ColorGrade / Effects 四个 WebGL2 Stage，预览与导出统一经 `createEditStageBundle()` 组装，保证所见即所得；中性参数全部直通短路
- 参数模型扩展为 geometry/adjust/curve/hsl/colorGrade/effects/lut(/watermark)，`ensureParams` 向前兼容旧工程与旧撤销快照
- 新增跨平台打包脚本 `scripts/dist.mjs`（`npm run dist:full` / `dist:basic`）

### 测试
- 冒烟测试扩充到 105 项：RAW 扩展名/签名识别、Orientation 8 转正、RAW EXIF → 水印工作室字段映射、合成 RAW 内嵌 JPEG 提取与 Electron 端到端预览解码、曲线 LUT 烘焙/插值、参数模型向前兼容与深拷贝、中英文词典 key 对齐、第二档 Stage 中性直通；`vue-tsc` 0 错误，105 项全部通过

## v0.1.1（2026-09-12）

### 安全加固
- **IPC 文件读写授权**：`fs:readBuffer` / `fs:writeFile` 不再接受任意路径。读取仅限本次会话中用户通过对话框选择的文件、以及打开的 `.lightedit` 工程引用的文件；写入仅限用户通过对话框选择的输出目录之内，杜绝渲染层被攻破后任意读写磁盘
- **外部链接协议白名单**：`shell:openExternal` 与窗口弹开行为仅允许 `http(s)` 链接，拒绝 `file://` 等任意协议
- **更新清单 URL 锁定**：远程 `update.json` 中的下载地址只信任本仓库 GitHub Releases（`shiraijikuu/lumedit`），其余一律回退到 Releases 页面；清单 `version` 字段增加格式校验
- **.cube 解析防 DoS**：`LUT_3D_SIZE` 上限收紧到 129（覆盖 17/33/65/129 全部常见规格）、解析文本上限 80MB、数据行先于 `LUT_3D_SIZE` 声明立即报错、超量数据点快速失败，恶意 LUT 文件不再能拖垮渲染层

### 修复
- 主进程 `webContents.on('crashed')` 改用现行 `render-process-gone` 事件
- `electron/` 目录纳入 `vue-tsc` 严格类型检查（此前从未被检查），并修复由此暴露的类型错误

### 测试
- 冒烟测试新增 19 项用例：文件访问授权策略（读/写/工程引用/路径逃逸）、更新清单 URL 白名单、cube 解析边界（声明顺序 / 尺寸上限 / 超量数据），共 60 项全部通过

## v0.1.0（2026-09-12）

- 首个版本：裁剪 / 旋转 / 翻转 / 固定比例；曝光、亮度、对比度、饱和度、色温；19 款内置 LUT + 外部 `.cube` + 「我的 LUT」库；camera-watermark 水印工作室；JPG / PNG / WebP 全分辨率保真导出（保留 EXIF、默认清除 GPS）；批量处理、`.lightedit` 工程文件、撤销/重做（50 步）、检查更新

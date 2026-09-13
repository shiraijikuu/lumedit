# LumEdit · 光影轻修

> **Local-first photo editing · 本地优先修图**
> **EN:** A privacy-first Windows desktop editor for RAW, professional color, masks, LUTs and watermarks.
> **中文：** 一款本地优先、隐私优先，面向 RAW、专业调色、蒙版、LUT 与水印的 Windows 桌面修图工具。

[![Release / 版本](https://img.shields.io/github/v/release/shiraijikuu/lumedit)](https://github.com/shiraijikuu/lumedit/releases/latest)
[![License / 许可证](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform / 平台](https://img.shields.io/badge/platform-Windows-0078D4.svg)](https://github.com/shiraijikuu/lumedit/releases/latest)
[![Tech / 技术](https://img.shields.io/badge/tech-Electron%20%2B%20Vue%203%20%2B%20WebGL2-42b883.svg)](https://github.com/shiraijikuu/lumedit)

**EN:** LumEdit is a local-first, non-destructive Windows photo editor. Import RAW and common image formats, use a WebGL2 professional color pipeline, and finish images with 3D LUTs, curves, HSL, color grading, Log wheels, local masks, presets, batch processing, watermark studio, and high-fidelity export. Photos never leave your computer, and no account is required.

**中文：** LumEdit 是一款本地优先、参数式非破坏编辑的 Windows 桌面修图工具。支持 RAW 与常见图片格式，内置 WebGL2 专业调色管线，覆盖 3D LUT、曲线、HSL、颜色分级、Log 色轮、局部蒙版、调色预设、批量处理、水印工作室与保真导出。照片不上传、无需注册，调整不破坏原图。

- **Version / 版本：** v0.5.0
- **Platform / 平台：** Windows 10 / 11 x64
- **Author / 作者：** shiraijikuu
- **AI assistance / AI 协助：** OpenAI Codex
- **License / 许可证：** MIT

| LumEdit main window / LumEdit 主界面 | RAW loaded with color tools / 载入 RAW 与调色面板 |
|---|---|
| ![LumEdit main window / LumEdit 主界面](docs/screenshots/app-main.png?v=20260914b) | ![LumEdit with Sony a7C II RAW loaded / 载入索尼 a7C II RAW 与调色面板](docs/screenshots/app-loaded.png?v=20260914b) |

---

## Features / 功能

**EN**
- **Import:** JPG / PNG / WebP plus RAW compatibility for ARW, DNG, NEF, CR2, CR3, RAF, ORF, RW2 and 20+ common extensions. Uses the embedded full-size JPEG preview, reads EXIF, and automatically applies Orientation 1–8. No libraw dependency and no de-Bayer step.
- **Geometry:** free crop, fixed ratios, 90° rotation, straighten, horizontal/vertical flip, and crop guides (thirds, grid, golden ratio).
- **One-click Auto Enhance:** local GPU histogram analysis and a rule-based engine adjust exposure, white balance, contrast and saturation. No AI model, no upload; target analysis time is under 100 ms, with one-click undo or reset.
- **Advanced color:** exposure, brightness, contrast, highlights, shadows, whites, blacks, temperature, tint, clarity, dehaze, vibrance and saturation; four-channel RGB tone curves with a live histogram; 8-band HSL; shadow/midtone/highlight color grading; Log wheels with Lift / Gamma / Gain; vignette, grain, sharpen and noise reduction.
- **Local masks:** linear, radial, luminance range, color range and brush masks; up to 8 stacked masks with union, intersection and subtract composition for targeted secondary grading.
- **Presets:** save the complete look (tone, curves, HSL, grading, effects and LUT strength) as a named preset, apply it in one click, and reuse it across sessions from userData.
- **LUT workflow:** 19 built-in `.cube` LUTs across six categories, external `.cube` import, intensity control, a persistent “My LUTs” library, and GPU-baked export of the current grade as a shareable `.cube`.
- **White balance picker:** click a neutral gray area to estimate temperature and tint automatically.
- **Preview:** zoom, pan, fit, hold-to-compare original, draggable split-screen comparison, and clipping warnings for highlights and shadows with histogram statistics.
- **History:** parameter snapshots, up to 50 undo steps, drag-safe history grouping, and cross-image copy/paste for the complete adjustment stack.
- **Export:** full-resolution JPG, PNG, WebP and 16-bit PNG rendered in a Worker with OffscreenCanvas. EXIF is preserved where supported, GPS is removed by default, and clipboard copy plus 1080 / 2000 / original long-edge presets are available.
- **Batch processing:** serial task queue with progress, cancellation and watermark composition support.
- **Projects and sessions:** non-destructive `.lightedit` projects, backward compatibility, recent-file history, and automatic session restore.
- **Metadata:** EXIF panel for camera, lens, exposure, capture time and GPS.
- **Watermark Studio:** the complete camera-watermark editor is embedded after the color pipeline for text, style, image watermark, placement, decoration and export workflows.
- **Bilingual UI:** Simplified Chinese / English switching for the renderer, native menus, dialogs and update prompts.

**中文**
- **导入**：支持 JPG / PNG / WebP；兼容 ARW、DNG、NEF、CR2、CR3、RAF、ORF、RW2 等 20 多种常见 RAW 扩展名，提取 RAW 内嵌全尺寸 JPEG 预览，读取 EXIF 并自动按 Orientation 1–8 转正；不依赖 libraw，不做解拜耳。
- **几何**：自由裁剪、固定比例、90° 旋转、任意角度校正、水平/垂直翻转，以及三分线 / 网格 / 黄金比例裁剪参考线。
- **一键自动优化**：本地 GPU 直方图分析 + 规则引擎，自动校正曝光、白平衡、对比度与饱和度；不依赖 AI、不上传照片，分析目标 < 100ms，可一键撤销或重置。
- **深化调色**：曝光、亮度、对比度、高光、阴影、白色、黑色、色温、色调、清晰度、去朦胧、饱和度、自然饱和；RGB 四通道曲线 + 实时直方图；8 色相 HSL；阴影 / 中间调 / 高光颜色分级；Log 色轮 Lift / Gamma / Gain；晕影、颗粒、锐化与降噪。
- **局部蒙版**：线性、径向、亮度范围、颜色范围和画笔蒙版；最多 8 个叠加，支持并集 / 交集 / 差集组合，适合“区域内只调红色”等二级调色。
- **调色预设**：将影调、曲线、HSL、分级、效果与 LUT 强度保存为命名预设，一键应用，存入 userData 并可跨会话复用。
- **LUT 工作流**：内置 6 类共 19 款 `.cube`，支持外部 `.cube` 导入、强度控制、持久化「我的 LUT」库，并可将当前曲线 / HSL / 分级 GPU 烘焙导出为 `.cube` 分享。
- **白平衡吸管**：点取画面中的中性灰区域，自动推算色温与色调。
- **预览**：缩放、平移、适配、按住查看原图、可拖动分屏对比，以及高光 / 阴影剪裁警告与直方图统计。
- **撤销 / 重做**：参数快照式历史，最多 50 步；拖动滑块不逐帧压栈，支持跨图片复制 / 粘贴整套调整。
- **导出**：全分辨率 JPG / PNG / WebP / 16-bit PNG，Worker + OffscreenCanvas 离线程渲染；保留支持的 EXIF、默认清除 GPS，支持复制到剪贴板与 1080 / 2000 / 原图长边尺寸。
- **批量处理**：串行任务队列、进度反馈、任务取消，并支持水印合成阶段。
- **工程与会话**：`.lightedit` 非破坏工程、旧工程向前兼容、最近打开记录与自动会话恢复。
- **元数据**：EXIF 面板可查看相机、镜头、曝光参数、拍摄时间与 GPS。
- **水印工作室**：完整嵌入 camera-watermark 编辑器，位于调色管线之后，支持文字、样式、图片水印、位置、装饰与导出。
- **双语界面**：简体中文 / English 一键切换并持久化；原生菜单、系统对话框与更新提示同步双语。

---

## Download / 下载

**EN**
- **Installer:** `LumEdit-x.y.z-setup.exe` — NSIS installer, recommended for most users.
- **Portable:** `LumEdit-x.y.z-portable.exe` — single-file portable build for USB drives. In-app automatic updates are not available in the portable build.

**中文**
- **安装版**：`LumEdit-x.y.z-setup.exe`，NSIS 安装包，推荐大多数用户使用。
- **便携版**：`LumEdit-x.y.z-portable.exe`，单文件免安装，适合 U 盘携带；便携版不提供应用内自动更新。

Latest release / 最新版本：https://github.com/shiraijikuu/lumedit/releases/latest

---

## Quick Start / 快速开始

### Option 1: Run the packaged version / 方式一：直接运行打包版

**EN:** Download the installer from Releases, run it, and launch LumEdit from the Start menu. No Python or Node.js is required.

**中文：** 从 Releases 下载安装包，运行安装后从开始菜单启动 LumEdit。无需安装 Python 或 Node.js。

### Option 2: Run from source / 方式二：从源码运行

**EN:** Install Node.js and npm, then run the commands below in the project directory. Electron will start the desktop app with the Vite development server.

**中文：** 安装 Node.js 与 npm，然后在项目目录执行下面的命令。Electron 会配合 Vite 开发服务器启动桌面应用。

```bash
npm install
npm run dev
```

---

## Usage / 使用步骤

1. **Open a photo / 打开照片：** Use `Ctrl + O` or the file menu to load JPG, PNG, WebP or a supported RAW file. The image is displayed after Orientation correction. / 使用 `Ctrl + O` 或文件菜单载入 JPG、PNG、WebP 或支持的 RAW，图片会先按 Orientation 转正再显示。
2. **Adjust the image / 调整图片：** Use the right-side panels for exposure, curves, HSL, color grading, Log wheels, masks, LUTs and effects. / 使用右侧面板调整曝光、曲线、HSL、颜色分级、Log 色轮、蒙版、LUT 与效果。
3. **Compare and inspect / 对比与检查：** Hold `\` to view the original, drag the split divider to compare, and enable `J` to check clipping warnings. / 按住 `\` 查看原图，拖动分屏分割线对比，按 `J` 检查高光 / 阴影剪裁警告。
4. **Add a watermark / 添加水印：** Open Watermark Studio, edit text, style, image watermark, position and decoration, then apply the result back to the editor. / 打开水印工作室，编辑文字、样式、图片水印、位置与装饰，然后将结果应用回编辑器。
5. **Export or save / 导出或保存：** Export JPG, PNG, WebP or 16-bit PNG, copy to the clipboard, or save a non-destructive `.lightedit` project. / 导出 JPG、PNG、WebP 或 16-bit PNG，复制到剪贴板，或保存非破坏性的 `.lightedit` 工程。

---

## Tech Stack & Rendering Pipeline / 技术栈与渲染管线

| Layer / 层 | Choice / 选型 |
|---|---|
| Desktop shell / 桌面壳 | Electron: main process, preload, IPC allowlist and native i18n / Electron：主进程、preload、IPC 白名单与原生 i18n |
| Frontend / 前端 | Vue 3 + Vite + TypeScript / Vue 3 + Vite + TypeScript |
| State / 状态 | Pinia for editor, batch and toast state / Pinia 管理编辑器、批量与提示状态 |
| Color rendering / 色彩渲染 | WebGL2 with 3D LUT textures, curve LUT baking and texture pooling / WebGL2，使用 3D LUT 纹理、曲线 LUT 烘焙与纹理池 |
| RAW import / RAW 导入 | Custom embedded-JPEG preview extractor using a marker walk, with no libraw / 自研 marker walk 内嵌 JPEG 预览提取器，不依赖 libraw |
| EXIF / 元数据 | exifr / exifr |
| LUT parsing / LUT 解析 | Custom `.cube` parser for 3D LUTs with size limits for DoS protection / 自研 `.cube` 解析器，仅支持 3D LUT，并带尺寸上限防 DoS |
| Export / 导出 | Web Worker + OffscreenCanvas / Web Worker + OffscreenCanvas |
| Packaging / 打包 | electron-builder with NSIS + Portable; Chromium locales trimmed to zh-CN / en-US / electron-builder，输出 NSIS + Portable，并将 Chromium 语言包裁剪到 zh-CN / en-US |

**EN**

```text
Source / RAW embedded preview
→ Orientation correction
→ Geometry (crop / rotate / flip)
→ Adjust
→ Curve
→ HSL
→ ColorGrade
→ Log Wheels
→ Qualifier
→ Gradation (local masks)
→ Effects
→ LUT
→ Watermark (offscreen composite)
→ Output
```

**中文**

```text
原图 / RAW 内嵌预览
→ Orientation 方向校正
→ Geometry 裁剪 / 旋转 / 翻转
→ Adjust 基础调色
→ Curve 曲线
→ HSL
→ ColorGrade 颜色分级
→ Log Wheels 色轮
→ Qualifier 取色限定器
→ Gradation 局部蒙版
→ Effects 效果
→ LUT
→ Watermark 水印离屏合成
→ Output 输出
```

- **EN:** The same stage bundle powers preview and full-resolution export, so the exported result matches the preview. Neutral stages short-circuit.
- **中文：** 预览与全分辨率导出复用同一套 Stage，所见即所得；中性参数直接短路。
- **EN:** Intermediate textures are reused through `texturePool.ts`, and parameter changes are coalesced with `requestAnimationFrame`.
- **中文：** 中间纹理通过纹理池复用，参数变化经 `requestAnimationFrame` 合帧。
- **EN:** Preview is downsampled to a 2000 px long edge; export uses the full resolution.
- **中文：** 预览最长边降采样至 2000px，导出使用全分辨率。
- **EN:** sRGB is the working space, with an approximate Adobe RGB conversion matrix.
- **中文：** 工作空间为 sRGB，并提供近似 Adobe RGB 转换矩阵。

---

## Development / 开发与运行

**EN:** Install dependencies, start the development environment, run type checks, build release assets, or run the offscreen smoke suite with the commands below.

**中文：** 使用下面的命令安装依赖、启动开发环境、执行类型检查、构建发布资产或运行离屏冒烟测试。

```bash
npm install        # Install dependencies / 安装依赖
npm run dev        # Start Vite dev server with Electron / 启动 Vite 与 Electron 开发环境
npm run typecheck  # Type-check renderer + Electron / 渲染层与 Electron 类型检查
npm run build      # Type-check and build / 类型检查并构建
npm run dist       # Build Windows installer + portable package / 构建 Windows 安装包与便携版
npm run publish    # Publish release assets to GitHub Releases / 发布资产到 GitHub Release
npm run smoke      # Offscreen Electron smoke tests / 离屏 Electron 冒烟测试
```

### Smoke Tests / 冒烟测试

**EN:** The smoke suite runs in hidden Electron windows with SwiftShader and covers `.cube` parsing and DoS limits, the complete GPU pipeline, RAW extension/signature detection, embedded JPEG extraction, Orientation 8, Auto Enhance, mask composition and brush pixels, PNG16 orientation/compression, EXIF rewrite and three-container injection, undo history, project serialization, presets, LUT baking, i18n key alignment, update URL allowlisting and texture pooling. Current result: 191 passed, 0 failed.

**中文：** 冒烟测试在隐藏 Electron 窗口 + SwiftShader 下离屏运行，覆盖 `.cube` 解析与防 DoS、完整 GPU 管线、RAW 扩展名/签名识别、内嵌 JPEG 提取、Orientation 8 转正、自动优化、蒙版并集/交集/差集与画笔逐像素、PNG16 方向与压缩、EXIF 重写与三容器注入、撤销栈、工程序列化、调色预设、LUT 烘焙往返、中英文词典对齐、更新 URL 白名单与纹理池复用等。当前结果：191 通过，0 失败。

> **EN:** Offscreen WebGL2 requires `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`; the smoke runner already includes them.
> **中文：** 离屏 WebGL2 需要 `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`；`smoke-main.cjs` 已内置这些参数。

---

## Built-in LUTs / 内置 LUT

**EN**
- Source files: `src/assets/luts/*.cube` — 17³ real `.cube` files generated by scripts.
- Index: `src/assets/luts/manifest.json`.
- Loading: `LutManager` lazy-loads with `import.meta.glob(..., { query: '?raw' })` and caches parsed results in memory.
- Library: 19 LUTs in six categories — Film 4, Cinematic 4, Portrait 3, Landscape 3, Black & White 2 and Creative 3.

**中文**
- 源文件：`src/assets/luts/*.cube`，由脚本生成的真实 17³ `.cube` 文件。
- 索引：`src/assets/luts/manifest.json`。
- 加载：`LutManager` 通过 `import.meta.glob(..., { query: '?raw' })` 按需加载，并在内存中缓存解析结果。
- 库内容：6 类共 19 款——胶片 4 / 电影感 4 / 人像 3 / 风光 3 / 黑白 2 / 创意 3。

**EN:** To add or remove LUTs, edit `GRADES` / `META` in `scripts/gen-luts.mjs` and run the command below.

**中文：** 要增删 LUT，请修改 `scripts/gen-luts.mjs` 中的 `GRADES` / `META`，然后执行下面的命令。

```bash
node scripts/gen-luts.mjs
```

---

## Updates / 检查更新

**EN:** LumEdit uses two update paths:

1. **Semantic version:** electron-updater reads `latest.yml` from `github.com/shiraijikuu/lumedit`; electron-builder generates the feed during packaging.
2. **Build number:** the remote manifest detects rebuilds of the same version and opens the Release page for manual download. Download URLs are restricted to this repository's Releases by `resolveDownloadUrl`.

**中文：** LumEdit 使用双轨更新：

1. **语义化版本**：electron-updater 从 `github.com/shiraijikuu/lumedit` 读取 `latest.yml`，打包时由 electron-builder 生成更新源。
2. **build 号**：远程清单可检测同版本重新构建，并跳转 Release 页手动下载；`resolveDownloadUrl` 只信任本仓库 Releases。

Production manifest / 正式清单：

```text
https://cdn.jsdelivr.net/gh/shiraijikuu/lumedit@main/update.json
```

**EN:** Release flow: create a tag, run `npm run dist`, run `npm run publish`, then update `update.json`.

**中文：** 发布流程：打 tag，执行 `npm run dist`，执行 `npm run publish`，最后更新 `update.json`。

---

## Watermark Studio / 水印工作室

> **EN:** LumEdit embeds the editor and rendering kernel from camera-watermark instead of maintaining a reduced duplicate.
> **中文：** LumEdit 直接复用 **camera-watermark** 的编辑器与渲染内核，不维护简化副本。
>
> Repository / 仓库：https://github.com/shiraijikuu/camera-watermark
> Website / 官网：https://itangxs.top/camera-watermark/

- **Full editor / 完整编辑器：** loads `public/cwm/studio.html`, copied from camera-watermark's editor with `lumedit-bridge.js` injected before `</body>`. Text, style, image watermark, placement, decoration and export pages remain available. / 直接加载 `public/cwm/studio.html`，在 `</body>` 前注入 `lumedit-bridge.js`，保留文字、样式、图片水印、位置、装饰与导出页面。
- **Modal workflow / 模态流程：** a 1320×860 child window receives the original image and EXIF, then previews the image after LumEdit color processing. The outer photo list and batch UI are hidden for single-image editing. / 主进程打开 1320×860 模态子窗，传入原图与 EXIF，并显示 LumEdit 调色后的底图；单张精修时隐藏照片栏与批量外壳。
- **Composite order / 合成顺序：** the WebGL pipeline outputs a lossless PNG after geometry, color and LUT; an offscreen window then runs camera-watermark's full-resolution `renderTo()` and EXIF rewrite. The watermark therefore sits after grading and is not recolored. / WebGL 管线在几何、调色与 LUT 后输出无损 PNG，再由离屏窗执行 camera-watermark 全分辨率 `renderTo()` 与 EXIF 回注；水印位于调色之后，不会被调色改变。
- **Preview and undo / 预览与撤销：** `WatermarkParams` stores the complete editor state in history and projects; the full-image preview overlay is runtime-only and excluded from project files. / `WatermarkParams` 将完整编辑器状态纳入撤销栈与工程文件；整图预览 overlay 只存在于运行时，不写入工程。

---

## Shortcuts / 快捷键

| Key / 按键 | Action / 功能 |
|---|---|
| Ctrl + O | Open image / 打开图片 |
| Ctrl + S | Save project / 保存工程 |
| Ctrl + Shift + O | Open project / 打开工程 |
| Ctrl + E | Export / 导出 |
| Ctrl + Z / Ctrl + Y | Undo / Redo / 撤销 / 重做 |
| Ctrl + Alt + C / Ctrl + Alt + V | Copy / Paste adjustments / 复制 / 粘贴调整 |
| Ctrl + Shift + C | Copy to clipboard / 复制到剪贴板 |
| J | Toggle clipping warnings / 剪裁警告开关 |
| `\` (hold) | View original / 按住查看原图 |
| `0` | Fit to window / 适配窗口 |
| `+` / `-` | Zoom / 缩放 |
| Enter / Esc | Apply / cancel crop / 裁剪应用 / 取消 |

---

## Project Structure / 目录结构

| Path / 路径 | Purpose / 用途 |
|---|---|
| `.github/workflows/` | CI: typecheck + smoke tests on push/PR / CI：push/PR 自动执行类型检查与冒烟测试 |
| `electron/` | Main process, preload, IPC allowlist, menus, updater, native i18n and userData stores / 主进程、preload、IPC 白名单、菜单、自动更新、原生 i18n 与 userData 存储 |
| `src/core/render/` | WebGL2 image renderer, stage pipeline, buffers, texture pool and curve LUT baking / WebGL2 渲染器、Stage 管线、缓冲区、纹理池与曲线 LUT 烘焙 |
| `src/core/image/` | Import, RAW embedded preview extraction, EXIF, Orientation and downsampling / 导入、RAW 内嵌预览提取、EXIF、Orientation 与降采样 |
| `src/core/export/` | Worker and OffscreenCanvas export / Worker 与 OffscreenCanvas 离线程导出 |
| `src/core/history/`, `project/`, `batch/` | History, project serialization and batch scheduling / 撤销历史、工程序列化与批量调度 |
| `src/components/` | Vue UI: canvas, toolbar, panels, dialogs and controls / Vue 界面：画布、顶栏、面板、弹窗与控件 |
| `src/assets/luts/` | 19 built-in `.cube` files and manifest / 19 款内置 `.cube` 与 manifest |
| `src/i18n/` | Renderer dictionaries for zh-CN / en / 渲染层 zh-CN / en 词典 |
| `test/smoke/` | End-to-end offscreen smoke suite / 离屏端到端冒烟测试 |
| `docs/screenshots/` | README screenshots / README 界面截图 |

---

## Versioning / 版本规范

**EN:** LumEdit follows strict semantic versioning `x.y.z`.

- **Major X:** breaking changes that are incompatible with older versions.
- **Minor Y:** new features that remain backward compatible.
- **Patch Z:** bug fixes or security fixes only, with no new features.

**中文：** LumEdit 严格使用语义化版本 `x.y.z`。

- **主版本 X：** 破坏性、不兼容旧版本的变更。
- **次版本 Y：** 向下兼容的新功能。
- **修订版本 Z：** 只修 bug / 安全修复，无新功能。

**EN:** See `CHANGELOG.md` for release history; packages live in `releases/vX.Y.Z/`.

**中文：** 版本历史见 `CHANGELOG.md`，发布包按版本放入 `releases/vX.Y.Z/`。

---

## Author / 作者

**shiraijikuu**
- LumEdit repository / LumEdit 仓库：https://github.com/shiraijikuu/lumedit
- camera-watermark / 水印项目：https://github.com/shiraijikuu/camera-watermark
- License / 许可证：MIT

# LumEdit · 光影轻修

一款 **Windows 桌面端、纯本地、零上传** 的轻量单张修图工具。
Electron + Vue 3 + Vite + TypeScript + Pinia + WebGL2，专注「裁剪 + 基础调色 + LUT + 水印 + 保真导出」。

---

## 一、功能

### P0（核心）
- **导入**：JPG / PNG / WebP，读取 EXIF，自动按 Orientation 1–8 校正方向
- **几何**：自由裁剪、固定比例（1:1 / 3:2 / 2:3 / 4:3 / 3:4 / 16:9 / 9:16）、90° 旋转、任意角度、水平/垂直翻转
- **基础调色**：曝光、亮度、对比度、饱和度、色温
- **LUT**：19 款内置 `.cube`（六大场景分类）+ 外部 `.cube` 导入，强度 0–100%；导入的 LUT 可存入「我的 LUT」库，支持命名、分类、持久化（存于 userData，重启仍在）
- **预览**：缩放 / 平移 / 适配、按住查看原图
- **撤销 / 重做**：只存参数快照，拖动不压栈、松手压栈，上限 50 步
- **导出**：JPG / PNG / WebP，全分辨率、Worker + OffscreenCanvas 离线程渲染，保留 EXIF、默认清除 GPS

### P1
- **批量处理**：串行任务队列、进度反馈、可取消
- **工程文件**：`.lightedit` 保存 / 打开（参数 + 资源引用，非破坏性）
- **水印插件**：内置无头 watermark-engine（静态 PNG + 文字 + 内置模板），作为管线最后一个 Stage，不被调色/LUT 影响
- **检查更新**：electron-updater 语义化自动更新 + build 号手动下载双轨

---

## 二、技术栈与渲染管线

| 层 | 选型 |
|---|---|
| 桌面壳 | Electron（主进程 / preload / IPC） |
| 前端 | Vue 3 + Vite + TypeScript |
| 状态 | Pinia |
| 色彩渲染 | WebGL2（3D LUT 纹理） |
| EXIF | exifr |
| LUT 解析 | 自研 `.cube` 解析器（仅 3D LUT） |
| 导出 | Web Worker + OffscreenCanvas |
| 打包 | electron-builder（NSIS） |

**管线顺序（不可调整）**：

```
原图 → Orientation 校正（上传前 2D）→ Geometry 裁剪/旋转/翻转
     → Adjust 基础调色 → LUT → Watermark 水印 → 输出
```

- 预览最长边降采样到 2000px，导出走全分辨率，所见即所得（预览与导出共用 `runPipeline`）
- 仅支持 sRGB；Adobe RGB 近似矩阵转换
- 进入裁剪模式时临时切到 Passthrough 显示原图，便于在原图上拖选裁剪框

---

## 三、开发与运行

```bash
npm install        # 安装依赖（Electron 下载慢可设 ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/）
npm run dev        # 启动 Vite 开发服（配合 Electron 主进程）
npm run typecheck  # 仅类型检查（vue-tsc，strict）
npm run build      # 类型检查 + 构建渲染层/主进程/preload
npm run dist       # 构建并打包 Windows 安装包到 release/
```

### 冒烟测试

```bash
npm run smoke      # esbuild 打包测试 → 离屏 Electron(SwiftShader) 运行，输出 38 passed / 0 failed
```

覆盖：`.cube` 解析、GPU 管线（几何/调色/LUT/水印/全串联/直通）、EXIF 重写与三容器注入回读、
撤销栈、工程文件序列化、版本号比较等 38 项。测试在隐藏窗口 + SwiftShader 下离屏运行，无需人工。

> 离屏 WebGL2 需给 Electron 传 `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`（smoke-main.cjs 已内置）。

---

## 四、内置 LUT

- 源文件：`src/assets/luts/*.cube`（17³，脚本生成的**真实** `.cube` 文件）
- 索引：`src/assets/luts/manifest.json`
- 加载：`LutManager` 通过 `import.meta.glob(..., { query: '?raw' })` 按需加载，解析结果内存缓存
- 六类 19 款：胶片模拟 4 / 电影感 4 / 人像 3 / 风光 3 / 黑白 2 / 创意 3

**增删 LUT**：修改 `scripts/gen-luts.mjs` 的 `GRADES` / `META` 后执行：

```bash
node scripts/gen-luts.mjs   # 重新生成全部 .cube 并更新 manifest，面板代码无需改动
```

---

## 五、检查更新（发布前配置）

双轨机制（主进程 `electron/main.ts`，渲染层 `src/core/update/updateService.ts`）：

1. **语义化版本**：交给 electron-updater，feed 指向 `github.com/shiraijikuu/lumedit`，
   打包时由 electron-builder 生成 `latest.yml`（已在 `electron-builder.yml` 配置 `publish`）。
2. **build 号递增**：读取远程清单，提示去 Release 页手动下载。

远程清单示例见 `update.example.json`，正式清单地址：

```
https://cdn.jsdelivr.net/gh/shiraijikuu/lumedit@main/update.json
```

发布流程：打 tag → `npm run dist` → 把 `release/` 下安装包与 `latest.yml` 上传到 GitHub Release →
更新仓库根目录 `update.json`。仓库未创建前，更新检查会静默失败，不影响使用。

---

## 六、水印：整体复用 camera-watermark 编辑器

> 水印能力整体复用我的另一个项目 **camera-watermark**（批量相机水印工具）：
> 仓库 https://github.com/shiraijikuu/camera-watermark ，主页 https://itangxs.top/camera-watermark 。
> LumEdit 不重写水印功能，而是直接加载其编辑器页面与渲染内核。

- **直接整体加载 camera-watermark 的原始编辑器页面**（`public/cwm/studio.html`，由其 `app/index.html`
  拷贝并在 `</body>` 前注入 `lumedit-bridge.js`），不自写简化水印功能，保证文字/样式/图片水印/
  位置/装饰/导出六页能力与 camera-watermark 完全一致。
- **编辑**：主进程开一个 1320×860 的模态子窗加载该页，bridge 以 `ingest()` 喂入原图（保留完整 EXIF），
  并用 LumEdit 调色后的底图替换显示；隐藏其照片栏/状态栏/批量等与单张精修无关的外壳，只保留中间画布与
  右侧完整参数页，顶栏换成「取消 / 应用到图片」。
- **合成不在 WebGL 管线内**：WebGL 管线只跑 几何→调色→LUT，输出无损 PNG 中间位图；主线程再开一个
  `show:false` 离屏窗复用同一页面的 `renderTo()` 做全分辨率水印合成（`cwm:compose`），最后编码并回注 EXIF。
  水印因此天然位于调色/LUT 之后，不会被调色改变。
- 参数模型 `WatermarkParams = { enabled, cwmState, cwmMeta }`：`cwmState` 即 camera-watermark 的完整
  编辑器状态（进撤销栈/工程文件），运行时整图预览 `wmPreviewUrl` 以 overlay 叠加、不进工程。
- 主预览：调色参数变化后防抖 500ms 经离屏窗重建水印预览；导出时按全分辨率重建，所见即所得。
- camera-watermark 负责「批量水印」，LumEdit 负责「单张精修 + 顺手加水印」，两者通过「导出 → 导入」衔接，产品层独立。

---

## 七、快捷键

| 按键 | 功能 |
|---|---|
| Ctrl + O | 打开图片 |
| Ctrl + S | 保存工程 |
| Ctrl + Shift + O | 打开工程 |
| Ctrl + E | 导出 |
| Ctrl + Z / Ctrl + Y | 撤销 / 重做 |
| `\`（按住） | 查看原图 |
| `0` | 适配窗口 |
| `+` / `-` | 缩放 |
| Enter / Esc | 裁剪应用 / 取消 |

---

## 八、目录结构

```
lumedit/
├─ electron/            主进程、preload（IPC 白名单、菜单、自动更新）
├─ src/
│  ├─ assets/luts/      19 款内置 .cube + manifest
│  ├─ assets/watermark-templates/  内置水印模板 JSON
│  ├─ components/       Vue 组件（画布、顶栏、右侧六面板、关于弹窗、UI 控件）
│  ├─ core/
│  │  ├─ render/        WebGL2：ImageRenderer、BlitProgram、Pipeline、各 Stage
│  │  ├─ lut/           .cube 解析与 LutManager
│  │  ├─ image/         导入、EXIF、Orientation、降采样
│  │  ├─ metadata/      EXIF 重写与三容器注入
│  │  ├─ export/        Worker 离线程导出
│  │  ├─ history/       参数式撤销栈
│  │  ├─ project/       .lightedit 工程序列化
│  │  ├─ batch/         批量调度
│  │  ├─ plugin/        插件接口 + watermark-engine
│  │  └─ update/        更新检查
│  ├─ stores/           Pinia editor store
│  └─ types/            EditParams 类型契约
├─ scripts/gen-luts.mjs 内置 LUT 生成脚本
└─ test/smoke/          38 项冒烟测试
```

---

## 九、作者

shiraijikuu
- 仓库：https://github.com/shiraijikuu/lumedit
- 哔哩哔哩、抖音见应用内「关于」页与右侧导航栏。
- License：MIT

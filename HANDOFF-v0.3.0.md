# HANDOFF · LumEdit v0.3.0 功能实施

> 交接时间：2026-09-13。README.md 已按 v0.3.0 目标态重写，即本文件的功能清单 = 用户可见验收标准。
> 版本号已升 **0.3.0 / build 5**（package.json 与 `electron/main.ts` 的 `APP_BUILD`），实现时**不要再动版本号**。

## 0. 当前状态与全局约定（务必先读）

- 基线：`main` 分支，typecheck 0 错误、冒烟测试 112/112 通过（`npm run typecheck` / `npm run smoke`）。每个功能完成后都要保持全绿。
- **vite.config.ts 大坑**：主进程构建的 `lib.formats` 会与插件默认 `['es']` 被 mergeConfig 数组拼接成 `['es','cjs']` 双输出。现用 fileName 按格式分流（`main.es.mjs` 副产物已在 electron-builder.yml 排除），preload 靠 `rollupOptions.output.entryFileNames: 'preload.cjs'` 压回。**不要恢复 `main` 的 `rollupOptions.output` 同名输出**，会让 dev 启动 SyntaxError 复发。
- 渲染管线（`src/core/render/editStages.ts` 的 `createEditStageBundle`）：Geometry → Adjust → Curve → HSL → ColorGrade → Effects → LUT。新增 Stage 必须同时进预览与导出（改 bundle 即可自动同步）；中性参数必须直通返回 input（管线靠引用相等跳过纹理归还）。
- 中间纹理：Stage 内一律 `acquireTarget(ctx, w, h)` 获取、失败路径 `releaseTarget` 归还，禁止直接 `createRGBA8Texture` + `deleteTexture`（纹理池会误判所有权）。
- 参数模型：`src/types/EditParams.ts`。新增参数分组必须同步 `defaultEditParams` / `cloneParams` / `ensureParams`（旧工程与旧撤销快照向前兼容），并进工程文件序列化。
- 错误提示一律 `toast('error'|'info'|'success', t('key'))`（`src/stores/toast.ts`），禁止 alert。
- **i18n 纪律**：所有 UI 文案进 `src/i18n/locales/zh-CN.ts` 与 `en.ts`，两个文件 key 必须对齐（冒烟测试 `testI18nParity` 会查）。新增 key 后跑一次 smoke。
- 撤销：任何参数修改走 `mutate(cb)` 或 `saveSnapshot()`（拖动用 scrub 模式），不要手改 `params` 后绕过历史。
- 文件访问授权：渲染层读写磁盘必须走既有授权 IPC（`fs:readBuffer` 只允许会话内授权路径）。新功能需要读文件时，优先新增主进程 handler（在主进程内授权 + 读取 + 返回），不要扩大 `fs:readBuffer` 白名单。
- 临时实验脚本 `scripts/dev-shot.ps1` 可用来启动应用截图验证 UI（依赖本机样例图路径，仅 dev 用）。

## 1. 调色预设（优先级最高）

- **UI**：AdjustPanel（调色面板）顶部新增 `CollapseSection`「预设」：保存按钮（弹出命名，可复用 `window.prompt` 式轻输入或小模态）、预设列表（点击应用、hover 删除）。
- **数据**：`userData/presets.json`，结构 `[{ id, name, createdAt, params: { adjust, curve, hsl, colorGrade, effects, lut } }]`。lut 含 `id/path/strength/isBuiltin`，应用时外部文件缺失则静默置空并 toast 提示。
- **IPC**（electron/main.ts + preload.ts + src/env.d.ts 三处同步）：`presets:list` / `presets:save(name, paramsJson)` / `presets:delete(id)`。主进程直接读写 userData，无需路径授权。
- **store**：`src/stores/presets.ts`（新 Pinia store，仿 `stores/batch.ts` 结构）。应用预设 = `saveSnapshot()` 后逐组替换 params 并 `lutVersion++`、`scheduleWmPreview()`（参照 `selectBuiltin` 的尾部动作）。
- **验收**：保存→重启→应用，参数与 LUT 完整恢复；撤销一步可回到应用前。

## 2. 一键复制到剪贴板

- **IPC**：`clipboard:writeImage(bytes: ArrayBuffer)` → 主进程 `clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(bytes)))`，返回 `{ ok, error? }`。
- **store**：`editor.ts` 新 `copyToClipboard()`：复用 `runExport`（format 固定 `'png'`、keepExif/stripGps 沿用 exportOptions），成功后 `clipboard.writeImage`，toast「已复制」。
- **UI**：ExportPanel 导出按钮旁加 ghost 按钮「复制到剪贴板」；全局快捷键 `Ctrl+Shift+C`（App.vue `onKeydown`）。
- **验收**：修图后按快捷键，微信/画图粘贴即所见即所得（含水印）。

## 3. 白平衡吸管

- **UI**：ToneSection（`src/components/panels/color/ToneSection.vue`）色温滑块行加吸管小按钮；激活后按钮高亮、画布光标变 crosshair；点击画面完成取样并自动退出吸管模式（Esc 也可退出）。
- **取样**：`ImageRenderer` 新 `pickColor(nx, ny): {r,g,b} | null`（nx/ny 为 canvas CSS 归一化坐标）。实现：把 `drawToScreen` 的 contain 映射逆向求出纹理 UV，对 `currentTexture` 挂临时 FBO `readPixels` 5×5 均值，用完 `deleteFramebuffer`。注意 WebGL readPixels 原点在左下，Y 要翻转。
- **算法**：中性灰目标 r=g=b：`temperature = clamp(-(r-b)*2.2, -1, 1)`、`tint = clamp(((r+b)/2 - g)*2.2, -1, 1)`（系数实现时可微调），走 `mutate()` 进撤销栈。
- **验收**：对偏黄照片点白墙，画面明显回中性；撤销可用。

## 4. 剪裁警告

- **直方图统计**：`Histogram.vue` 若已从像素计算直方图，直接顺带输出 `clipHi/clipLo` 百分比并显示（找不到像素来源则用 `ImageRenderer.captureEdited(480)` 低分辨率读回，节流 500ms）。
- **画面叠加**：`ImageRenderer` 新 `renderClipMask(canvas: HTMLCanvasElement, lo=0, hi=1)`：小尺寸（≤480px 宽）把 `currentTexture` 经阈值着色器画到传入 canvas（溢出高光→红、阴影→蓝、其余透明）。EditorCanvas 在叠加层放一个绝对定位 canvas，开关开启时每帧（节流 500ms）刷新，`mix-blend-mode: normal; opacity: .85`。
- **开关**：直方图头部小按钮 + 快捷键 `J`（App.vue），状态进 editor store（不进撤销栈、不进工程）。
- **验收**：过曝天空开启后大片标红；直方图两端显示溢出百分比。

## 5. 前后对比分屏

- **ImageRenderer**：`drawToScreen` 增加 split 模式——先画 `currentTexture` 全幅，再 `gl.enable(gl.SCISSOR_TEST)` 裁左半画 `inputTexture`（原图为 Orientation 校正后的输入），disable。新增 `setSplit(on, x0to1)`。注意 scissor 用物理像素。
- **UI**：TopBar 加「对比」toggle（与现有按住原图 `\` 并存）；开启时 EditorCanvas 画布上画竖直分割线（DOM 元素），可拖动（pointer 事件，把 x 映射 0–1 后 `setSplit`）。
- **验收**：拖动分割线左右实时切换原/修，缩放平移不破裂；导出永远走完整管线不受影响。

## 6. 调整复制 / 粘贴

- **store**：`copyEdits()` 存 `cloneParams(params)` 到 store 内模块级变量（不进 localStorage）；`pasteEdits()` 有图片时 `saveSnapshot()` 后整体替换 geometry/adjust/curve/hsl/colorGrade/effects/lut（watermark 不动），`lutVersion++`。
- **UI**：TopBar「复制调法 / 粘贴调法」两枚 ghost 按钮；快捷键 `Ctrl+Alt+C` / `Ctrl+Alt+V`（App.vue，注意与输入框焦点判断 `typing` 逻辑共存）。
- **验收**：A 图调好 → 打开 B 图粘贴 → 全套参数+LUT 一致；undo 回 B 图原状。

## 7. 渐变 / 径向局部调整（工程量最大，放最后做）

- **参数**：`EditParams.gradation = { enabled: false, type: 'linear' | 'radial', x: .5, y: .5, w: .5, h: .35, rotation: 0, exposure: 0, temperature: 0, tint: 0 }`（linear 用 x/y/w/h 定义的归一化矩形带 softness=h*0.5；radial 用 x/y + w 为半径）。同步 `defaultEditParams/cloneParams/ensureParams`。
- **Stage**：`src/core/render/stages/GradationStage.ts`（放在 ColorGrade 与 Effects 之间）。着色器：mask = smoothstep 线性/径向衰减；`adjusted = applyExposureTempTint(src)`（复用 AdjustStage 的曝光/白平衡公式），`out = mix(src, adjusted, mask * uStrength)`。`enabled=false` 或三参数全 0 时直通返回 input。UV 需考虑 Geometry 之后的坐标系（Stage 收到的 vTexCoord 即当前输出空间，蒙版以当前输出画布为基准即可，与 LR 行为一致）。
- **UI**：`src/components/panels/color/GradationSection.vue`（CollapseSection 放效果之后）：类型切换（线性/径向）、曝光/色温/色调三个 SliderRow；蒙版位置大小先由数值滑块控制（拖拽画布调整可作后续增强，不阻塞验收）。
- **工程文件/撤销/导出**：走通用机制自动生效（进 bundle 即可）。冒烟测试加：中性直通 + 曝光渐变中心/边缘像素差。

## 8. 会话恢复 + 最近打开 + 图片会话条

- **主进程存储**（userData）：`session.json`（`{ imagePath, params }`，renderer 在 loadImageObject / mutate 防抖 2s 后经 `session:save` 写入）、`recent.json`（最多 10 条 `{ path, name, at }`）。
- **IPC**：`session:load()`（返回后主进程对该路径 `fileAccess.grantRead`——它是本应用上次会话写入的，视作用户授权）、`session:save(payload)`、`recent:list()` / `recent:push(path,name)`（去重置顶）。
- **恢复流程**：App.vue `onMounted`（载入用户 LUT 之后）调 `session:load`，有则主进程直接读文件返回 buffer（避免渲染层再过授权），走 `loadImageObject` + 应用 params，toast「已恢复上次会话」；失败静默。
- **最近打开**：`文件` 菜单加「最近打开」submenu（主进程 buildMenu 时读 recent.json，点击发 `menu:action('recent:<index>')`；渲染层 onMenuAction 处理，经新 IPC `image:openPath(index)` 由主进程读图返回 buffer——用户点菜单即授权）。每次成功打开图片 `recent:push`。
- **会话条（胶片条）**：editor store 新 `sessionImages: ref<{ path,name,buffer,thumb }[]>`（打开图片时 push，thumb 用 `decodeForPreview` 的小尺寸 bitmap 转 dataURL，上限 20 张并 toast 提示）。EditorCanvas 底部渲染缩略条（当前图高亮、hover 删除按钮），点击切换 = 复用 `switchTo`（buffer 重解码）。批量的「双击切换」逻辑保留不动。
- **验收**：打开 3 张图能互切且参数各自保留（切换 = 重新解码 + 会话里存各图 params 快照，切回时恢复）；重启后自动回到上次编辑位置。

## 9. EXIF 查看面板

- `imageLoader.ts` 已用 exifr；新 `readFullExif(buffer): Promise<Record<string, unknown>>`（`exifr.parse` 全量 + 常用字段白名单整理：Make/Model/LensModel/FNumber/ExposureTime/ISO/DateTimeOriginal/FocalLength/GPS）。
- **UI**：新 `src/components/ExifModal.vue`（仿 AboutModal 的模态样式），TopBar「信息」按钮打开；StatusBar 文件名旁加 ⓘ 同样可开。
- **验收**：JPG 与 ARW 都能显示（ARW 用内嵌预览的 EXIF，imageLoader 已抽出）。

## 10. 导出快捷尺寸 + 便携版 + 导出 LUT

- **快捷尺寸**：ExportPanel 的 scales 数组旁加「长边 1080 / 2000」两项：点击时按 `store.meta` 尺寸换算 `scale = target / max(w,h)`（钳到 1）。显示实际输出像素。
- **便携版**：electron-builder.yml `win.target` 增加 `{ target: 'portable', arch: [x64] }`，artifactName 用 `${productName}-${version}-portable.${ext}`（target 级 artifactName 覆盖）。`npm run publish` 的 assets 数组补 portable exe（publish.mjs 的 assets 列表）。
- **导出 LUT**：新 `src/core/render/lut/bakeCurrentLut.ts`：构造 512×512 ImageData 编码 17³ 网格（红最快、蓝最慢，行内 r 递增），走 `decodeForPreview` → `runPipeline`（仅 Adjust/curve/hsl/colorGrade Stage，clarity/dehaze 置 0、geometry/effects/lut 剔除）→ readPixels → 还原网格 → 按红色最快序写出 `.cube` 文本（TITLE LumEdit / LUT_3D_SIZE 17 / DOMAIN 0 1）。UI：LutPanel 底部按钮「当前调色导出为 LUT」→ 新 IPC `dialog:saveText(defaultName, filters, text)` 保存。冒烟测试：identity 参数烘焙输出 = identity cube（逐点误差 ≤2/255）。
- **裁剪参考线**：EditorCanvas 裁剪框内叠加 SVG 三分线；GeometryPanel 加小按钮循环 三分→网格→黄金比例→关闭（状态存 store，不进工程）。

## 11. 收尾清单

1. `npm run typecheck` 0 错误；`npm run smoke` 全绿（新增用例：预设序列化、GradationStage 直通/渐变、LUT 烘焙 identity 往返、i18n key 对齐自动覆盖）。
2. UI 冒烟：`npm run dev` 手动过一遍每个新入口（dev-shot.ps1 可截图）。
3. CHANGELOG.md：把「未发布（Unreleased）」段落替换为 `## v0.3.0（日期，build 5）`，分类列出上述功能。
4. release-notes.md 按 v0.3.0 重写（用户口吻，别提内部实现词）；`update.json` 改 `version: 0.3.0, build: 5`，下载地址指向 `releases/download/v0.3.0/`。
5. `npm run dist` 产出 setup + portable；`git tag v0.3.0` 推送；`npm run publish` 发布；API 校验 Release 资产齐全（setup.exe / blockmap / portable.exe / latest.yml）。
6. **版本纪律**：全程 0.3.0 / build 5 不变；如中途需要重打包才递增 build。

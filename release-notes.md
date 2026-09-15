# LumEdit v0.5.0

**Local-first Windows photo editor with RAW support, 3D LUT, WebGL2 professional color grading, masks, watermark studio, and lossless export.**

发布日期：2026-09-15

![LumEdit main interface](https://raw.githubusercontent.com/shiraijikuu/lumedit/main/docs/screenshots/app-main.png?v=20260914b)

![LumEdit loaded image and color grading](https://raw.githubusercontent.com/shiraijikuu/lumedit/main/docs/screenshots/app-loaded.png?v=20260914b)

## 新增
- **多重图片叠加（Blend 图层）**：右侧新增「叠加」面板，可添加最多 8 张 JPG / PNG / WebP / RAW 外部图片作为纹理 / 漏光 / 相框 / 光效图层，支持显示隐藏、复制、排序、删除和重命名
- **10 种混合模式**：正常、正片叠底、滤色、叠加、柔光、强光、差值、排除、颜色减淡、颜色加深；每层可调不透明度、缩放、旋转、位置与翻转
- **LUT 前后合成**：叠加层可放在 LUT 之前参与后续调色，或放在全部输出阶段之后保持图层原色；预览与导出共用同一套 BlendStage
- **RAW 图层**：JPG / PNG / WebP 与 RAW 自动提取内嵌预览均可作为叠加层，工程保存 / 恢复和全分辨率导出同步支持
- **一键自动优化**：本地 GPU 直方图分析 + 规则引擎，自动校正曝光、白平衡、对比度与饱和度；分析目标 < 100ms，结果可一键撤销
- **蒙版系统升级**：多蒙版组合（并集 / 交集 / 差集）、亮度范围、颜色范围、画笔蒙版，支持最多 8 个蒙版协同工作
- **画笔蒙版交互补全**：可直接添加画笔蒙版并在画布上拖动涂抹
- **Log 色轮**：Lift / Gamma / Gain 三组色彩轮，在 Log 光域调整暗部 / 中间调 / 高光
- **自动优化重置开关**：可一键恢复自动优化前的影调参数

## 修复
- 修复工程恢复丢失叠加层、蒙版、Qualifier、Tonemap 等参数：打开工程 / 切换会话统一走完整参数恢复
- 修复旋转 / 拉直透明留白上的叠加层消失：Blend 改为完整 W3C source-over + blend 合成
- 修复损坏叠加图层导致整张导出失败：Worker 逐层捕获解码错误并安全跳过
- 修复 WebGL 上下文恢复后叠加层消失：恢复时重新上传全部图层纹理
- 修复 RAW 叠加图层方向：内嵌 JPEG 缺少 Orientation 时使用 RAW TIFF Orientation 转正
- 修复画笔蒙版输出全黑，以及 uAspect / GL 顶点状态泄漏问题
- 修复局部蒙版工具栏 / 类型选择器文字溢出
- 修复局部蒙版拖拽命中区域，并避免画笔模式残留影响其它蒙版
- 修复矢量示波器目标色标记贴边溢出
- 修复带画笔蒙版时导出 Worker 的 postMessage 克隆失败
- 修复打包版「预设图片水印」不可用，补齐内置品牌与 GIF 预设资源
- 修复 PNG16 导出上下倒置
- 加速导出与复制：取消 8bit 路径的中间 PNG 编解码，PNG16 使用原生 deflate 压缩

## 现有能力
- 裁剪 / 旋转 / 翻转 / 固定比例；RAW（ARW / DNG / NEF / CR2 / CR3 / RAF / ORF / RW2 等）导入
- 半浮点渲染管线、RGB 曲线、8 色相 HSL、颜色分级、示波器、Soft Clip、取色限定器
- 线性 / 径向 / 亮度 / 颜色 / 画笔蒙版，多蒙版组合
- 19 款内置 LUT + 外部 .cube + 我的 LUT 库
- camera-watermark 水印工作室：文字 / 模糊卡片 / 画框 / 图片水印 / 二维码
- JPG / PNG / WebP / 16bit PNG 保真导出，保留 EXIF、默认清除 GPS
- 批量处理、.lightedit 工程文件、撤销/重做、中英双语、检查更新

## 下载与安装
- 安装版：**LumEdit-0.5.0-setup.exe** 双击安装（Windows x64）
- 便携版：**LumEdit-0.5.0-portable.exe** 免安装单文件
- `latest.yml` 与 `.blockmap` 供应用内自动更新使用，无需手动下载。

纯本地处理，照片不上传。

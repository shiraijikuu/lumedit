# LumEdit v0.5.0

**Local-first Windows photo editor with RAW support, 3D LUT, WebGL2 professional color grading, masks, watermark studio, and lossless export.**

发布日期：2026-09-14

![LumEdit main interface](https://raw.githubusercontent.com/shiraijikuu/lumedit/main/docs/screenshots/app-main.png?v=20260914)

![LumEdit loaded image and color grading](https://raw.githubusercontent.com/shiraijikuu/lumedit/main/docs/screenshots/app-loaded.png?v=20260914)

## 新增
- **一键自动优化**：本地 GPU 直方图分析 + 规则引擎，自动校正曝光、白平衡、对比度与饱和度；分析目标 < 100ms，结果可一键撤销
- **蒙版系统升级**：多蒙版组合（并集 / 交集 / 差集）、亮度范围、颜色范围、画笔蒙版，支持最多 8 个蒙版协同工作
- **画笔蒙版交互补全**：可直接添加画笔蒙版并在画布上拖动涂抹
- **Log 色轮**：Lift / Gamma / Gain 三组色彩轮，在 Log 光域调整暗部 / 中间调 / 高光
- **自动优化重置开关**：可一键恢复自动优化前的影调参数

## 修复
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

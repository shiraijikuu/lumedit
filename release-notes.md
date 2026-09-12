# LumEdit v0.2.0（build 4）

发布日期：2026-09-12

## 修复
- 修复 RAW 图片打开「水印工作室」失败的问题。LumEdit 现在直接复用 RAW 的内嵌预览与 EXIF，不再让 camera-watermark 尝试解码 ARW / DNG / NEF 等 RAW 容器。
- 水印工作室增加初始化回退：原图无法被浏览器解码时，仍会使用 LumEdit 调色后的预览正常打开。
- 修复 RAW 竖图导入后显示为横图：RAW 内嵌 JPEG 缺失 Orientation 标签时，会按 RAW TIFF 的 Orientation 正确转正。
- 修复应用水印后离屏预览重建失败：水印状态发送到主进程前会转换为可克隆的普通对象。
- 含 v0.1.1 安全加固：IPC 文件读写授权、外部链接协议白名单、更新来源锁定、LUT 解析防 DoS。

## 当前能力
- 裁剪 / 旋转 / 翻转 / 固定比例
- 曝光、亮度、对比度、高光、阴影、白色、黑色、色温、色调、清晰度、去朦胧、饱和度、自然饱和
- RGB 色调曲线、8 色相 HSL、颜色分级、晕影 / 颗粒 / 锐化 / 降噪
- 19 款内置 LUT + 外部 .cube + 「我的 LUT」库
- camera-watermark 水印工作室：文字 / 模糊卡片 / 画框 / 图片水印 / 二维码
- RAW（ARW / DNG / NEF / CR2 / CR3 / RAF / ORF / RW2 等）内嵌全尺寸预览导入
- JPG / PNG / WebP 全分辨率保真导出，保留 EXIF、默认清除 GPS
- 批量处理、.lightedit 工程文件、撤销/重做、检查更新

## 下载与安装
下载 **LumEdit-0.2.0-setup.exe** 双击安装（Windows x64）。
`latest.yml` 与 `.blockmap` 供应用内自动更新使用，无需手动下载。

纯本地处理，照片不上传。

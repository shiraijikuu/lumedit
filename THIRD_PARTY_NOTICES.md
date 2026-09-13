# 第三方致谢与许可证声明（THIRD PARTY NOTICES）

LumEdit 本身以 MIT 许可证发布（见 LICENSE，Copyright © 2026 shiraijikuu）。
本文件列出项目在算法与工程上参考、以及运行所依赖的第三方成果。

## 算法参考（未拷贝代码，仅借鉴原理 / 公式）

### OpenColorIO — 3D LUT 四面体插值
- 网站：https://opencolorio.org
- 许可证：BSD 3-Clause，Copyright (c) Contributors to the OpenColorIO Project
- 用途：`LutStage` 的 3D LUT 采样采用四面体（tetrahedral）插值思路，替代三线性以获得更精确的色彩过渡。代码为独立实现，未复制 OpenColorIO 源码。

BSD 3-Clause 全文：https://opensource.org/license/bsd-3-clause

### three.js — sRGB 传递函数
- 网站：https://threejs.org
- 许可证：MIT，Copyright © 2010-2024 three.js authors
- 用途：`colorSpace.glsl.ts` 中的 sRGB ↔ linear 传递函数分段公式参考 three.js 的颜色空间实现，为 WebGL 着色器内独立编写。

### DaVinci Resolve / darktable / Kdenlive — 产品语义参考
- 仅参考示波器布局、取色限定器、Soft Clip 等专业调色功能的**交互与数学语义**，未复制任何代码。
- darktable（GPL-3.0）、Kdenlive（GPL）代码均未引入，LumEdit 不构成其衍生作品。

## 独立实现

- **16-bit PNG 编码器（`src/core/export/png16.ts`）**：零第三方依赖，手写 PNG 分块、CRC32、Adler32 与 zlib stored（不压缩）块，不使用任何图像编码库。

## 运行依赖（npm，许可证随各仓库）

| 依赖 | 用途 | 许可证 |
| --- | --- | --- |
| vue | 前端框架 | MIT |
| pinia | 状态管理 | MIT |
| exifr | EXIF / 元数据解析 | MIT |
| electron | 桌面壳 | MIT |
| electron-updater | 自动更新 | MIT |
| electron-builder | 打包（devDependency） | MIT |
| vite / @vitejs/plugin-vue / vite-plugin-electron(-renderer) | 构建链 | MIT |
| typescript / vue-tsc | 类型系统 | Apache-2.0 |
| esbuild | 冒烟测试打包 | MIT |

## 姊妹项目

水印能力整体复用作者的另一个项目 **camera-watermark**（批量相机水印工具）：
- 仓库：https://github.com/shiraijikuu/camera-watermark
- 主页：https://itangxs.top/camera-watermark
- LumEdit 不重写水印功能，而是直接加载其编辑器页面与渲染内核。

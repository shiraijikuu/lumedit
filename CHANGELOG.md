# 更新日志（CHANGELOG）

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

# Sticker Canvas

[English](./README.md)

Sticker Canvas 是一个本地优先的轻量创作画布：把照片做成贴纸，再用文字和基础图形自由排版。

## 功能

- 上传图片或直接拍照。
- 添加可编辑文字，拖拽绘制矩形、椭圆、三角形、菱形和直线。
- 在无限画布中移动、缩放、旋转和调整元素层级。
- 需要时在浏览器本地抠图。
- 添加贴纸描边和轻量油膜 / 镭射效果。
- 下载当前画布 PNG，包含米白点阵纸张背景、图片、文字、图形和位置关系。
- 界面会根据窗口尺寸自适应：桌面端使用顶部工具栏，手机端使用底部工具栏；横屏手机的 Inspector 会切换为侧边面板。
- 所有内容保存在当前浏览器，不需要账号，也不会上传到业务服务器。

## 快速开始

本项目使用 pnpm 12.2.1。如果 Windows 尚未安装 pnpm，请使用官方 standalone 安装脚本（不需要 Corepack）：

```powershell
$env:PNPM_VERSION="12.2.1"
Invoke-WebRequest https://get.pnpm.io/install.ps1 -UseBasicParsing | Invoke-Expression
```

```bash
pnpm install --frozen-lockfile
pnpm run dev
```

按 Vite 提示打开本地地址，通常是 `http://localhost:5173`。

## 使用方式

- 使用桌面端顶部（移动端底部）工具栏上传、拍照、添加文字或绘制图形；左上角菜单提供历史记录、新建画布和下载。
- 使用右下角控件缩放或适配全部内容。
- 双击文字进入编辑；点击文字框外部即可完成输入。
- 选中图片后，右侧紧凑 Inspector 的图标开关可控制 Holo、去背景、圆角、阴影以及保存/删除；滑杆可调整描边、圆角大小、阴影柔和度和图片尺寸。文本与图形继续使用元素工具栏。
- 下载会保留当前排版和米白点阵背景。

## 快捷键

| 按键 | 功能 |
| --- | --- |
| `V` | 选择工具 |
| `T` | 文字工具 |
| `R` / `O` | 矩形 / 椭圆 |
| `G` / `D` / `L` | 三角形 / 菱形 / 直线 |
| `Delete` / `Backspace` | 删除选中元素 |
| `Ctrl/Cmd + Z` | 撤销 |
| `Ctrl/Cmd + Shift + Z` | 重做 |

## 本地开发

| 命令 | 说明 |
| --- | --- |
| `pnpm run dev` | 启动开发服务器 |
| `pnpm run typecheck` | TypeScript 检查 |
| `pnpm run lint` | ESLint 检查 |
| `pnpm test` | 构建并运行测试 |
| `pnpm run build` | 生成生产构建 |

## 隐私

图片、画布元素和视口偏好保存在当前浏览器的 IndexedDB 与 localStorage 中。抠图在浏览器本地运行；清除网站数据会删除已保存的作品。

## 说明

- 相机功能需要 HTTPS 或 `localhost`。
- 下载图中的油膜 / 镭射是静态状态；鼠标跟随高光仅用于页面预览。

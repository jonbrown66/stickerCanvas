# Sticker Canvas

[中文说明](./README.zh-CN.md)

Sticker Canvas is a local-first creative canvas for turning photos into stickers, then arranging them with text and simple shapes.

## Features

- Upload photos or capture them with the camera.
- Add editable text and draw rectangles, ellipses, triangles, diamonds, and lines.
- Move, resize, rotate, and layer every element on an infinite canvas.
- Remove photo backgrounds on demand in the browser.
- Add sticker outlines and a subtle Holo / oil-film effect.
- Export the current canvas as a PNG with its paper-dot background, images, text, shapes, and layout.
- The chrome adapts to the viewport: desktop uses a top toolbar, mobile uses a bottom toolbar, and landscape phones move the Inspector to the side.
- Save everything locally in the browser. No account or server upload is required.

## Quick Start

This project uses pnpm 12.2.1. If pnpm is not installed on Windows, use the official standalone installer:

```powershell
$env:PNPM_VERSION="12.2.1"
Invoke-WebRequest https://get.pnpm.io/install.ps1 -UseBasicParsing | Invoke-Expression
```

```bash
pnpm install --frozen-lockfile
pnpm run dev
```

Open the local URL shown by Vite, usually `http://localhost:5173`.

## Usage

- Use the desktop top toolbar (mobile bottom toolbar) to upload, open the camera, add text, or draw shapes; the top-left menu contains history, new canvas, and download.
- Use the bottom-right controls to zoom or fit all content.
- Double-click text to edit it. Click outside the text box to finish editing.
- Select an image to open the compact right-side Inspector. Its icon toggles control Holo, background removal, rounded corners, shadow, and PNG save/delete; the sliders adjust outline, corner radius, shadow softness, and image size. Text and shapes keep their contextual element toolbar.
- Download exports the current composition with the cream paper-dot background.

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `V` | Select tool |
| `T` | Text tool |
| `R` / `O` | Rectangle / ellipse |
| `G` / `D` / `L` | Triangle / diamond / line |
| `Delete` / `Backspace` | Delete selected item |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |

## Local Development

| Command | Description |
| --- | --- |
| `pnpm run dev` | Start the development server |
| `pnpm run typecheck` | Run TypeScript checks |
| `pnpm run lint` | Run ESLint |
| `pnpm test` | Build and run tests |
| `pnpm run build` | Create a production build |

## Privacy

Photos, canvas elements, and viewport preferences are stored in IndexedDB and localStorage in the current browser. Background removal runs locally with bundled browser resources. Clearing site data removes saved work.

## Notes

- Camera access requires HTTPS or `localhost`.
- The exported Holo effect is a static image state; pointer-following motion is preview-only.

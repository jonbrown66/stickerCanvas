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
- Save everything locally in the browser. No account or server upload is required.

## Quick Start

```bash
npm ci
npm run dev
```

Open the local URL shown by Vite, usually `http://localhost:5173`.

## Usage

- Use the bottom toolbar to upload, open the camera, add text, draw shapes, or download the canvas.
- Double-click text to edit it. Click outside the text box to finish editing.
- Select an item to move, resize, rotate, delete, or adjust its appearance.
- Select a photo and use the scissors action when you want to remove its background.
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
| `npm run dev` | Start the development server |
| `npm run typecheck` | Run TypeScript checks |
| `npm run lint` | Run ESLint |
| `npm test` | Build and run tests |
| `npm run build` | Create a production build |

## Privacy

Photos, canvas elements, and viewport preferences are stored in IndexedDB and localStorage in the current browser. Background removal runs locally with bundled browser resources. Clearing site data removes saved work.

## Notes

- Camera access requires HTTPS or `localhost`.
- The exported Holo effect is a static image state; pointer-following motion is preview-only.

import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

function mockCanvas(t, { failDecode = false, failEncode = false } = {}) {
  const canvases = [];
  const urls = new Set();
  const original = { document: globalThis.document, Image: globalThis.Image, ImageData: globalThis.ImageData };
  t.mock.method(URL, "createObjectURL", () => {
    const url = `blob:export-test-${urls.size}`;
    urls.add(url);
    return url;
  });
  t.mock.method(URL, "revokeObjectURL", (url) => urls.delete(url));
  class Context {
    globalAlpha = 1;
    globalCompositeOperation = "source-over";
    filter = "none";
    calls = [];
    stack = [];
    save() {
      this.stack.push({ globalAlpha: this.globalAlpha, globalCompositeOperation: this.globalCompositeOperation, filter: this.filter });
    }
    restore() { Object.assign(this, this.stack.pop()); }
    drawImage(...args) { this.calls.push({ op: "drawImage", args, alpha: this.globalAlpha, filter: this.filter }); }
    clip() { this.calls.push({ op: "clip" }); }
    arcTo(...args) { this.calls.push({ op: "arcTo", args }); }
    fillRect(...args) { this.calls.push({ op: "fillRect", args, alpha: this.globalAlpha, composite: this.globalCompositeOperation }); }
    fill() { this.calls.push({ op: "fill", alpha: this.globalAlpha }); }
    putImageData() { this.calls.push({ op: "putImageData" }); }
    getImageData(x, y, width, height) { return { data: new Uint8ClampedArray(width * height * 4).fill(255) }; }
    createLinearGradient() { this.calls.push({ op: "gradient" }); return { addColorStop() {} }; }
    createRadialGradient() { this.calls.push({ op: "gradient" }); return { addColorStop() {} }; }
    beginPath() {}
    moveTo() {}
    lineTo() {}
    closePath() {}
    rect() {}
    arc() {}
    stroke() {}
    translate() {}
    rotate() {}
    scale() {}
  }
  globalThis.Image = class {
    naturalWidth = 200;
    naturalHeight = 100;
    decode() { return failDecode ? Promise.reject(new Error("decode failed")) : Promise.resolve(); }
  };
  globalThis.ImageData = class { constructor(data, width, height) { Object.assign(this, { data, width, height }); } };
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, "canvas");
      const context = new Context();
      const canvas = { width: 0, height: 0, context, getContext: () => context,
        toBlob(callback) { callback(failEncode ? null : new Blob(["png"], { type: "image/png" })); } };
      canvases.push(canvas);
      return canvas;
    },
  };
  t.after(() => Object.assign(globalThis, original));
  return { canvases, urls, calls: () => canvases.flatMap((canvas) => canvas.context.calls) };
}

const baseImage = {
  id: "image", type: "image", image: new Blob(["fixture"]), width: 100, height: 100,
  x: 0, y: 0, rotation: 0, zIndex: 1, createdAt: 1, outlineWidth: 0,
  shadowEnabled: false, cornerRadiusEnabled: false,
};
const transparent = { style: "transparent", color: "#ffffff" };

test("canvas export crops the source, clips corners and applies element opacity once", async (t) => {
  const mock = mockCanvas(t);
  const { exportCanvasToPng } = await loadTypeScript("lib/canvas-export.ts");
  await exportCanvasToPng([{ ...baseImage, opacity: 0.25,
    crop: { x: 0.5, y: 0, width: 0.5, height: 1 }, cornerRadiusEnabled: true, cornerRadius: 12 }], transparent);
  const sourceDraw = mock.calls().find((call) => call.op === "drawImage" && call.args[0] instanceof Image);
  assert.deepEqual(sourceDraw.args.slice(1, 5), [100, 0, 100, 100]);
  assert.equal(sourceDraw.alpha, 1);
  assert.ok(mock.calls().some((call) => call.op === "clip"));
  assert.ok(mock.calls().some((call) => call.op === "arcTo" && call.args.at(-1) === 24));
  assert.equal(mock.canvases[0].context.calls.find((call) => call.op === "drawImage").alpha, 0.25);
  assert.ok(mock.canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
  assert.equal(mock.urls.size, 0);
});

test("Holo renders without an outline and shadow survives an outlined image", async (t) => {
  const mock = mockCanvas(t);
  const { exportCanvasToPng } = await loadTypeScript("lib/canvas-export.ts");
  await exportCanvasToPng([{ ...baseImage, oilFilmEnabled: true }], transparent);
  assert.ok(mock.calls().some((call) => call.op === "gradient"));
  const before = mock.canvases.length;
  await exportCanvasToPng([{ ...baseImage, outlineWidth: 2, shadowEnabled: true, shadowBlur: 8 }], transparent);
  const calls = mock.canvases.slice(before).flatMap((canvas) => canvas.context.calls);
  assert.ok(calls.some((call) => call.op === "putImageData"));
  const shadow = calls.find((call) => call.op === "drawImage" && call.filter.startsWith("drop-shadow("));
  assert.ok(shadow);
  assert.ok(shadow.args[0].context.calls.some((call) => call.op === "putImageData"));
});

test("transparent elements are omitted and shape fill/stroke use group opacity", async (t) => {
  const mock = mockCanvas(t);
  const { exportCanvasToPng } = await loadTypeScript("lib/canvas-export.ts");
  const shape = { id: "shape", type: "shape", shape: "rectangle", fillEnabled: true,
    fillColor: "#ff0000", strokeColor: "#000000", strokeWidth: 2, width: 40, height: 40,
    x: 0, y: 0, zIndex: 1, rotation: 0, createdAt: 1 };
  await exportCanvasToPng([{ ...baseImage, opacity: 0 }, { ...shape, opacity: 0 }], transparent);
  assert.equal(mock.calls().filter((call) => call.op === "drawImage" || call.op === "fill").length, 0);
  await exportCanvasToPng([{ ...shape, opacity: 0.5 }], transparent);
  assert.equal(mock.calls().find((call) => call.op === "fill").alpha, 1);
  assert.equal(mock.calls().find((call) => call.op === "drawImage").alpha, 0.5);
});

test("single-sticker PNG uses the same renderer and releases canvases on encoding failure", async (t) => {
  const mock = mockCanvas(t, { failEncode: true });
  const { exportStickerWithOutline } = await loadTypeScript("lib/sticker-image-processing.ts");
  await assert.rejects(exportStickerWithOutline(baseImage.image, 100, 0, "#fff", {
    ...baseImage, crop: { x: 0.5, y: 0, width: 0.5, height: 1 }, opacity: 0.5,
  }), /Sticker failed/);
  assert.deepEqual(mock.calls().find((call) => call.op === "drawImage").args.slice(1, 5), [100, 0, 100, 100]);
  assert.ok(mock.calls().some((call) => call.op === "fillRect" && call.alpha === 0.5 && call.composite === "destination-in"));
  assert.ok(mock.canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
  assert.equal(mock.urls.size, 0);
});

test("canvas export releases its output and image URL on decode failure", async (t) => {
  const mock = mockCanvas(t, { failDecode: true });
  const { exportCanvasToPng } = await loadTypeScript("lib/canvas-export.ts");
  await assert.rejects(exportCanvasToPng([baseImage], transparent), /decode failed/);
  assert.equal(mock.urls.size, 0);
  assert.ok(mock.canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
});

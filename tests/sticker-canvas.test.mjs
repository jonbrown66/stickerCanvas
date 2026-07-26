import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps canvas concerns split into focused modules", async () => {
  const [canvas, camera, item, storage, processing, styles, html] =
    await Promise.all([
      readFile(
        new URL("../app/SimpleStickerCanvas.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/CameraCapture.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/StickerCanvasItem.tsx", import.meta.url), "utf8"),
      readFile(new URL("../lib/sticker-storage.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../lib/sticker-image-processing.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../index.html", import.meta.url), "utf8"),
    ]);

  assert.match(canvas, /<CameraCapture/);
  assert.match(canvas, /<StickerCanvasItem/);
  assert.match(canvas, /saveStickerRecord\(sticker\)/);
  assert.match(canvas, /capture="environment"/);
  assert.match(camera, /getUserMedia/);
  assert.match(camera, /maximumSide = 2048/);
  assert.match(item, /memo\(StickerCanvasItemComponent\)/);
  assert.match(item, /onDownload=\{\(\) => onDownload\(sticker\)\}/);
  assert.match(storage, /indexedDB\.open/);
  assert.match(storage, /transactionDone/);
  assert.match(storage, /replaceStickerRecords/);
  assert.match(storage, /store\.clear\(\)/);
  assert.match(processing, /findAlphaBounds/);
  assert.match(processing, /fullCanvas\.width = 1/);
  assert.match(processing, /globalCompositeOperation = "source-in"/);
  assert.match(processing, /ensurePngBlob/);
  assert.doesNotMatch(processing, /shadowBlur/);
  assert.match(canvas, /restoreStickerSnapshot/);
  assert.match(canvas, /replaceStickerRecords/);
  assert.match(canvas, /processingRef\.current = true/);
  assert.match(styles, /\.simple-sticker-canvas/);
  assert.doesNotMatch(styles, /\.gallery-|\.export-|\.controls-card/);
  assert.doesNotMatch(html, /vibeloft|DebugPanel|MobileDemoMode/);
});

test("alpha-bound implementation rejects an empty mask and tracks visible edges", async () => {
  const source = await readFile(
    new URL("../lib/sticker-image-processing.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /return right < left \|\| bottom < top/);
  assert.match(source, /\{ left, top, right, bottom \}/);
  assert.match(source, /alphaThreshold = 10/);
});

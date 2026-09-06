import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadHistoryModule() {
  const source = await readFile(
    new URL("../lib/canvas-history.ts", import.meta.url),
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
  );
}

function sticker(id, image = new Blob([id], { type: "image/png" })) {
  return {
    id,
    image,
    url: URL.createObjectURL(image),
    width: 100,
    height: 100,
    x: 0,
    y: 0,
    rotation: 0,
    zIndex: 1,
    createdAt: 1,
  };
}

test("history branches after undo and records logical snapshots", async () => {
  const historyModule = await loadHistoryModule();
  const first = sticker("first");
  const second = sticker("second");
  let history = historyModule.createStickerHistory([first]);
  history = historyModule.appendStickerHistory(history, [first, second]);

  const undo = historyModule.moveStickerHistory(history, -1);
  assert.ok(undo);
  assert.deepEqual(undo.snapshot.map((item) => item.id), ["first"]);

  const branched = historyModule.appendStickerHistory(undo.history, []);
  assert.equal(branched.entries.length, 2);
  assert.deepEqual(branched.entries[1], []);
  assert.equal(historyModule.moveStickerHistory(branched, 1), null);

  URL.revokeObjectURL(first.url);
  URL.revokeObjectURL(second.url);
});

test("identical snapshots are ignored without discarding redo history", async () => {
  const historyModule = await loadHistoryModule();
  const first = sticker("first");
  const second = sticker("second");
  let history = historyModule.createCanvasHistory([first]);
  history = historyModule.appendCanvasHistory(history, [first, second]);

  const undo = historyModule.moveCanvasHistory(history, -1);
  assert.ok(undo);
  const unchanged = historyModule.appendCanvasHistory(undo.history, [first]);
  assert.equal(unchanged, undo.history);
  assert.ok(historyModule.moveCanvasHistory(unchanged, 1));

  URL.revokeObjectURL(first.url);
  URL.revokeObjectURL(second.url);
});

test("history comparison preserves Blob identity and compares crop values", async () => {
  const historyModule = await loadHistoryModule();
  const original = sticker("image", new Blob(["same"], { type: "image/png" }));
  const equalClone = { ...original, crop: { x: 0, y: 0, width: 1, height: 1 } };
  let history = historyModule.createCanvasHistory([equalClone]);

  history = historyModule.appendCanvasHistory(history, [
    { ...equalClone, crop: { x: 0.1, y: 0, width: 0.9, height: 1 } },
  ]);
  assert.equal(history.entries.length, 2);

  const distinctBlob = new Blob(["same"], { type: "image/png" });
  history = historyModule.appendCanvasHistory(history, [
    { ...equalClone, image: distinctBlob, crop: { x: 0.1, y: 0, width: 0.9, height: 1 } },
  ]);
  assert.equal(history.entries.length, 3);

  URL.revokeObjectURL(original.url);
});

test("history keeps the most recent thirty distinct snapshots", async () => {
  const historyModule = await loadHistoryModule();
  const item = sticker("limited");
  let history = historyModule.createCanvasHistory([item]);
  for (let x = 1; x <= 31; x += 1) {
    history = historyModule.appendCanvasHistory(history, [{ ...item, x }]);
  }

  assert.equal(history.entries.length, 30);
  assert.equal(history.index, 29);
  assert.equal(history.entries[0][0].x, 2);

  URL.revokeObjectURL(item.url);
});

test("restoring a deleted sticker creates a fresh readable Blob URL", async () => {
  const historyModule = await loadHistoryModule();
  const original = sticker("recoverable");
  const snapshot = historyModule.snapshotStickers([original]);
  URL.revokeObjectURL(original.url);

  const restored = historyModule.restoreStickerSnapshot(snapshot, []);
  assert.equal(restored.stickers.length, 1);
  assert.notEqual(restored.stickers[0].url, original.url);
  assert.equal(
    (await fetch(restored.stickers[0].url).then((response) => response.blob()))
      .size,
    original.image.size,
  );

  URL.revokeObjectURL(restored.stickers[0].url);
});

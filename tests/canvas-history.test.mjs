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

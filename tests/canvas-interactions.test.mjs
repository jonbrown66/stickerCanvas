import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

const source = await readFile(new URL("../app/SimpleStickerCanvas.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("canvas.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callback(name, context) {
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) {
      expression = node.initializer.arguments[0].getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(expression, `Real component callback ${name} must exist`);
  const output = ts.transpileModule(`var callback = ${expression}; callback;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return vm.runInNewContext(output, context);
}

test("the actual pointer handlers preserve both touches in one frame without a React event", async () => {
  const { getPinchView } = await loadTypeScript("lib/canvas-viewport.ts");
  const frames = [];
  const context = {
    getPinchView, MIN_ZOOM: 0.08, MAX_ZOOM: 6,
    touchPointsRef: { current: new Map([[1, { x: 100, y: 100 }], [2, { x: 300, y: 100 }]]) },
    pinchRef: { current: { ids: [1, 2], distance: 200, view: { zoom: 1 }, anchorX: 0, anchorY: 0 } },
    panRef: { current: null },
    viewportRef: { current: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 200 }) } },
    viewRef: { current: { x: 0, y: 0, zoom: 1 } },
    worldRef: { current: {} }, gridRef: { current: {} },
    rafRef: { current: null }, pointerSampleRef: { current: null },
    shapeDrawingRef: { current: null }, gestureRef: { current: null },
    applyViewTransform() {}, requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
  };
  context.moveViewportPointer = callback("moveViewportPointer", context);
  const move = callback("moveGlobalPointer", context);
  move({ pointerId: 1, clientX: 80, clientY: 100 });
  move({ pointerId: 2, clientX: 320, clientY: 100 });
  assert.equal(frames.length, 1);
  frames[0]();
  assert.equal(context.viewRef.current.zoom, 1.2);
  assert.equal(context.viewRef.current.x, 0);
  assert.equal(context.viewRef.current.y, 0);
});

function cutoutContext(scope, sticker) {
  let finishRemoval;
  const writes = [];
  const notices = [];
  const context = {
    processingRef: { current: false }, projectTransitionRef: { current: false },
    activeCanvasIdRef: { current: "canvas-a" },
    cutoutTasksRef: { current: scope }, cutoutOperationRef: { current: null },
    pendingCutoutRef: { current: null }, stickersRef: { current: [sticker] },
    setDissolveEffect() {}, setProcessingStickerId() {}, setNotice(value) { notices.push(value); },
    removeImageBackground: () => new Promise((resolve) => { finishRemoval = resolve; }),
    createOutlinedCutout: async () => ({ blob: new Blob(["cutout"]), width: 10, height: 10 }),
    createBackgroundDissolveTexture: async () => null, preloadBackgroundDissolveEffect: async () => {},
    preloadImageUrl: async () => {},
    saveStickerRecord: async (record, isCurrent) => { if (isCurrent()) writes.push(record); },
    replaceStickers(update) { context.stickersRef.current = update(context.stickersRef.current); },
    viewportRef: { current: null }, viewRef: { current: { x: 0, y: 0, zoom: 1 } },
    URL, console,
  };
  return { context, writes, notices, finish: () => finishRemoval({ pixels: new Uint8ClampedArray(4), width: 1, height: 1 }) };
}

test("the actual cutout callback discards an old canvas result and cannot unlock a newer import", async () => {
  const { createCanvasTaskScope } = await loadTypeScript("lib/canvas-task.ts");
  const scope = createCanvasTaskScope();
  const sticker = { id: "sample", type: "image", image: new Blob(["source"]), width: 100 };
  const run = cutoutContext(scope, sticker);
  const promise = callback("cutoutSticker", run.context)(sticker);
  scope.cancel();
  run.context.activeCanvasIdRef.current = "canvas-b";
  run.context.stickersRef.current = [{ ...sticker }];
  run.context.cutoutOperationRef.current = null;
  run.context.processingRef.current = true;
  run.finish();
  await promise;
  assert.equal(run.writes.length, 0);
  assert.equal(run.notices.length, 0);
  assert.equal(run.context.processingRef.current, true);
  assert.equal(run.context.stickersRef.current[0].image, sticker.image);
});

test("the actual cutout callback preserves a changed element revision", async () => {
  const { createCanvasTaskScope } = await loadTypeScript("lib/canvas-task.ts");
  const sticker = { id: "image", type: "image", image: new Blob(["source"]), width: 100 };
  const run = cutoutContext(createCanvasTaskScope(), sticker);
  const promise = callback("cutoutSticker", run.context)(sticker);
  const latest = { ...sticker, x: 80 };
  run.context.stickersRef.current = [latest];
  run.finish();
  await promise;
  assert.equal(run.writes.length, 0);
  assert.equal(run.context.stickersRef.current[0], latest);
});

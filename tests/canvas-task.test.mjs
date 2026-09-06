import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

test("canvas task scope invalidates work after switching away and back to a canvas", async () => {
  const { createCanvasTaskScope } = await loadTypeScript("lib/canvas-task.ts");
  const scope = createCanvasTaskScope();
  const first = { id: "element-a" };
  const taskOnFirstVisit = scope.start("canvas-a", first);
  const taskOnOtherCanvas = scope.start("canvas-b", { id: "element-b" });
  const taskOnReturn = scope.start("canvas-a", { id: "element-c" });

  assert.equal(taskOnFirstVisit.signal.aborted, true);
  assert.equal(taskOnOtherCanvas.signal.aborted, true);
  assert.equal(scope.isCurrent(taskOnFirstVisit, "canvas-a", [first]), false);
  assert.equal(
    scope.isCurrent(taskOnReturn, "canvas-a", [taskOnReturn.source]),
    true,
  );
});

test("canvas task scope requires the current element reference and cancels deleted elements", async () => {
  const { createCanvasTaskScope } = await loadTypeScript("lib/canvas-task.ts");
  const scope = createCanvasTaskScope();
  const source = { id: "element-a" };
  const task = scope.start("canvas-a", source);

  assert.equal(scope.isCurrent(task, "canvas-a", [{ id: "element-a" }]), false);
  assert.equal(scope.isCurrent(task, "canvas-a", []), false);
  assert.equal(scope.cancel("other-element"), false);
  assert.equal(scope.cancel("element-a"), true);
  assert.equal(task.signal.aborted, true);
});

test("finishing an old task cannot clear a newer task", async () => {
  const { createCanvasTaskScope } = await loadTypeScript("lib/canvas-task.ts");
  const scope = createCanvasTaskScope();
  const first = scope.start("canvas-a", { id: "first" });
  const second = scope.start("canvas-a", { id: "second" });

  assert.equal(scope.finish(first), false);
  assert.equal(scope.isCurrent(second, "canvas-a", [second.source]), true);
  assert.equal(scope.finish(second), true);
  assert.equal(scope.isCurrent(second, "canvas-a", [second.source]), false);
});

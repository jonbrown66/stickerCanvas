import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadStyleCommitModule() {
  const source = await readFile(
    new URL("../lib/style-commit.ts", import.meta.url),
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

test("style commit boundary commits one preview once despite duplicate endings", async () => {
  const { createStyleCommitBoundary } = await loadStyleCommitModule();
  const boundary = createStyleCommitBoundary();
  const calls = [];
  boundary.preview("first", 42, (value) => calls.push(["preview", value]));
  assert.equal(boundary.commit("first", (value) => calls.push(["commit", value])), true);
  assert.equal(boundary.commit("first", (value) => calls.push(["commit", value])), false);
  assert.deepEqual(calls, [["preview", 42], ["commit", 42]]);
});

test("style commit boundary drops a pending preview when the selected element changes", async () => {
  const { createStyleCommitBoundary } = await loadStyleCommitModule();
  const boundary = createStyleCommitBoundary();
  boundary.preview("first", 42, () => {});
  boundary.syncScope("second");
  assert.equal(boundary.commit("second", () => assert.fail("must not commit the previous element")), false);
});

test("style commit boundary keeps a preview started by a commit callback", async () => {
  const { createStyleCommitBoundary } = await loadStyleCommitModule();
  const boundary = createStyleCommitBoundary();
  const committed = [];
  boundary.preview("first", 42, () => {});
  boundary.commit("first", () => {
    boundary.preview("first", 43, () => {});
  });

  assert.equal(boundary.commit("first", (value) => committed.push(value)), true);
  assert.deepEqual(committed, [43]);
});

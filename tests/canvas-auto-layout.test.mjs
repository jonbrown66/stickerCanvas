import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadAutoLayoutModule() {
  const source = await readFile(
    new URL("../lib/canvas-auto-layout.ts", import.meta.url),
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

test("auto layout keeps each material size and produces an editorial collage", async () => {
  const { getAutoLayoutResult } = await loadAutoLayoutModule();
  const items = [
    { id: "portrait-left", kind: "image", width: 140, height: 220, rotation: 0 },
    { id: "headline", kind: "text", width: 180, height: 60, rotation: 0 },
    { id: "portrait-right", kind: "image", width: 130, height: 210, rotation: 4 },
    { id: "illustration", kind: "image", width: 72, height: 78, rotation: 0 },
    { id: "landscape", kind: "image", width: 260, height: 118, rotation: 0 },
    { id: "caption", kind: "text", width: 150, height: 48, rotation: 0 },
  ];
  const layout = getAutoLayoutResult(items);
  assert.equal(layout.positions.length, items.length);
  assert.ok(layout.width / layout.height > 0.9 && layout.width / layout.height < 1.8);
  layout.positions.forEach((position) => assert.equal(position.scale, 1));
  const area = items.reduce((sum, item) => sum + item.width * item.height, 0);
  assert.ok(area / (layout.width * layout.height) > 0.65, "avoid excessive empty space");
  verifySeparation(items, layout);
  assert.deepEqual(getAutoLayoutResult(items), layout, "repeat clicks stay stable");
});

test("auto layout keeps item identities and separates rotated visual bounds", async () => {
  const { getAutoLayoutPositions } = await loadAutoLayoutModule();
  const positions = getAutoLayoutPositions([
    { id: "rotated", kind: "image", width: 100, height: 40, rotation: 45 },
    { id: "plain", kind: "image", width: 100, height: 40, rotation: 0 },
  ]);

  assert.deepEqual(positions.map((position) => position.id), ["rotated", "plain"]);
  assert.notEqual(`${positions[0].x}:${positions[0].y}`, `${positions[1].x}:${positions[1].y}`);
  positions.forEach((position) => assert.equal(position.scale, 1));
});

function verifySeparation(items, layout) {
  const bounds = layout.positions.map((p) => {
    const item = items.find((item) => item.id === p.id);
    const angle = item.rotation * Math.PI / 180;
    return {
      ...p,
      w: (Math.abs(Math.cos(angle)) * item.width + Math.abs(Math.sin(angle)) * item.height) * p.scale,
      h: (Math.abs(Math.sin(angle)) * item.width + Math.abs(Math.cos(angle)) * item.height) * p.scale,
    };
  });
  for (let i = 0; i < bounds.length; i++) {
    const a = bounds[i];
    assert.ok(Math.abs(a.x) + a.w / 2 <= layout.width / 2 + 0.001);
    assert.ok(Math.abs(a.y) + a.h / 2 <= layout.height / 2 + 0.001);
    for (const b of bounds.slice(i + 1)) {
      const dx = Math.abs(a.x - b.x) - (a.w + b.w) / 2;
      const dy = Math.abs(a.y - b.y) - (a.h + b.h) / 2;
      assert.ok(Math.max(dx, dy) >= 11.999, a.id + " overlaps " + b.id);
    }
  }
}

test("mixed sizes, rotations and large canvases remain separated and bounded", async () => {
  const { getAutoLayoutResult } = await loadAutoLayoutModule();
  for (const count of [0, 1, 2, 8, 13, 30]) {
    const items = Array.from({ length: count }, (_, i) => ({
      id: String(i), kind: i % 3 ? "image" : "text",
      width: 50 + (i * 97) % 360, height: 40 + (i * 61) % 280,
      rotation: (i * 13) % 90,
    }));
    const layout = getAutoLayoutResult(items);
    assert.equal(new Set(layout.positions.map((p) => p.id)).size, count);
    verifySeparation(items, layout);
    layout.positions.forEach((p) => assert.equal(p.scale, 1));
  }
});

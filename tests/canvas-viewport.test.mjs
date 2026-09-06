import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

const bounds = { left: 0, top: 0, width: 200, height: 200 };
const pinch = {
  ids: [1, 2],
  distance: 100,
  view: { x: 10, y: 20, zoom: 1 },
  anchorX: 10,
  anchorY: 20,
};

test("pinch accepts plain pointer samples and keeps the midpoint anchor", async () => {
  const { getPinchView } = await loadTypeScript("lib/canvas-viewport.ts");
  const first = { pointerId: 1, clientX: 50, clientY: 100 };
  const second = { pointerId: 2, clientX: 150, clientY: 100 };
  const view = getPinchView(
    pinch,
    { x: first.clientX, y: first.clientY },
    { x: second.clientX, y: second.clientY },
    bounds,
    0.5,
    3,
  );

  assert.deepEqual(view, { x: 10, y: 20, zoom: 1 });
});

test("pinch clamps zoom at both limits", async () => {
  const { getPinchView } = await loadTypeScript("lib/canvas-viewport.ts");
  const maximum = getPinchView(pinch, { x: 0, y: 100 }, { x: 500, y: 100 }, bounds, 0.75, 2);
  const minimum = getPinchView(pinch, { x: 100, y: 100 }, { x: 101, y: 100 }, bounds, 0.75, 2);

  assert.equal(maximum.zoom, 2);
  assert.equal(minimum.zoom, 0.75);
});

test("pinch repositions the view when the two-pointer center moves", async () => {
  const { getPinchView } = await loadTypeScript("lib/canvas-viewport.ts");
  const view = getPinchView(pinch, { x: 70, y: 120 }, { x: 170, y: 120 }, bounds, 0.5, 3);

  assert.deepEqual(view, { x: -10, y: 0, zoom: 1 });
});

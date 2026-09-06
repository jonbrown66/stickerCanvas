import assert from "node:assert/strict";
import test from "node:test";

import { loadTypeScript } from "./helpers/load-typescript.mjs";

const { getRovingFocusIndex } = await loadTypeScript("lib/menu-keyboard.ts");

test("roving menu navigation wraps and skips disabled items", () => {
  const enabled = [true, false, true, false];

  assert.equal(getRovingFocusIndex("ArrowDown", 0, enabled), 2);
  assert.equal(getRovingFocusIndex("ArrowDown", 2, enabled), 0);
  assert.equal(getRovingFocusIndex("ArrowUp", 0, enabled), 2);
  assert.equal(getRovingFocusIndex("ArrowRight", 0, enabled), 2);
  assert.equal(getRovingFocusIndex("ArrowLeft", 2, enabled), 0);
});

test("roving menu navigation supports Home and End and handles no enabled items", () => {
  assert.equal(getRovingFocusIndex("Home", 2, [false, true, true]), 1);
  assert.equal(getRovingFocusIndex("End", 0, [true, true, false]), 1);
  assert.equal(getRovingFocusIndex("ArrowDown", -1, [false, false, true]), 2);
  assert.equal(getRovingFocusIndex("ArrowUp", -1, [true, false, false]), 0);
  assert.equal(getRovingFocusIndex("Home", 0, [false, false]), null);
  assert.equal(getRovingFocusIndex("Tab", 0, [true, true]), null);
  assert.equal(getRovingFocusIndex("Enter", 0, [true]), null);
});

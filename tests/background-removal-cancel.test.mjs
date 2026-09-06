import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

test("canceling removal terminates the worker, and a new request uses a fresh worker", async (t) => {
  const original = { Worker: globalThis.Worker, document: globalThis.document, createImageBitmap: globalThis.createImageBitmap };
  const workers = [];
  let onPost;
  const waitForPost = () => new Promise((resolve) => { onPost = resolve; });
  globalThis.Worker = class {
    listeners = new Map();
    terminated = false;
    constructor() { workers.push(this); }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    postMessage(request) { this.request = request; onPost(this); }
    terminate() { this.terminated = true; }
    respond(data) { this.listeners.get("message")({ data: { id: this.request.id, ...data } }); }
  };
  globalThis.createImageBitmap = async () => ({ width: 8, height: 8, close() {} });
  globalThis.document = { createElement: () => ({
    getContext: () => ({ drawImage() {} }),
    toBlob(callback) { callback(new Blob(["normalized"], { type: "image/png" })); },
  }) };
  t.after(() => Object.assign(globalThis, original));
  const { removeImageBackground } = await loadTypeScript("lib/background-removal.ts");
  const controller = new AbortController();
  const posted = waitForPost();
  const removal = removeImageBackground(new Blob(["source"]), undefined, controller.signal);
  const aborted = assert.rejects(removal, { name: "AbortError" });
  const first = await posted;
  controller.abort();
  await aborted;
  assert.equal(first.terminated, true);

  const secondPosted = waitForPost();
  const next = removeImageBackground(new Blob(["source"]));
  const second = await secondPosted;
  assert.notEqual(first, second);
  second.respond({ type: "result", width: 1, height: 1, pixels: new Uint8ClampedArray([1, 2, 3, 255]).buffer });
  assert.deepEqual([...(await next).pixels], [1, 2, 3, 255]);
  assert.equal(workers.length, 2);

  const preAborted = new AbortController();
  preAborted.abort();
  await assert.rejects(removeImageBackground(new Blob(["source"]), undefined, preAborted.signal), { name: "AbortError" });
  assert.equal(workers.length, 2);
});

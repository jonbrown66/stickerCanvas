import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

function createFakeIndexedDb() {
  const transactions = [];
  let nextOutcome = "complete";
  const database = {
    objectStoreNames: { contains: () => true },
    close() {},
    onclose: null,
    onversionchange: null,
    transaction(storeNames, mode) {
      const transaction = {
        storeNames: Array.isArray(storeNames) ? storeNames : [storeNames],
        mode,
        operations: [],
        error: null,
        oncomplete: null,
        onabort: null,
        onerror: null,
        objectStore(name) {
          return {
            put: (value) => transaction.operations.push({ type: "put", name, value }),
            clear: () => transaction.operations.push({ type: "clear", name }),
          };
        },
      };
      transactions.push(transaction);
      const outcome = nextOutcome;
      nextOutcome = "complete";
      queueMicrotask(() => {
        if (outcome === "abort") {
          transaction.error = new Error("transaction aborted");
          transaction.onabort?.();
        } else {
          transaction.oncomplete?.();
        }
      });
      return transaction;
    },
  };

  return {
    transactions,
    abortNextTransaction() {
      nextOutcome = "abort";
    },
    indexedDB: {
      open() {
        const request = { result: database, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
    },
  };
}

function textRecord(id) {
  return {
    id,
    type: "text",
    text: id,
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    rotation: 0,
    zIndex: 1,
    createdAt: 1,
    fontSize: 20,
    fontWeight: 400,
    color: "#000000",
    textOutlineColor: "#ffffff",
    textOutlineWidth: 0,
    holoEnabled: false,
    backgroundColor: "transparent",
    borderColor: "#000000",
    borderWidth: 0,
    borderRadius: 0,
    textAlign: "left",
  };
}

test("storage rechecks stale saves and switches both stores in one transaction", async () => {
  const fake = createFakeIndexedDb();
  const originalIndexedDb = globalThis.indexedDB;
  globalThis.indexedDB = fake.indexedDB;
  try {
    const { saveCanvasElementRecord, switchCanvasProject } = await loadTypeScript("lib/sticker-storage.ts");
    let isCurrent = true;
    const save = saveCanvasElementRecord(textRecord("stale"), () => isCurrent);
    isCurrent = false;
    await save;
    assert.equal(fake.transactions.length, 0);

    const previous = { id: "old", name: "Old", createdAt: 1, updatedAt: 1, elements: [textRecord("old-element")], isActive: true };
    const next = { id: "next", name: "Next", createdAt: 2, updatedAt: 2, elements: [textRecord("next-element")] };
    await switchCanvasProject(previous, next);

    const transaction = fake.transactions[0];
    assert.deepEqual(transaction.storeNames, ["elements", "canvas-projects"]);
    assert.equal(transaction.mode, "readwrite");
    assert.deepEqual(
      transaction.operations.map(({ type, name }) => [type, name]),
      [["put", "canvas-projects"], ["put", "canvas-projects"], ["clear", "elements"], ["put", "elements"]],
    );
    assert.equal(transaction.operations[0].value.isActive, false);
    assert.equal(transaction.operations[1].value.isActive, true);

    fake.abortNextTransaction();
    await assert.rejects(switchCanvasProject(null, next), /transaction aborted/);
  } finally {
    globalThis.indexedDB = originalIndexedDb;
  }
});

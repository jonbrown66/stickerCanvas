import type { StickerRecord } from "./canvas-types";
import { toStickerRecord } from "./canvas-history";

const DATABASE_NAME = "simple-sticker-canvas";
const DATABASE_VERSION = 1;
const ITEM_STORE = "stickers";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ITEM_STORE)) {
        database.createObjectStore(ITEM_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Storage unavailable"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Save canceled"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Save failed"));
  });
}

export async function readStickerRecords(): Promise<StickerRecord[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ITEM_STORE, "readonly");
    const done = transactionDone(transaction);
    const request = transaction.objectStore(ITEM_STORE).getAll();
    const records = await new Promise<StickerRecord[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as StickerRecord[]);
      request.onerror = () =>
        reject(request.error ?? new Error("Restore failed"));
    });
    await done;
    return records;
  } finally {
    database.close();
  }
}

export async function saveStickerRecord(
  sticker: StickerRecord,
): Promise<void> {
  const record = toStickerRecord(sticker);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ITEM_STORE, "readwrite");
    transaction.objectStore(ITEM_STORE).put(record);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function replaceStickerRecords(
  stickers: readonly StickerRecord[],
): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ITEM_STORE, "readwrite");
    const store = transaction.objectStore(ITEM_STORE);
    store.clear();
    stickers.forEach((sticker) => store.put(toStickerRecord(sticker)));
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function removeStickerRecord(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ITEM_STORE, "readwrite");
    transaction.objectStore(ITEM_STORE).delete(id);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

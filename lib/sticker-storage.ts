import type {
  CanvasElement,
  CanvasElementRecord,
  StickerRecord,
} from "./canvas-types";
import { toCanvasElementRecord } from "./canvas-history";

const DATABASE_NAME = "simple-sticker-canvas";
const DATABASE_VERSION = 3;
const ELEMENT_STORE = "elements";
const LEGACY_STICKER_STORE = "stickers";

function normalizeRecord(
  value:
    | CanvasElementRecord
    | Omit<StickerRecord, "type">
    | Record<string, unknown>,
): CanvasElementRecord {
  const raw = value as Record<string, unknown>;
  if (!raw.type) return { ...value, type: "image" } as StickerRecord;
  if (raw.type === "note") {
    return {
      ...raw,
      type: "text",
      color: typeof raw.textColor === "string" ? raw.textColor : "#29251f",
      fontWeight: 400,
      textAlign: "left",
      backgroundColor:
        typeof raw.backgroundColor === "string"
          ? raw.backgroundColor
          : "transparent",
      borderColor: "#2d2923",
      borderWidth: 0,
      borderRadius: 10,
    } as CanvasElementRecord;
  }
  if (raw.type === "text") {
    return {
      ...raw,
      backgroundColor:
        typeof raw.backgroundColor === "string"
          ? raw.backgroundColor
          : "transparent",
      borderColor:
        typeof raw.borderColor === "string" ? raw.borderColor : "#2d2923",
      borderWidth:
        typeof raw.borderWidth === "number" ? raw.borderWidth : 0,
      borderRadius:
        typeof raw.borderRadius === "number" ? raw.borderRadius : 8,
    } as CanvasElementRecord;
  }
  if (raw.type === "shape") {
    return {
      ...raw,
      fillEnabled:
        typeof raw.fillEnabled === "boolean"
          ? raw.fillEnabled
          : raw.fillColor !== "transparent",
    } as CanvasElementRecord;
  }
  return value as CanvasElementRecord;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const transaction = request.transaction;
      if (!transaction) return;
      const elementStore = database.objectStoreNames.contains(ELEMENT_STORE)
        ? transaction.objectStore(ELEMENT_STORE)
        : database.createObjectStore(ELEMENT_STORE, { keyPath: "id" });

      const elementCursorRequest = elementStore.openCursor();
      elementCursorRequest.onsuccess = () => {
        const cursor = elementCursorRequest.result;
        if (!cursor) return;
        cursor.update(normalizeRecord(cursor.value));
        cursor.continue();
      };

      if (database.objectStoreNames.contains(LEGACY_STICKER_STORE)) {
        const legacyStore = transaction.objectStore(LEGACY_STICKER_STORE);
        const cursorRequest = legacyStore.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          elementStore.put(normalizeRecord(cursor.value));
          cursor.continue();
        };
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

export async function readCanvasElementRecords(): Promise<
  CanvasElementRecord[]
> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ELEMENT_STORE, "readonly");
    const done = transactionDone(transaction);
    const request = transaction.objectStore(ELEMENT_STORE).getAll();
    const records = await new Promise<CanvasElementRecord[]>(
      (resolve, reject) => {
        request.onsuccess = () =>
          resolve(
            (request.result as CanvasElementRecord[]).map(normalizeRecord),
          );
        request.onerror = () =>
          reject(request.error ?? new Error("Restore failed"));
      },
    );
    await done;
    return records;
  } finally {
    database.close();
  }
}

export async function saveCanvasElementRecord(
  element: CanvasElementRecord | CanvasElement,
): Promise<void> {
  const record = toCanvasElementRecord(element);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ELEMENT_STORE, "readwrite");
    transaction.objectStore(ELEMENT_STORE).put(record);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function replaceCanvasElementRecords(
  elements: readonly (CanvasElementRecord | CanvasElement)[],
): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ELEMENT_STORE, "readwrite");
    const store = transaction.objectStore(ELEMENT_STORE);
    store.clear();
    elements.forEach((element) => store.put(toCanvasElementRecord(element)));
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function removeCanvasElementRecord(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ELEMENT_STORE, "readwrite");
    transaction.objectStore(ELEMENT_STORE).delete(id);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

// Compatibility aliases for modules that still use sticker-oriented names.
export const readStickerRecords = readCanvasElementRecords;
export const saveStickerRecord = saveCanvasElementRecord;
export const replaceStickerRecords = replaceCanvasElementRecords;
export const removeStickerRecord = removeCanvasElementRecord;

import type {
  CanvasBackgroundConfig,
  CanvasElement,
  CanvasElementRecord,
  StickerRecord,
} from "./canvas-types";
import {
  DEFAULT_CANVAS_BACKGROUND,
  DEFAULT_STICKER_CORNER_RADIUS,
  DEFAULT_STICKER_SHADOW_BLUR,
  MAX_STICKER_CORNER_RADIUS,
  MAX_STICKER_SHADOW_BLUR,
  normalizeCanvasImageCrop,
} from "./canvas-types";
import { toCanvasElementRecord } from "./canvas-history";

const DATABASE_NAME = "simple-sticker-canvas";
const DATABASE_VERSION = 4;
const ELEMENT_STORE = "elements";
const CANVAS_PROJECT_STORE = "canvas-projects";
const LEGACY_STICKER_STORE = "stickers";

export type CanvasProject = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  elements: CanvasElementRecord[];
  isActive?: boolean;
};

function normalizeRecord(
  value:
    | CanvasElementRecord
    | Omit<StickerRecord, "type">
    | Record<string, unknown>,
): CanvasElementRecord {
  const raw = value as Record<string, unknown>;
  const opacity =
    typeof raw.opacity === "number" && Number.isFinite(raw.opacity)
      ? Math.min(1, Math.max(0, raw.opacity))
      : 1;
  if (!raw.type) {
    return normalizeRecord({ ...value, type: "image" });
  }
  if (raw.type === "note") {
    return {
      ...raw,
      type: "text",
      opacity,
      color: typeof raw.textColor === "string" ? raw.textColor : "#29251f",
      fontWeight: 400,
      textAlign: "left",
      textOutlineColor: "#ffffff",
      textOutlineWidth: 6,
      holoEnabled: false,
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
      opacity,
      textOutlineColor:
        typeof raw.textOutlineColor === "string"
          ? raw.textOutlineColor
          : "#ffffff",
      textOutlineWidth:
        typeof raw.textOutlineWidth === "number" ? raw.textOutlineWidth : 6,
      holoEnabled:
        typeof raw.holoEnabled === "boolean" ? raw.holoEnabled : false,
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
      opacity,
      fillEnabled:
        typeof raw.fillEnabled === "boolean"
          ? raw.fillEnabled
          : raw.fillColor !== "transparent",
      } as CanvasElementRecord;
  }
  if (raw.type === "image") {
    return {
      ...raw,
      opacity,
      cornerRadius:
        typeof raw.cornerRadius === "number" &&
        Number.isFinite(raw.cornerRadius)
          ? Math.min(MAX_STICKER_CORNER_RADIUS, Math.max(0, raw.cornerRadius))
          : DEFAULT_STICKER_CORNER_RADIUS,
      cornerRadiusEnabled:
        typeof raw.cornerRadiusEnabled === "boolean"
          ? raw.cornerRadiusEnabled
          : true,
      shadowEnabled:
        typeof raw.shadowEnabled === "boolean" ? raw.shadowEnabled : true,
      shadowBlur:
        typeof raw.shadowBlur === "number" && Number.isFinite(raw.shadowBlur)
          ? Math.min(MAX_STICKER_SHADOW_BLUR, Math.max(0, raw.shadowBlur))
          : DEFAULT_STICKER_SHADOW_BLUR,
      crop: normalizeCanvasImageCrop(raw.crop),
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
      if (!database.objectStoreNames.contains(CANVAS_PROJECT_STORE)) {
        database.createObjectStore(CANVAS_PROJECT_STORE, { keyPath: "id" });
      }

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

let cachedDatabase: IDBDatabase | null = null;
let openDbPromise: Promise<IDBDatabase> | null = null;

function getDatabase(): Promise<IDBDatabase> {
  if (cachedDatabase) {
    return Promise.resolve(cachedDatabase);
  }
  if (openDbPromise) {
    return openDbPromise;
  }
  openDbPromise = openDatabase()
    .then((database) => {
      cachedDatabase = database;
      openDbPromise = null;
      database.onclose = () => {
        if (cachedDatabase === database) cachedDatabase = null;
      };
      database.onversionchange = () => {
        database.close();
        if (cachedDatabase === database) cachedDatabase = null;
      };
      return database;
    })
    .catch((error) => {
      openDbPromise = null;
      throw error;
    });
  return openDbPromise;
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
  const database = await getDatabase();
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
}

export async function saveCanvasElementRecord(
  element: CanvasElementRecord | CanvasElement,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  const record = toCanvasElementRecord(element);
  const database = await getDatabase();
  // Check after opening the database, immediately before queuing the write.
  if (!isCurrent()) return;
  const transaction = database.transaction(ELEMENT_STORE, "readwrite");
  transaction.objectStore(ELEMENT_STORE).put(record);
  await transactionDone(transaction);
}

export async function replaceCanvasElementRecords(
  elements: readonly (CanvasElementRecord | CanvasElement)[],
): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction(ELEMENT_STORE, "readwrite");
  const store = transaction.objectStore(ELEMENT_STORE);
  store.clear();
  elements.forEach((element) => store.put(toCanvasElementRecord(element)));
  await transactionDone(transaction);
}

export async function removeCanvasElementRecord(id: string): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction(ELEMENT_STORE, "readwrite");
  transaction.objectStore(ELEMENT_STORE).delete(id);
  await transactionDone(transaction);
}

export async function readCanvasProjects(): Promise<CanvasProject[]> {
  const database = await getDatabase();
  const transaction = database.transaction(CANVAS_PROJECT_STORE, "readonly");
  const done = transactionDone(transaction);
  const request = transaction.objectStore(CANVAS_PROJECT_STORE).getAll();
  const projects = await new Promise<CanvasProject[]>((resolve, reject) => {
    request.onsuccess = () =>
      resolve(
        (request.result as CanvasProject[]).map((project) => ({
          ...project,
          elements: project.elements.map(normalizeRecord),
        })),
      );
    request.onerror = () =>
      reject(request.error ?? new Error("Canvas history unavailable"));
  });
  await done;
  return projects;
}

export async function saveCanvasProject(
  project: Omit<CanvasProject, "elements"> & {
    elements: readonly (CanvasElementRecord | CanvasElement)[];
  },
): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction(CANVAS_PROJECT_STORE, "readwrite");
  transaction.objectStore(CANVAS_PROJECT_STORE).put({
    ...project,
    elements: project.elements.map(toCanvasElementRecord),
  } satisfies CanvasProject);
  await transactionDone(transaction);
}

export async function switchCanvasProject(
  previous: CanvasProject | null,
  next: CanvasProject,
): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction(
    [ELEMENT_STORE, CANVAS_PROJECT_STORE], "readwrite",
  );
  const done = transactionDone(transaction);
  try {
    const projects = transaction.objectStore(CANVAS_PROJECT_STORE);
    if (previous) projects.put({
      ...previous, isActive: false, elements: previous.elements.map(toCanvasElementRecord),
    });
    projects.put({ ...next, isActive: true, elements: next.elements.map(toCanvasElementRecord) });
    const elements = transaction.objectStore(ELEMENT_STORE);
    elements.clear();
    next.elements.forEach((element) => elements.put(toCanvasElementRecord(element)));
  } catch (error) {
    transaction.abort();
    await done.catch(() => {});
    throw error;
  }
  await done;
}

// Compatibility aliases for modules that still use sticker-oriented names.
export const readStickerRecords = readCanvasElementRecords;
export const saveStickerRecord = saveCanvasElementRecord;
export const replaceStickerRecords = replaceCanvasElementRecords;
export const removeStickerRecord = removeCanvasElementRecord;

const CANVAS_BACKGROUND_KEY = "simple-canvas-background-config";

export function readCanvasBackground(): CanvasBackgroundConfig {
  if (typeof window === "undefined") return DEFAULT_CANVAS_BACKGROUND;
  try {
    const raw = window.localStorage.getItem(CANVAS_BACKGROUND_KEY);
    if (!raw) return DEFAULT_CANVAS_BACKGROUND;
    const parsed = JSON.parse(raw) as Partial<CanvasBackgroundConfig>;
    if (!parsed || typeof parsed !== "object") return DEFAULT_CANVAS_BACKGROUND;
    return {
      style: parsed.style ?? DEFAULT_CANVAS_BACKGROUND.style,
      color:
        typeof parsed.color === "string"
          ? parsed.color
          : DEFAULT_CANVAS_BACKGROUND.color,
      gridOpacity:
        typeof parsed.gridOpacity === "number"
          ? parsed.gridOpacity
          : DEFAULT_CANVAS_BACKGROUND.gridOpacity,
    };
  } catch {
    return DEFAULT_CANVAS_BACKGROUND;
  }
}

export function saveCanvasBackground(config: CanvasBackgroundConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CANVAS_BACKGROUND_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage quota or disabled storage
  }
}

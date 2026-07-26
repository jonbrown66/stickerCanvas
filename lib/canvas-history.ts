import type {
  CanvasElement,
  CanvasElementRecord,
  CanvasSticker,
  StickerRecord,
} from "./canvas-types";

export type CanvasHistory = {
  entries: CanvasElementRecord[][];
  index: number;
};

export function toCanvasElementRecord(
  element: CanvasElementRecord | CanvasElement,
): CanvasElementRecord {
  if (element.type !== "image" && !("image" in element)) {
    return { ...element };
  }
  const imageElement = element as CanvasSticker;
  return {
    id: imageElement.id,
    type: "image",
    image: imageElement.image,
    width: imageElement.width,
    height: imageElement.height,
    x: imageElement.x,
    y: imageElement.y,
    rotation: imageElement.rotation,
    zIndex: imageElement.zIndex,
    createdAt: imageElement.createdAt,
    outlineWidth: imageElement.outlineWidth,
    outlineColor: imageElement.outlineColor,
    oilFilmEnabled: imageElement.oilFilmEnabled,
    isCutout: imageElement.isCutout,
  };
}

export function snapshotCanvasElements(
  elements: readonly (CanvasElementRecord | CanvasElement)[],
): CanvasElementRecord[] {
  return elements.map(toCanvasElementRecord);
}

export function createCanvasHistory(
  elements: readonly (CanvasElementRecord | CanvasElement)[],
): CanvasHistory {
  return {
    entries: [snapshotCanvasElements(elements)],
    index: 0,
  };
}

export function appendCanvasHistory(
  history: CanvasHistory,
  elements: readonly (CanvasElementRecord | CanvasElement)[],
  maximumEntries = 30,
): CanvasHistory {
  const entries = history.entries.slice(0, history.index + 1);
  entries.push(snapshotCanvasElements(elements));
  if (entries.length > maximumEntries) entries.shift();
  return { entries, index: entries.length - 1 };
}

export function moveCanvasHistory(
  history: CanvasHistory,
  direction: -1 | 1,
): { history: CanvasHistory; snapshot: CanvasElementRecord[] } | null {
  const index = history.index + direction;
  if (index < 0 || index >= history.entries.length) return null;
  return {
    history: { ...history, index },
    snapshot: snapshotCanvasElements(history.entries[index]),
  };
}

export function restoreCanvasSnapshot(
  snapshot: readonly CanvasElementRecord[],
  current: readonly CanvasElement[],
): { elements: CanvasElement[]; revokedUrls: string[] } {
  const currentImages = new Map(
    current
      .filter((element): element is CanvasSticker => element.type === "image")
      .map((element) => [element.id, element]),
  );
  const reusedUrls = new Set<string>();
  const elements = snapshot.map((record): CanvasElement => {
    if (record.type !== "image") return { ...record };
    const existing = currentImages.get(record.id);
    if (existing?.image === record.image) {
      reusedUrls.add(existing.url);
      return { ...record, url: existing.url };
    }
    return { ...record, url: URL.createObjectURL(record.image) };
  });

  return {
    elements,
    revokedUrls: current
      .filter((element): element is CanvasSticker => element.type === "image")
      .filter((element) => !reusedUrls.has(element.url))
      .map((element) => element.url),
  };
}

// Compatibility exports keep existing consumers and saved tests working while
// the canvas migrates from sticker-only naming to generic elements.
export type StickerHistory = CanvasHistory;
export const toStickerRecord = (
  sticker: StickerRecord | CanvasSticker,
): StickerRecord => toCanvasElementRecord(sticker) as StickerRecord;
export const snapshotStickers = snapshotCanvasElements;
export const createStickerHistory = createCanvasHistory;
export const appendStickerHistory = appendCanvasHistory;
export const moveStickerHistory = moveCanvasHistory;
export function restoreStickerSnapshot(
  snapshot: readonly CanvasElementRecord[],
  current: readonly CanvasElement[],
) {
  const restored = restoreCanvasSnapshot(snapshot, current);
  return {
    stickers: restored.elements,
    revokedUrls: restored.revokedUrls,
  };
}

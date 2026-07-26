import type { CanvasSticker, StickerRecord } from "./canvas-types";

export type StickerHistory = {
  entries: StickerRecord[][];
  index: number;
};

export function toStickerRecord(sticker: StickerRecord): StickerRecord {
  return {
    id: sticker.id,
    image: sticker.image,
    width: sticker.width,
    height: sticker.height,
    x: sticker.x,
    y: sticker.y,
    rotation: sticker.rotation,
    zIndex: sticker.zIndex,
    createdAt: sticker.createdAt,
    outlineWidth: sticker.outlineWidth,
    outlineColor: sticker.outlineColor,
    oilFilmEnabled: sticker.oilFilmEnabled,
    isCutout: sticker.isCutout,
  };
}

export function snapshotStickers(
  stickers: readonly StickerRecord[],
): StickerRecord[] {
  return stickers.map(toStickerRecord);
}

export function createStickerHistory(
  stickers: readonly StickerRecord[],
): StickerHistory {
  return {
    entries: [snapshotStickers(stickers)],
    index: 0,
  };
}

export function appendStickerHistory(
  history: StickerHistory,
  stickers: readonly StickerRecord[],
  maximumEntries = 30,
): StickerHistory {
  const entries = history.entries.slice(0, history.index + 1);
  entries.push(snapshotStickers(stickers));
  if (entries.length > maximumEntries) entries.shift();
  return { entries, index: entries.length - 1 };
}

export function moveStickerHistory(
  history: StickerHistory,
  direction: -1 | 1,
): { history: StickerHistory; snapshot: StickerRecord[] } | null {
  const index = history.index + direction;
  if (index < 0 || index >= history.entries.length) return null;
  return {
    history: { ...history, index },
    snapshot: snapshotStickers(history.entries[index]),
  };
}

export function restoreStickerSnapshot(
  snapshot: readonly StickerRecord[],
  current: readonly CanvasSticker[],
): { stickers: CanvasSticker[]; revokedUrls: string[] } {
  const currentById = new Map(current.map((sticker) => [sticker.id, sticker]));
  const reusedUrls = new Set<string>();
  const stickers = snapshot.map((record) => {
    const existing = currentById.get(record.id);
    if (existing?.image === record.image) {
      reusedUrls.add(existing.url);
      return { ...record, url: existing.url };
    }
    return { ...record, url: URL.createObjectURL(record.image) };
  });

  return {
    stickers,
    revokedUrls: current
      .filter((sticker) => !reusedUrls.has(sticker.url))
      .map((sticker) => sticker.url),
  };
}

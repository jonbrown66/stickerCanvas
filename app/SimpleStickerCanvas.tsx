"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type {
  CanvasSticker,
  CanvasView,
  StickerGestureKind,
  StickerStyleOptions,
} from "@/lib/canvas-types";
import { removeImageBackground } from "@/lib/background-removal";
import {
  appendStickerHistory,
  createStickerHistory,
  moveStickerHistory,
  restoreStickerSnapshot,
  type StickerHistory,
} from "@/lib/canvas-history";
import { convertHeicToJpeg, isHeicFile } from "@/lib/heic";
import {
  createOutlinedCutout,
  exportStickerWithOutline,
} from "@/lib/sticker-image-processing";
import {
  readStickerRecords,
  removeStickerRecord,
  replaceStickerRecords,
  saveStickerRecord,
} from "@/lib/sticker-storage";
import { CameraCapture } from "./CameraCapture";
import { Icon } from "./Icon";
import { StickerCanvasItem } from "./StickerCanvasItem";

type StickerGesture = {
  kind: StickerGestureKind;
  pointerId: number;
  itemId: string;
  startClientX: number;
  startClientY: number;
  startDistance: number;
  startAngle: number;
  centerX: number;
  centerY: number;
  start: CanvasSticker;
};

const VIEW_KEY = "simple-sticker-canvas:view";
const SEEDED_KEY = "simple-sticker-canvas:seeded";
const SEEDED_VERSION = "3";
const EXAMPLE_STICKER_ID = "example-sticker-v1";
const EXAMPLE_STICKER_URL = `${import.meta.env.BASE_URL}sticker-canvas-logo.svg`;
const MIN_ZOOM = 0.08;
const MAX_ZOOM = 6;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

async function readImageAspect(blob: Blob) {
  if ("createImageBitmap" in window) {
    const bitmap = await createImageBitmap(blob);
    const aspect = bitmap.width / Math.max(1, bitmap.height);
    bitmap.close();
    return aspect;
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image.naturalWidth / Math.max(1, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function initialView(): CanvasView {
  if (typeof window === "undefined") return { x: 0, y: 0, zoom: 1 };
  try {
    const stored = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null");
    if (
      stored &&
      Number.isFinite(stored.x) &&
      Number.isFinite(stored.y) &&
      Number.isFinite(stored.zoom)
    ) {
      return {
        x: stored.x,
        y: stored.y,
        zoom: clamp(stored.zoom, MIN_ZOOM, MAX_ZOOM),
      };
    }
  } catch {
    // Start from the default viewport if preferences are unavailable.
  }
  return { x: 0, y: 0, zoom: 1 };
}

export function SimpleStickerCanvas() {
  const viewportRef = useRef<HTMLElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const stickersRef = useRef<CanvasSticker[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const processingRef = useRef(false);
  const saveTimerRef = useRef<Record<string, number>>({});
  const panRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    view: CanvasView;
  } | null>(null);
  const gestureRef = useRef<StickerGesture | null>(null);
  const touchPointsRef = useRef(new Map<number, { x: number; y: number }>());
  const rafRef = useRef<number | null>(null);
  const pinchRef = useRef<{
    ids: [number, number];
    distance: number;
    view: CanvasView;
    anchorX: number;
    anchorY: number;
  } | null>(null);

  const historyRef = useRef<StickerHistory>({ entries: [], index: -1 });

  const [stickers, setStickers] = useState<CanvasSticker[]>([]);
  const [view, setView] = useState<CanvasView>(initialView);
  const viewRef = useRef<CanvasView>(view);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [enteringId, setEnteringId] = useState<string | null>(null);
  const [processingStickerId, setProcessingStickerId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);

  const pushHistory = useCallback((nextStickers: CanvasSticker[]) => {
    historyRef.current = appendStickerHistory(
      historyRef.current,
      nextStickers,
    );
  }, []);

  const applyHistorySnapshot = useCallback(
    (snapshot: StickerHistory["entries"][number]) => {
      const restored = restoreStickerSnapshot(snapshot, stickersRef.current);
      stickersRef.current = restored.stickers;
      setStickers(restored.stickers);
      if (
        selectedIdRef.current &&
        !restored.stickers.some(
          (sticker) => sticker.id === selectedIdRef.current,
        )
      ) {
        selectedIdRef.current = null;
        setSelectedId(null);
      }
      window.setTimeout(
        () => restored.revokedUrls.forEach((url) => URL.revokeObjectURL(url)),
        0,
      );
      void replaceStickerRecords(restored.stickers).catch(() =>
        setNotice("History could not be saved"),
      );
    },
    [],
  );

  const undo = useCallback(() => {
    const movement = moveStickerHistory(historyRef.current, -1);
    if (!movement) return;
    historyRef.current = movement.history;
    applyHistorySnapshot(movement.snapshot);
  }, [applyHistorySnapshot]);

  const redo = useCallback(() => {
    const movement = moveStickerHistory(historyRef.current, 1);
    if (!movement) return;
    historyRef.current = movement.history;
    applyHistorySnapshot(movement.snapshot);
  }, [applyHistorySnapshot]);

  const replaceStickers = useCallback(
    (
      update:
        | CanvasSticker[]
        | ((current: CanvasSticker[]) => CanvasSticker[]),
      recordHistory = true,
    ) => {
      setStickers((current) => {
        const next = typeof update === "function" ? update(current) : update;
        stickersRef.current = next;
        if (recordHistory) {
          pushHistory(next);
        }
        return next;
      });
    },
    [pushHistory],
  );

  const updateView = useCallback((next: CanvasView) => {
    viewRef.current = next;
    setView(next);
  }, []);

  const selectSticker = useCallback((id: string | null) => {
    selectedIdRef.current = id;
    setSelectedId(id);
  }, []);

  const updateStickerStyle = useCallback(
    (
      stickerId: string,
      patch: Partial<StickerStyleOptions>,
      commit = true,
    ) => {
      const current = stickersRef.current.find(
        (sticker) => sticker.id === stickerId,
      );
      if (!current) return;
      const updated = { ...current, ...patch };

      replaceStickers(
        (stickers) =>
          stickers.map((sticker) =>
            sticker.id === stickerId ? updated : sticker,
          ),
        commit,
      );

      if (saveTimerRef.current[stickerId]) {
        window.clearTimeout(saveTimerRef.current[stickerId]);
      }
      if (commit) {
        delete saveTimerRef.current[stickerId];
        void saveStickerRecord(updated).catch(() => setNotice("Save failed"));
      } else {
        saveTimerRef.current[stickerId] = window.setTimeout(() => {
          void saveStickerRecord(updated).catch(() => setNotice("Save failed"));
          delete saveTimerRef.current[stickerId];
        }, 300);
      }
    },
    [replaceStickers],
  );

  useEffect(() => {
    let disposed = false;
    void readStickerRecords()
      .then(async (records) => {
        if (disposed) return;
        const seededVersion = localStorage.getItem(SEEDED_KEY);
        const existingExample = records.find(
          (record) => record.id === EXAMPLE_STICKER_ID,
        );
        let restoredRecords = records;

        if (existingExample && seededVersion !== SEEDED_VERSION) {
          const response = await fetch(EXAMPLE_STICKER_URL);
          if (!response.ok) throw new Error("Sample update failed");
          const image = await response.blob();
          const upgradedExample = {
            ...existingExample,
            image,
            width: 280,
            height: 280,
          };
          await saveStickerRecord(upgradedExample);
          localStorage.setItem(SEEDED_KEY, SEEDED_VERSION);
          restoredRecords = records.map((record) =>
            record.id === EXAMPLE_STICKER_ID ? upgradedExample : record,
          );
        }

        if (!restoredRecords.length && seededVersion === null) {
          const response = await fetch(EXAMPLE_STICKER_URL);
          if (!response.ok) throw new Error("Sample unavailable");
          const image = await response.blob();
          const sticker: CanvasSticker = {
            id: EXAMPLE_STICKER_ID,
            image,
            url: URL.createObjectURL(image),
            width: 280,
            height: 280,
            x: 0,
            y: -24,
            rotation: -4,
            zIndex: 1,
            createdAt: Date.now(),
          };
          await saveStickerRecord(sticker);
          localStorage.setItem(SEEDED_KEY, SEEDED_VERSION);
          if (disposed) {
            URL.revokeObjectURL(sticker.url);
            return;
          }
          replaceStickers([sticker], false);
          historyRef.current = createStickerHistory([sticker]);
          return;
        }
        const restored = restoredRecords
          .sort((left, right) => left.zIndex - right.zIndex)
          .map((record) => ({
            ...record,
            url: URL.createObjectURL(record.image),
          }));
        if (!disposed) {
          replaceStickers(restored, false);
          historyRef.current = createStickerHistory(restored);
        }
      })
      .catch(() => setNotice("Restore failed"));

    return () => {
      disposed = true;
      Object.values(saveTimerRef.current).forEach((timer) =>
        window.clearTimeout(timer),
      );
      saveTimerRef.current = {};
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      stickersRef.current.forEach((sticker) => URL.revokeObjectURL(sticker.url));
    };
  }, [replaceStickers]);

  const persistView = useCallback((next = viewRef.current) => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(next));
    } catch {
      // Canvas remains usable when preference storage is blocked.
    }
  }, []);

  const updateSticker = useCallback(
    (
      id: string,
      update: Partial<CanvasSticker>,
      recordHistory = false,
    ) => {
      replaceStickers(
        (current) =>
          current.map((sticker) =>
            sticker.id === id ? { ...sticker, ...update } : sticker,
          ),
        recordHistory,
      );
    },
    [replaceStickers],
  );

  const cutoutSticker = useCallback(
    async (sticker: CanvasSticker) => {
      if (sticker.isCutout) {
        setNotice("Already cut out");
        return;
      }
      if (processingRef.current) return;
      processingRef.current = true;
      setProcessingStickerId(sticker.id);
      let createdUrl: string | null = null;
      try {
        const result = await removeImageBackground(sticker.image);

        const cutout = await createOutlinedCutout(
          result.pixels,
          result.width,
          result.height,
        );

        const ratio = cutout.width / cutout.height;
        const newHeight = sticker.width / ratio;
        const newUrl = URL.createObjectURL(cutout.blob);
        createdUrl = newUrl;

        const updated: CanvasSticker = {
          ...sticker,
          image: cutout.blob,
          url: newUrl,
          height: newHeight,
          outlineWidth: (sticker.outlineWidth && sticker.outlineWidth > 0) ? sticker.outlineWidth : 8,
          outlineColor: sticker.outlineColor || "#ffffff",
          isCutout: true,
        };

        await saveStickerRecord(updated);
        replaceStickers((current) =>
          current.map((s) => (s.id === sticker.id ? updated : s)),
        );
        createdUrl = null;
        URL.revokeObjectURL(sticker.url);
      } catch (error) {
        if (createdUrl) URL.revokeObjectURL(createdUrl);
        console.error("Could not cutout sticker.", error);
        setNotice(
          error instanceof Error ? error.message : "Cutout failed",
        );
      } finally {
        processingRef.current = false;
        setProcessingStickerId(null);
      }
    },
    [replaceStickers],
  );

  const processFile = useCallback(
    async (file?: File) => {
      if (!file || processingRef.current) return;
      if (
        !file.type.startsWith("image/") &&
        !/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)
      ) {
        setNotice("Choose an image");
        return;
      }
      if (file.size > 20_000_000) {
        setNotice("Max size: 20 MB");
        return;
      }

      setCameraOpen(false);
      processingRef.current = true;
      setIsImporting(true);
      setNotice("Preparing photo…");
      let createdUrl: string | null = null;
      try {
        const readable = isHeicFile(file) ? await convertHeicToJpeg(file) : file;
        let image = readable;
        let aspect = await readImageAspect(readable);
        let isCutout = false;
        let outlineWidth = 0;
        let cutoutError: string | null = null;

        try {
          const result = await removeImageBackground(readable, (progress) => {
            if (progress.phase === "processing") {
              setNotice("Removing background…");
              return;
            }
            const percentage = Math.round(progress.progress ?? 0);
            setNotice(
              percentage > 0
                ? `Loading cutout model… ${percentage}%`
                : "Loading cutout model…",
            );
          });
          const cutout = await createOutlinedCutout(
            result.pixels,
            result.width,
            result.height,
          );
          image = cutout.blob;
          aspect = cutout.width / Math.max(1, cutout.height);
          isCutout = true;
          outlineWidth = 8;
        } catch (error) {
          cutoutError =
            error instanceof Error ? error.message : "Background removal failed";
        }

        const url = URL.createObjectURL(image);
        createdUrl = url;

        const rect = viewportRef.current?.getBoundingClientRect();
        const maximumWidth = Math.min(380, (rect?.width ?? 600) * 0.52);
        const maximumHeight = Math.min(430, (rect?.height ?? 800) * 0.52);
        let width = maximumWidth / viewRef.current.zoom;
        let height = width / aspect;
        if (height > maximumHeight / viewRef.current.zoom) {
          height = maximumHeight / viewRef.current.zoom;
          width = height * aspect;
        }

        const topZ = stickersRef.current.reduce(
          (largest, s) => Math.max(largest, s.zIndex),
          0,
        );

        const sticker: CanvasSticker = {
          id: crypto.randomUUID(),
          image,
          url,
          width,
          height,
          x: viewRef.current.x,
          y: viewRef.current.y,
          rotation: 0,
          zIndex: topZ + 1,
          createdAt: Date.now(),
          outlineWidth,
          outlineColor: "#ffffff",
          oilFilmEnabled: false,
          isCutout,
        };

        await saveStickerRecord(sticker);
        replaceStickers((current) => [...current, sticker]);
        selectSticker(sticker.id);
        setEnteringId(sticker.id);
        window.setTimeout(
          () =>
            setEnteringId((current) =>
              current === sticker.id ? null : current,
            ),
          650,
        );
        setNotice(
          cutoutError
            ? `Original added — cutout failed: ${cutoutError}`
            : "",
        );
      } catch (error) {
        if (createdUrl) {
          URL.revokeObjectURL(createdUrl);
        }
        console.error("Could not load image.", error);
        setNotice(
          error instanceof Error ? error.message : "Image failed to load",
        );
      } finally {
        processingRef.current = false;
        setIsImporting(false);
        if (uploadInputRef.current) uploadInputRef.current.value = "";
        if (cameraInputRef.current) cameraInputRef.current.value = "";
      }
    },
    [replaceStickers, selectSticker],
  );

  const startStickerGesture = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      sticker: CanvasSticker,
      kind: StickerGestureKind,
    ) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const currentView = viewRef.current;
      const centerX =
        rect.left +
        rect.width / 2 +
        (sticker.x - currentView.x) * currentView.zoom;
      const centerY =
        rect.top +
        rect.height / 2 +
        (sticker.y - currentView.y) * currentView.zoom;
      const topZ = stickersRef.current.reduce(
        (largest, item) => Math.max(largest, item.zIndex),
        0,
      );
      const lifted =
        sticker.zIndex === topZ ? sticker : { ...sticker, zIndex: topZ + 1 };
      if (lifted !== sticker) updateSticker(sticker.id, { zIndex: lifted.zIndex });
      selectSticker(sticker.id);
      gestureRef.current = {
        kind,
        pointerId: event.pointerId,
        itemId: sticker.id,
        startClientX: event.clientX,
        startClientY: event.clientY,
        centerX,
        centerY,
        startDistance: Math.max(
          1,
          Math.hypot(event.clientX - centerX, event.clientY - centerY),
        ),
        startAngle: Math.atan2(
          event.clientY - centerY,
          event.clientX - centerX,
        ),
        start: lifted,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [selectSticker, updateSticker],
  );

  const moveStickerGesture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      event.preventDefault();
      if (gesture.kind === "move") {
        updateSticker(gesture.itemId, {
          x:
            gesture.start.x +
            (event.clientX - gesture.startClientX) / viewRef.current.zoom,
          y:
            gesture.start.y +
            (event.clientY - gesture.startClientY) / viewRef.current.zoom,
        });
        return;
      }
      if (gesture.kind === "resize") {
        const distance = Math.max(
          1,
          Math.hypot(
            event.clientX - gesture.centerX,
            event.clientY - gesture.centerY,
          ),
        );
        const factor = clamp(distance / gesture.startDistance, 0.18, 8);
        updateSticker(gesture.itemId, {
          width: gesture.start.width * factor,
          height: gesture.start.height * factor,
        });
        return;
      }
      const angle = Math.atan2(
        event.clientY - gesture.centerY,
        event.clientX - gesture.centerX,
      );
      updateSticker(gesture.itemId, {
        rotation:
          gesture.start.rotation +
          ((angle - gesture.startAngle) * 180) / Math.PI,
      });
    },
    [updateSticker],
  );

  const finishStickerGesture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gestureRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const sticker = stickersRef.current.find(
        (item) => item.id === gesture.itemId,
      );
      if (sticker) {
        void saveStickerRecord(sticker).catch(() =>
          setNotice("Save failed"),
        );
        pushHistory(stickersRef.current);
      }
    },
    [pushHistory],
  );

  const deleteSticker = useCallback(
    (sticker: CanvasSticker) => {
      if (saveTimerRef.current[sticker.id]) {
        window.clearTimeout(saveTimerRef.current[sticker.id]);
        delete saveTimerRef.current[sticker.id];
      }
      void removeStickerRecord(sticker.id)
        .then(() => {
          selectSticker(null);
          replaceStickers((current) =>
            current.filter((item) => item.id !== sticker.id),
          );
          window.setTimeout(() => URL.revokeObjectURL(sticker.url), 0);
        })
        .catch(() => setNotice("Delete failed"));
    },
    [replaceStickers, selectSticker],
  );

  const downloadSticker = useCallback((sticker: CanvasSticker) => {
    const displayW = sticker.width;
    const w = sticker.outlineWidth ?? 0;
    const color = sticker.outlineColor || "#ffffff";
    void exportStickerWithOutline(sticker.image, displayW, w, color, {
      oilFilmEnabled: sticker.oilFilmEnabled,
    })
      .then((png) => {
        const downloadUrl = URL.createObjectURL(png);
        const anchor = document.createElement("a");
        const timestamp = new Date(sticker.createdAt)
          .toISOString()
          .replace(/[:.]/g, "-");
        anchor.href = downloadUrl;
        anchor.download = `sticker-${timestamp}.png`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
      })
      .catch(() => setNotice("Download failed"));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (event.key === "Escape") {
        selectSticker(null);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        if (event.shiftKey) {
          event.preventDefault();
          redo();
        } else {
          event.preventDefault();
          undo();
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }

      if (
        event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight"
      ) {
        const sticker = stickersRef.current.find(
          (item) => item.id === selectedIdRef.current,
        );
        if (!sticker) return;
        event.preventDefault();
        const step = (event.shiftKey ? 10 : 1) / viewRef.current.zoom;
        let deltaX = 0;
        let deltaY = 0;
        if (event.key === "ArrowUp") deltaY = -step;
        if (event.key === "ArrowDown") deltaY = step;
        if (event.key === "ArrowLeft") deltaX = -step;
        if (event.key === "ArrowRight") deltaX = step;

        const updated = {
          ...sticker,
          x: sticker.x + deltaX,
          y: sticker.y + deltaY,
        };
        updateSticker(sticker.id, { x: updated.x, y: updated.y }, true);
        void saveStickerRecord(updated);
        return;
      }

      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const sticker = stickersRef.current.find(
        (item) => item.id === selectedIdRef.current,
      );
      if (!sticker) return;
      event.preventDefault();
      deleteSticker(sticker);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSticker, undo, redo, updateSticker, selectSticker]);

  const startViewportPointer = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as Element).closest("[data-canvas-ui]")) return;

    if (event.pointerType === "touch") {
      event.preventDefault();
      touchPointsRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (touchPointsRef.current.size === 2) {
        const entries = [...touchPointsRef.current.entries()];
        const first = entries[0];
        const second = entries[1];
        const rect = event.currentTarget.getBoundingClientRect();
        const middleX = (first[1].x + second[1].x) / 2;
        const middleY = (first[1].y + second[1].y) / 2;
        const currentView = viewRef.current;
        pinchRef.current = {
          ids: [first[0], second[0]],
          distance: Math.max(
            1,
            Math.hypot(
              first[1].x - second[1].x,
              first[1].y - second[1].y,
            ),
          ),
          view: currentView,
          anchorX:
            currentView.x +
            (middleX - rect.left - rect.width / 2) / currentView.zoom,
          anchorY:
            currentView.y +
            (middleY - rect.top - rect.height / 2) / currentView.zoom,
        };
        panRef.current = null;
        return;
      }
    }
    if (
      event.button !== 0 ||
      (event.target as HTMLElement).closest("[data-sticker]")
    ) {
      return;
    }
    event.preventDefault();
    selectSticker(null);
    panRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      view: viewRef.current,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveViewportPointer = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const touch = touchPointsRef.current.get(event.pointerId);
    if (touch) {
      touch.x = event.clientX;
      touch.y = event.clientY;
    }
    const pinch = pinchRef.current;
    if (pinch) {
      const first = touchPointsRef.current.get(pinch.ids[0]);
      const second = touchPointsRef.current.get(pinch.ids[1]);
      const rect = event.currentTarget.getBoundingClientRect();
      if (!first || !second) return;
      event.preventDefault();
      const distance = Math.max(
        1,
        Math.hypot(first.x - second.x, first.y - second.y),
      );
      const zoom = clamp(
        pinch.view.zoom * (distance / pinch.distance),
        MIN_ZOOM,
        MAX_ZOOM,
      );
      const middleX = (first.x + second.x) / 2;
      const middleY = (first.y + second.y) / 2;
      updateView({
        x: pinch.anchorX - (middleX - rect.left - rect.width / 2) / zoom,
        y: pinch.anchorY - (middleY - rect.top - rect.height / 2) / zoom,
        zoom,
      });
      return;
    }
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    updateView({
      ...pan.view,
      x: pan.view.x - (event.clientX - pan.clientX) / pan.view.zoom,
      y: pan.view.y - (event.clientY - pan.clientY) / pan.view.zoom,
    });
  }, [updateView]);

  const moveGlobalPointer = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const clientX = event.clientX;
      const clientY = event.clientY;
      const pointerId = event.pointerId;

      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (gestureRef.current) {
          moveStickerGesture({ clientX, clientY, pointerId, preventDefault: () => {} } as unknown as ReactPointerEvent<HTMLElement>);
        } else {
          moveViewportPointer({ clientX, clientY, pointerId, preventDefault: () => {} } as unknown as ReactPointerEvent<HTMLElement>);
        }
      });
    },
    [moveStickerGesture, moveViewportPointer],
  );

  const finishViewportPointer = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    touchPointsRef.current.delete(event.pointerId);
    if (
      pinchRef.current?.ids.includes(event.pointerId) ||
      touchPointsRef.current.size < 2
    ) {
      pinchRef.current = null;
    }
    if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    persistView();
  }, [persistView]);

  const finishGlobalPointer = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (gestureRef.current) {
        finishStickerGesture(event);
      } else {
        finishViewportPointer(event);
      }
    },
    [finishStickerGesture, finishViewportPointer],
  );

  const handleWheel = (event: ReactWheelEvent<HTMLElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - rect.left - rect.width / 2;
    const offsetY = event.clientY - rect.top - rect.height / 2;
    const current = viewRef.current;
    const zoom = clamp(
      current.zoom * Math.exp(-event.deltaY * 0.0012),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    const next = {
      x: current.x + offsetX / current.zoom - offsetX / zoom,
      y: current.y + offsetY / current.zoom - offsetY / zoom,
      zoom,
    };
    updateView(next);
    persistView(next);
  };

  const worldStyle = {
    transform: `translate3d(calc(50vw - ${view.x * view.zoom}px), calc(50dvh - ${view.y * view.zoom}px), 0) scale(${view.zoom})`,
    "--simple-control-scale": String(1 / view.zoom),
  } as CSSProperties;

  const gridStyle = {
    "--grid-size": `${28 * view.zoom}px`,
    "--grid-x": `${-view.x * view.zoom}px`,
    "--grid-y": `${-view.y * view.zoom}px`,
  } as CSSProperties;

  return (
    <main
      ref={viewportRef}
      className="simple-sticker-canvas"
      onPointerDown={startViewportPointer}
      onPointerMove={moveGlobalPointer}
      onPointerUp={finishGlobalPointer}
      onPointerCancel={finishGlobalPointer}
      onWheel={handleWheel}
    >
      <div className="simple-canvas-grid" style={gridStyle} />
      <div className="simple-sticker-world" style={worldStyle}>
        {stickers.map((sticker) => (
          <StickerCanvasItem
            key={sticker.id}
            sticker={sticker}
            selected={selectedId === sticker.id}
            entering={enteringId === sticker.id}
            isProcessing={processingStickerId === sticker.id}
            onGestureStart={startStickerGesture}
            onDelete={deleteSticker}
            onDownload={downloadSticker}
            onCutout={cutoutSticker}
            onUpdateStyle={updateStickerStyle}
            onSelect={selectSticker}
          />
        ))}
      </div>

      {!stickers.length ? (
        <p className="simple-empty-hint">Upload a photo</p>
      ) : null}

      {isImporting ? (
        <div className="simple-processing" role="status" aria-live="polite">
          <span className="simple-processing-spinner" aria-hidden="true" />
          <strong>{notice || "Creating sticker…"}</strong>
        </div>
      ) : notice ? (
        <button
          className="simple-notice"
          type="button"
          onClick={() => setNotice("")}
          role="status"
          aria-live="polite"
        >
          {notice}
        </button>
      ) : null}

      <nav
        className="simple-floating-actions"
        aria-label="Add sticker"
        data-canvas-ui
      >
        <button
          type="button"
          onClick={() => uploadInputRef.current?.click()}
          disabled={isImporting || Boolean(processingStickerId)}
        >
          <Icon name="image" />
          <span>Upload</span>
        </button>
        <button
          type="button"
          className="simple-camera-button"
          onClick={() => setCameraOpen(true)}
          disabled={isImporting || Boolean(processingStickerId)}
        >
          <Icon name="camera" />
          <span>Camera</span>
        </button>
      </nav>

      <input
        ref={uploadInputRef}
        className="simple-hidden-input"
        type="file"
        accept="image/*,.heic,.heif"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void processFile(event.target.files?.[0])}
      />
      <input
        ref={cameraInputRef}
        className="simple-hidden-input"
        type="file"
        accept="image/*"
        capture="environment"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void processFile(event.target.files?.[0])}
      />

      {cameraOpen ? (
        <CameraCapture
          onClose={() => setCameraOpen(false)}
          onCapture={(file) => void processFile(file)}
          onFallback={() => {
            setCameraOpen(false);
            cameraInputRef.current?.click();
          }}
        />
      ) : null}
    </main>
  );
}

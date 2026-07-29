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
  CanvasElement,
  CanvasShapeKind,
  CanvasShapeElement,
  CanvasSticker,
  CanvasTextElement,
  CanvasTool,
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
import { createBackgroundDissolveTexture } from "@/lib/background-dissolve";
import {
  createOutlinedCutout,
  exportStickerWithOutline,
} from "@/lib/sticker-image-processing";
import { exportCanvasToPng } from "@/lib/canvas-export";
import {
  readCanvasProjects,
  readStickerRecords,
  removeStickerRecord,
  replaceStickerRecords,
  saveCanvasProject,
  saveStickerRecord,
  type CanvasProject,
} from "@/lib/sticker-storage";
import { CameraCapture } from "./CameraCapture";
import {
  BackgroundDissolveEffect,
  preloadBackgroundDissolveEffect,
  type BackgroundDissolveEffectData,
} from "./BackgroundDissolveEffect";
import { CanvasBottomToolbar } from "./CanvasBottomToolbar";
import { CanvasElementItem } from "./CanvasElementItem";
import { Icon } from "./Icon";
import { StickerCanvasItem } from "./StickerCanvasItem";

type StickerGesture = {
  kind: StickerGestureKind;
  pointerId: number;
  itemId: string;
  element: HTMLElement;
  startClientX: number;
  startClientY: number;
  startDistance: number;
  startAngle: number;
  centerX: number;
  centerY: number;
  start: CanvasElement;
  latest: CanvasElement;
};

type PointerSample = {
  clientX: number;
  clientY: number;
  pointerId: number;
};

type ShapeDrawingGesture = {
  pointerId: number;
  itemId: string;
  startX: number;
  startY: number;
  startClientX: number;
  startClientY: number;
  start: CanvasShapeElement;
  latest: CanvasShapeElement;
  element: HTMLElement | null;
};

const VIEW_KEY = "simple-sticker-canvas:view";
const SEEDED_KEY = "simple-sticker-canvas:seeded";
const ACTIVE_CANVAS_KEY = "simple-sticker-canvas:active-canvas";
const SEEDED_VERSION = "6";
const EXAMPLE_STICKER_ID = "example-sticker-v1";
const EXAMPLE_STICKER_URL = `${import.meta.env.BASE_URL}sticker-canvas-logo.svg`;
const EXAMPLE_GUIDE_STICKER_ID = "example-guide-sticker-v1";
const EXAMPLE_GUIDE_STICKER_URL = `${import.meta.env.BASE_URL}onboarding-guide-sticker-graffiti-en.png`;
const MIN_ZOOM = 0.08;
const MAX_ZOOM = 6;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function isShapeTool(tool: CanvasTool): tool is CanvasShapeKind {
  return tool !== "select" && tool !== "text";
}

function previewSticker(element: HTMLElement, sticker: CanvasElement) {
  const width = `${sticker.width}px`;
  const height = `${sticker.height}px`;
  if (element.style.width !== width) element.style.width = width;
  if (element.style.height !== height) element.style.height = height;
  element.style.transform = `translate3d(${sticker.x - sticker.width / 2}px, ${sticker.y - sticker.height / 2}px, 0) rotate(${sticker.rotation}deg)`;
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

async function preloadImageUrl(url: string) {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
}

async function fetchSampleImage(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Sample unavailable");
  return response.blob();
}

async function createDefaultCanvasStickers() {
  const [image, guideImage] = await Promise.all([
    fetchSampleImage(EXAMPLE_STICKER_URL),
    fetchSampleImage(EXAMPLE_GUIDE_STICKER_URL),
  ]);
  const createdAt = Date.now();
  return [
    {
      id: EXAMPLE_STICKER_ID,
      type: "image" as const,
      image,
      url: URL.createObjectURL(image),
      width: 280,
      height: 280,
      x: -160,
      y: -24,
      rotation: -4,
      zIndex: 1,
      createdAt,
    },
    {
      id: EXAMPLE_GUIDE_STICKER_ID,
      type: "image" as const,
      image: guideImage,
      url: URL.createObjectURL(guideImage),
      width: 300,
      height: 500,
      x: 150,
      y: 86,
      rotation: 2,
      zIndex: 2,
      oilFilmEnabled: true,
      createdAt,
    },
  ] satisfies CanvasSticker[];
}

export function SimpleStickerCanvas() {
  const viewportRef = useRef<HTMLElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const stickersRef = useRef<CanvasElement[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const processingRef = useRef(false);
  const pendingCutoutRef = useRef<{
    effectId: string;
    stickerId: string;
    updated: CanvasSticker;
    previousUrl: string;
  } | null>(null);
  const saveTimerRef = useRef<Record<string, number>>({});
  const panRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    view: CanvasView;
  } | null>(null);
  const gestureRef = useRef<StickerGesture | null>(null);
  const shapeDrawingRef = useRef<ShapeDrawingGesture | null>(null);
  const touchPointsRef = useRef(new Map<number, { x: number; y: number }>());
  const rafRef = useRef<number | null>(null);
  const pointerSampleRef = useRef<PointerSample | null>(null);
  const pinchRef = useRef<{
    ids: [number, number];
    distance: number;
    view: CanvasView;
    anchorX: number;
    anchorY: number;
  } | null>(null);

  const historyRef = useRef<StickerHistory>({ entries: [], index: -1 });

  const [stickers, setStickers] = useState<CanvasElement[]>([]);
  const [view, setView] = useState<CanvasView>(initialView);
  const viewRef = useRef<CanvasView>(view);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [enteringId, setEnteringId] = useState<string | null>(null);
  const [processingStickerId, setProcessingStickerId] = useState<string | null>(null);
  const [dissolveEffect, setDissolveEffect] =
    useState<BackgroundDissolveEffectData | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isCreatingCanvas, setIsCreatingCanvas] = useState(false);
  const [canvasProjects, setCanvasProjects] = useState<CanvasProject[]>([]);
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<CanvasTool>("select");
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drawingId, setDrawingId] = useState<string | null>(null);

  const pushHistory = useCallback((nextStickers: CanvasElement[]) => {
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
        | CanvasElement[]
        | ((current: CanvasElement[]) => CanvasElement[]),
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

  const commitPendingCutout = useCallback(
    (effectId: string) => {
      const pending = pendingCutoutRef.current;
      if (!pending || pending.effectId !== effectId) return;
      pendingCutoutRef.current = null;
      replaceStickers((current) =>
        current.map((sticker) =>
          sticker.id === pending.stickerId ? pending.updated : sticker,
        ),
      );
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          URL.revokeObjectURL(pending.previousUrl);
        });
      });
    },
    [replaceStickers],
  );

  const finishDissolveEffect = useCallback(
    (id: string) => {
      commitPendingCutout(id);
      setDissolveEffect((current) => (current?.id === id ? null : current));
    },
    [commitPendingCutout],
  );

  const updateStickerStyle = useCallback(
    (
      stickerId: string,
      patch: Partial<StickerStyleOptions>,
      commit = true,
    ) => {
      const current = stickersRef.current.find(
        (sticker) => sticker.id === stickerId,
      );
      if (!current || current.type !== "image") return;
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

  const updateCanvasElementProperties = useCallback(
    (
      elementId: string,
      patch: Partial<CanvasTextElement | CanvasShapeElement>,
      commit = true,
    ) => {
      const current = stickersRef.current.find(
        (element) => element.id === elementId,
      );
      if (!current || (current.type !== "text" && current.type !== "shape")) {
        return;
      }
      const updated = {
        ...current,
        ...patch,
      } as CanvasTextElement | CanvasShapeElement;
      replaceStickers(
        (elements) =>
          elements.map((element) =>
            element.id === elementId ? updated : element,
          ),
        commit,
      );

      if (saveTimerRef.current[elementId]) {
        window.clearTimeout(saveTimerRef.current[elementId]);
      }
      if (commit) {
        delete saveTimerRef.current[elementId];
        void saveStickerRecord(updated).catch(() => setNotice("Save failed"));
      } else {
        saveTimerRef.current[elementId] = window.setTimeout(() => {
          void saveStickerRecord(updated).catch(() =>
            setNotice("Save failed"),
          );
          delete saveTimerRef.current[elementId];
        }, 240);
      }
    },
    [replaceStickers],
  );

  useEffect(() => {
    let disposed = false;
    void readStickerRecords()
      .then(async (records) => {
        if (disposed) return;
        let projects = await readCanvasProjects();
        const storedCanvasId = localStorage.getItem(ACTIVE_CANVAS_KEY);
        let currentProject = projects.find(
          (project) => project.id === storedCanvasId,
        );
        if (!currentProject) {
          const timestamp = Date.now();
          currentProject = {
            id: crypto.randomUUID(),
            name: `Canvas ${projects.length + 1}`,
            createdAt: timestamp,
            updatedAt: timestamp,
            elements: records,
          };
          await saveCanvasProject(currentProject);
          projects = [...projects, currentProject];
          localStorage.setItem(ACTIVE_CANVAS_KEY, currentProject.id);
        }
        if (disposed) return;
        setCanvasProjects(projects);
        setActiveCanvasId(currentProject.id);
        const seededVersion = localStorage.getItem(SEEDED_KEY);
        const existingExample = records.find(
          (record) =>
            record.type === "image" &&
            record.id === EXAMPLE_STICKER_ID,
        );
        const existingGuide = records.find(
          (record) =>
            record.type === "image" &&
            record.id === EXAMPLE_GUIDE_STICKER_ID,
        );
        const hasOnlyDefaultSamples = records.every(
          (record) =>
            record.id === EXAMPLE_STICKER_ID ||
            record.id === EXAMPLE_GUIDE_STICKER_ID,
        );
        let restoredRecords = records;

        if (existingExample && seededVersion !== SEEDED_VERSION) {
          const image = await fetchSampleImage(EXAMPLE_STICKER_URL);
          const shouldAddGuide = !existingGuide && records.length === 1;
          const upgradedExample = {
            ...existingExample,
            image,
            width: 280,
            height: 280,
            ...(hasOnlyDefaultSamples ? { x: -160, y: -24 } : {}),
          };
          await saveStickerRecord(upgradedExample);
          const guide = shouldAddGuide
            ? {
                id: EXAMPLE_GUIDE_STICKER_ID,
                type: "image" as const,
                image: await fetchSampleImage(EXAMPLE_GUIDE_STICKER_URL),
                width: 300,
                height: 500,
                x: 150,
                y: 86,
                rotation: 2,
                zIndex: 2,
                oilFilmEnabled: true,
                createdAt: Date.now(),
              }
            : existingGuide && hasOnlyDefaultSamples
              ? {
                  ...existingGuide,
                  width: 300,
                  height: 500,
                  x: 150,
                  y: 86,
                  oilFilmEnabled: true,
                }
            : null;
          if (guide) await saveStickerRecord(guide);
          localStorage.setItem(SEEDED_KEY, SEEDED_VERSION);
          restoredRecords = [
            ...records.map((record) =>
              record.id === EXAMPLE_STICKER_ID
                ? upgradedExample
                : record.id === EXAMPLE_GUIDE_STICKER_ID && guide
                  ? guide
                  : record,
            ),
            ...(shouldAddGuide && guide ? [guide] : []),
          ];
        }

        if (!restoredRecords.length && seededVersion === null) {
          const defaults = await createDefaultCanvasStickers();
          await Promise.all(defaults.map((sticker) => saveStickerRecord(sticker)));
          localStorage.setItem(SEEDED_KEY, SEEDED_VERSION);
          if (disposed) {
            defaults.forEach((sticker) => URL.revokeObjectURL(sticker.url));
            return;
          }
          replaceStickers(defaults, false);
          historyRef.current = createStickerHistory(defaults);
          const updatedProject = {
            ...currentProject,
            updatedAt: Date.now(),
            elements: defaults,
          };
          await saveCanvasProject(updatedProject);
          setCanvasProjects((current) =>
            current.map((project) =>
              project.id === updatedProject.id ? updatedProject : project,
            ),
          );
          return;
        }
        const restored = restoredRecords
          .sort((left, right) => left.zIndex - right.zIndex)
          .map(
            (record): CanvasElement =>
              record.type === "image"
                ? {
                    ...record,
                    url: URL.createObjectURL(record.image),
                  }
                : { ...record },
          );
        if (!disposed) {
          replaceStickers(restored, false);
          historyRef.current = createStickerHistory(restored);
          const updatedProject = {
            ...currentProject,
            updatedAt: Date.now(),
            elements: restoredRecords,
          };
          await saveCanvasProject(updatedProject);
          setCanvasProjects((current) =>
            current.map((project) =>
              project.id === updatedProject.id ? updatedProject : project,
            ),
          );
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
      stickersRef.current.forEach((sticker) => {
        if (sticker.type === "image") URL.revokeObjectURL(sticker.url);
      });
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
      update: Partial<
        Pick<CanvasElement, "x" | "y" | "width" | "height" | "rotation" | "zIndex">
      >,
      recordHistory = false,
    ) => {
      replaceStickers(
        (current) =>
          current.map((sticker) =>
            sticker.id === id
              ? ({ ...sticker, ...update } as CanvasElement)
              : sticker,
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
      const pending = pendingCutoutRef.current;
      if (pending) commitPendingCutout(pending.effectId);
      processingRef.current = true;
      setDissolveEffect(null);
      setProcessingStickerId(sticker.id);
      let createdUrl: string | null = null;
      try {
        const result = await removeImageBackground(sticker.image);

        const [cutout, dissolveTexture] = await Promise.all([
          createOutlinedCutout(
            result.pixels,
            result.width,
            result.height,
          ),
          createBackgroundDissolveTexture(
            sticker.image,
            result.pixels,
            result.width,
            result.height,
          ).catch(() => null),
          preloadBackgroundDissolveEffect().catch(() => undefined),
        ]);

        const ratio = cutout.width / cutout.height;
        const newHeight = sticker.width / ratio;
        const newUrl = URL.createObjectURL(cutout.blob);
        createdUrl = newUrl;
        await preloadImageUrl(newUrl);

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
        const viewport = viewportRef.current?.getBoundingClientRect();
        const currentView = viewRef.current;
        if (viewport && dissolveTexture) {
          const effectId = `${sticker.id}:${Date.now()}`;
          pendingCutoutRef.current = {
            effectId,
            stickerId: sticker.id,
            updated,
            previousUrl: sticker.url,
          };
          setDissolveEffect({
            ...dissolveTexture,
            id: effectId,
            centerX:
              viewport.left +
              viewport.width / 2 +
              (sticker.x - currentView.x) * currentView.zoom,
            centerY:
              viewport.top +
              viewport.height / 2 +
              (sticker.y - currentView.y) * currentView.zoom,
            displayWidth: sticker.width * currentView.zoom,
            displayHeight: sticker.height * currentView.zoom,
            rotation: sticker.rotation,
          });
        } else {
          replaceStickers((current) =>
            current.map((s) => (s.id === sticker.id ? updated : s)),
          );
          URL.revokeObjectURL(sticker.url);
        }
        setNotice("Cutout ready");
        createdUrl = null;
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
    [commitPendingCutout, replaceStickers],
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
        const image = isHeicFile(file) ? await convertHeicToJpeg(file) : file;
        const aspect = await readImageAspect(image);

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
          type: "image",
          image,
          url,
          width,
          height,
          x: viewRef.current.x,
          y: viewRef.current.y,
          rotation: 0,
          zIndex: topZ + 1,
          createdAt: Date.now(),
          outlineWidth: 0,
          outlineColor: "#ffffff",
          oilFilmEnabled: false,
          isCutout: false,
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
        setNotice("Photo added — use Cutout when ready");
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
      sticker: CanvasElement,
      kind: StickerGestureKind,
    ) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = viewportRef.current?.getBoundingClientRect();
      const element = event.currentTarget.closest<HTMLElement>(
        "[data-sticker], [data-canvas-element]",
      );
      if (!rect || !element) return;
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
        element,
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
        latest: lifted,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [selectSticker, updateSticker],
  );

  const moveStickerGesture = useCallback(
    (sample: PointerSample) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== sample.pointerId) return;
      let latest: CanvasElement;
      if (gesture.kind === "move") {
        latest = {
          ...gesture.start,
          x:
            gesture.start.x +
            (sample.clientX - gesture.startClientX) / viewRef.current.zoom,
          y:
            gesture.start.y +
            (sample.clientY - gesture.startClientY) / viewRef.current.zoom,
        };
      } else if (gesture.kind === "resize") {
        const distance = Math.max(
          1,
          Math.hypot(
            sample.clientX - gesture.centerX,
            sample.clientY - gesture.centerY,
          ),
        );
        const factor = clamp(distance / gesture.startDistance, 0.18, 8);
        latest = {
          ...gesture.start,
          width: gesture.start.width * factor,
          height: gesture.start.height * factor,
        };
      } else {
        const angle = Math.atan2(
          sample.clientY - gesture.centerY,
          sample.clientX - gesture.centerX,
        );
        latest = {
          ...gesture.start,
          rotation:
            gesture.start.rotation +
            ((angle - gesture.startAngle) * 180) / Math.PI,
        };
      }
      gesture.latest = latest;
      previewSticker(gesture.element, latest);
    },
    [],
  );

  const finishStickerGesture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      moveStickerGesture({
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
      });
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      pointerSampleRef.current = null;
      gestureRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const next = stickersRef.current.map((item) =>
        item.id === gesture.itemId ? gesture.latest : item,
      );
      replaceStickers(next, false);
      void saveStickerRecord(gesture.latest).catch(() =>
        setNotice("Save failed"),
      );
      pushHistory(next);
    },
    [moveStickerGesture, pushHistory, replaceStickers],
  );

  const deleteSticker = useCallback(
    (sticker: CanvasElement) => {
      if (saveTimerRef.current[sticker.id]) {
        window.clearTimeout(saveTimerRef.current[sticker.id]);
        delete saveTimerRef.current[sticker.id];
      }
      void removeStickerRecord(sticker.id)
        .then(() => {
          selectSticker(null);
          setEditingId((current) =>
            current === sticker.id ? null : current,
          );
          replaceStickers((current) =>
            current.filter((item) => item.id !== sticker.id),
          );
          if (sticker.type === "image") {
            window.setTimeout(() => URL.revokeObjectURL(sticker.url), 0);
          }
        })
        .catch(() => setNotice("Delete failed"));
    },
    [replaceStickers, selectSticker],
  );

  const startElementEditing = useCallback(
    (id: string) => {
      selectSticker(id);
      setEditingId(id);
      setActiveTool("select");
    },
    [selectSticker],
  );

  const commitElementText = useCallback(
    (id: string, text: string) => {
      const current = stickersRef.current.find(
        (element) => element.id === id,
      );
      if (!current || current.type !== "text") {
        setEditingId(null);
        return;
      }
      if (!text.trim()) {
        deleteSticker(current);
        return;
      }
      const updated = { ...current, text } as CanvasTextElement;
      replaceStickers((elements) =>
        elements.map((element) =>
          element.id === id ? updated : element,
        ),
      );
      setEditingId(null);
      void saveStickerRecord(updated).catch(() =>
        setNotice("Save failed"),
      );
    },
    [deleteSticker, replaceStickers],
  );

  const cancelElementEditing = useCallback(
    (id: string) => {
      const current = stickersRef.current.find(
        (element) => element.id === id,
      );
      setEditingId(null);
      if (current?.type === "text" && !current.text.trim()) {
        deleteSticker(current);
      }
    },
    [deleteSticker],
  );

  const createTextElement = useCallback(
    (clientX: number, clientY: number) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const currentView = viewRef.current;
      const x =
        currentView.x +
        (clientX - rect.left - rect.width / 2) / currentView.zoom;
      const y =
        currentView.y +
        (clientY - rect.top - rect.height / 2) / currentView.zoom;
      const topZ = stickersRef.current.reduce(
        (largest, element) => Math.max(largest, element.zIndex),
        0,
      );
      const base = {
        id: crypto.randomUUID(),
        x,
        y,
        rotation: 0,
        zIndex: topZ + 1,
        createdAt: Date.now(),
      };
      const element: CanvasTextElement = {
        ...base,
        type: "text",
        width: 280 / currentView.zoom,
        height: 72 / currentView.zoom,
        text: "",
        fontSize: 32 / currentView.zoom,
        fontWeight: 600,
        color: "#29251f",
        backgroundColor: "transparent",
        borderColor: "#2d2923",
        borderWidth: 0,
        borderRadius: 8 / currentView.zoom,
        textAlign: "left",
      };

      replaceStickers((elements) => [...elements, element]);
      selectSticker(element.id);
      setActiveTool("select");
      setShapeMenuOpen(false);
      setEditingId(element.id);
      void saveStickerRecord(element).catch(() =>
        setNotice("Save failed"),
      );
    },
    [replaceStickers, selectSticker],
  );

  const startShapeDrawing = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      shape: CanvasShapeKind,
    ) => {
      if (event.button !== 0) return;
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      event.preventDefault();
      const currentView = viewRef.current;
      const startX =
        currentView.x +
        (event.clientX - rect.left - rect.width / 2) / currentView.zoom;
      const startY =
        currentView.y +
        (event.clientY - rect.top - rect.height / 2) / currentView.zoom;
      const topZ = stickersRef.current.reduce(
        (largest, element) => Math.max(largest, element.zIndex),
        0,
      );
      const element: CanvasShapeElement = {
        id: crypto.randomUUID(),
        type: "shape",
        shape,
        x: startX,
        y: startY,
        width: 1 / currentView.zoom,
        height: shape === "line" ? 14 / currentView.zoom : 1 / currentView.zoom,
        rotation: 0,
        zIndex: topZ + 1,
        createdAt: Date.now(),
        fillColor: "#f3ead8",
        fillEnabled: false,
        strokeColor: "#2d2923",
        strokeWidth: 2 / currentView.zoom,
      };
      replaceStickers((elements) => [...elements, element], false);
      selectSticker(element.id);
      setEditingId(null);
      setDrawingId(element.id);
      shapeDrawingRef.current = {
        pointerId: event.pointerId,
        itemId: element.id,
        startX,
        startY,
        startClientX: event.clientX,
        startClientY: event.clientY,
        start: element,
        latest: element,
        element: null,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [replaceStickers, selectSticker],
  );

  const moveShapeDrawing = useCallback((sample: PointerSample) => {
    const drawing = shapeDrawingRef.current;
    if (!drawing || drawing.pointerId !== sample.pointerId) return;
    const zoom = viewRef.current.zoom;
    const deltaX = (sample.clientX - drawing.startClientX) / zoom;
    const deltaY = (sample.clientY - drawing.startClientY) / zoom;
    let latest: CanvasShapeElement;
    if (drawing.start.shape === "line") {
      const length = Math.max(1 / zoom, Math.hypot(deltaX, deltaY));
      latest = {
        ...drawing.start,
        x: drawing.startX + deltaX / 2,
        y: drawing.startY + deltaY / 2,
        width: length,
        height: Math.max(14 / zoom, drawing.start.strokeWidth * 4),
        rotation: (Math.atan2(deltaY, deltaX) * 180) / Math.PI,
      };
    } else {
      latest = {
        ...drawing.start,
        x: drawing.startX + deltaX / 2,
        y: drawing.startY + deltaY / 2,
        width: Math.max(1 / zoom, Math.abs(deltaX)),
        height: Math.max(1 / zoom, Math.abs(deltaY)),
      };
    }
    drawing.latest = latest;
    drawing.element ??= document.querySelector<HTMLElement>(
      `[data-element-id="${drawing.itemId}"]`,
    );
    if (drawing.element) previewSticker(drawing.element, latest);
  }, []);

  const finishShapeDrawing = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drawing = shapeDrawingRef.current;
      if (!drawing || drawing.pointerId !== event.pointerId) return;
      moveShapeDrawing({
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
      });
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      pointerSampleRef.current = null;
      shapeDrawingRef.current = null;
      setDrawingId(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      const drawnDistance = Math.hypot(
        event.clientX - drawing.startClientX,
        event.clientY - drawing.startClientY,
      );
      if (drawnDistance < 6) {
        replaceStickers(
          (elements) =>
            elements.filter((element) => element.id !== drawing.itemId),
          false,
        );
        selectSticker(null);
      } else {
        const next = stickersRef.current.map((element) =>
          element.id === drawing.itemId ? drawing.latest : element,
        );
        replaceStickers(next, false);
        pushHistory(next);
        void saveStickerRecord(drawing.latest).catch(() =>
          setNotice("Save failed"),
        );
      }
      setActiveTool("select");
      setShapeMenuOpen(false);
    },
    [moveShapeDrawing, pushHistory, replaceStickers, selectSticker],
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

  const exportCanvas = useCallback(async () => {
    if (!stickersRef.current.length) {
      setNotice("Canvas is empty");
      return;
    }
    setIsExporting(true);
    setNotice("");
    try {
      const exported = await exportCanvasToPng(stickersRef.current);
      const url = URL.createObjectURL(exported.blob);
      const anchor = document.createElement("a");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      anchor.href = url;
      anchor.download = `sticker-canvas-${timestamp}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Canvas export failed",
      );
    } finally {
      setIsExporting(false);
    }
  }, []);

  const downloadCanvas = useCallback(() => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLTextAreaElement) {
      activeElement.blur();
      window.setTimeout(() => void exportCanvas(), 0);
      return;
    }
    void exportCanvas();
  }, [exportCanvas]);

  const createNewCanvas = useCallback(async () => {
    setIsCreatingCanvas(true);
    setNotice("");
    try {
      const defaults = await createDefaultCanvasStickers();
      const previous = stickersRef.current;
      const now = Date.now();
      const currentProject = canvasProjects.find(
        (project) => project.id === activeCanvasId,
      );
      const nextProject: CanvasProject = {
        id: crypto.randomUUID(),
        name: `Canvas ${canvasProjects.length + 1}`,
        createdAt: now,
        updatedAt: now,
        elements: defaults,
      };
      const archivedProject = currentProject
        ? {
            ...currentProject,
            updatedAt: now,
            elements: previous,
          }
        : null;
      await Promise.all([
        ...(archivedProject ? [saveCanvasProject(archivedProject)] : []),
        saveCanvasProject(nextProject),
      ]);
      await replaceStickerRecords(defaults);
      replaceStickers(defaults, false);
      previous.forEach((sticker) => {
        if (sticker.type === "image") URL.revokeObjectURL(sticker.url);
      });
      historyRef.current = createStickerHistory(defaults);
      localStorage.setItem(SEEDED_KEY, SEEDED_VERSION);
      localStorage.setItem(ACTIVE_CANVAS_KEY, nextProject.id);
      setCanvasProjects((current) => [
        ...current.map((project) =>
          project.id === archivedProject?.id ? archivedProject : project,
        ),
        nextProject,
      ]);
      setActiveCanvasId(nextProject.id);
      setHistoryOpen(false);
      setActiveTool("select");
      setShapeMenuOpen(false);
      setEditingId(null);
      setDrawingId(null);
      selectSticker(null);
      setNotice("New canvas ready");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "New canvas failed");
    } finally {
      setIsCreatingCanvas(false);
    }
  }, [activeCanvasId, canvasProjects, replaceStickers, selectSticker]);

  const openCanvasProject = useCallback(
    async (projectId: string) => {
      if (projectId === activeCanvasId) {
        setHistoryOpen(false);
        return;
      }
      const targetProject = canvasProjects.find(
        (project) => project.id === projectId,
      );
      if (!targetProject) return;
      setIsCreatingCanvas(true);
      setNotice("");
      try {
        const now = Date.now();
        const currentProject = canvasProjects.find(
          (project) => project.id === activeCanvasId,
        );
        const archivedProject = currentProject
          ? {
              ...currentProject,
              updatedAt: now,
              elements: stickersRef.current,
            }
          : null;
        const openedProject = { ...targetProject, updatedAt: now };
        await Promise.all([
          ...(archivedProject ? [saveCanvasProject(archivedProject)] : []),
          saveCanvasProject(openedProject),
        ]);
        const restored = [...openedProject.elements]
          .sort((left, right) => left.zIndex - right.zIndex)
          .map(
            (record): CanvasElement =>
              record.type === "image"
                ? { ...record, url: URL.createObjectURL(record.image) }
                : { ...record },
          );
        const previous = stickersRef.current;
        await replaceStickerRecords(restored);
        replaceStickers(restored, false);
        previous.forEach((sticker) => {
          if (sticker.type === "image") URL.revokeObjectURL(sticker.url);
        });
        historyRef.current = createStickerHistory(restored);
        localStorage.setItem(ACTIVE_CANVAS_KEY, openedProject.id);
        setCanvasProjects((current) =>
          current.map((project) =>
            project.id === archivedProject?.id
              ? archivedProject
              : project.id === openedProject.id
                ? openedProject
                : project,
          ),
        );
        setActiveCanvasId(openedProject.id);
        setHistoryOpen(false);
        setActiveTool("select");
        setShapeMenuOpen(false);
        setEditingId(null);
        setDrawingId(null);
        selectSticker(null);
        setNotice(`${openedProject.name} opened`);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Canvas open failed");
      } finally {
        setIsCreatingCanvas(false);
      }
    },
    [activeCanvasId, canvasProjects, replaceStickers, selectSticker],
  );

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
        setActiveTool("select");
        setShapeMenuOpen(false);
        setEditingId(null);
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

      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const toolByKey: Partial<Record<string, CanvasTool>> = {
          t: "text",
          r: "rectangle",
          o: "ellipse",
          g: "triangle",
          d: "diamond",
          l: "line",
          v: "select",
        };
        const tool = toolByKey[event.key.toLowerCase()];
        if (tool) {
          event.preventDefault();
          setActiveTool(tool);
          setShapeMenuOpen(false);
          if (tool === "select") setEditingId(null);
          return;
        }
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
    if (
      editingId &&
      !(event.target as HTMLElement).closest("textarea[aria-label='Edit text']")
    ) {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLTextAreaElement) {
        activeElement.blur();
      } else {
        setEditingId(null);
      }
    }
    if ((event.target as Element).closest("[data-canvas-ui]")) return;
    if (activeTool === "text" && event.button === 0) {
      event.preventDefault();
      createTextElement(event.clientX, event.clientY);
      return;
    }
    if (isShapeTool(activeTool) && event.button === 0) {
      startShapeDrawing(event, activeTool);
      return;
    }

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
      (event.target as HTMLElement).closest(
        "[data-sticker], [data-canvas-element]",
      )
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
      pointerSampleRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
      };
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const sample = pointerSampleRef.current;
        pointerSampleRef.current = null;
        if (!sample) return;
        if (shapeDrawingRef.current) {
          moveShapeDrawing(sample);
        } else if (gestureRef.current) {
          moveStickerGesture(sample);
        } else {
          moveViewportPointer({
            ...sample,
            preventDefault: () => {},
          } as unknown as ReactPointerEvent<HTMLElement>);
        }
      });
    },
    [moveShapeDrawing, moveStickerGesture, moveViewportPointer],
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
      if (shapeDrawingRef.current) {
        finishShapeDrawing(event);
      } else if (gestureRef.current) {
        finishStickerGesture(event);
      } else {
        finishViewportPointer(event);
      }
    },
    [finishShapeDrawing, finishStickerGesture, finishViewportPointer],
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
      data-active-tool={activeTool}
      onPointerDown={startViewportPointer}
      onPointerMove={moveGlobalPointer}
      onPointerUp={finishGlobalPointer}
      onPointerCancel={finishGlobalPointer}
      onWheel={handleWheel}
    >
      <div className="simple-canvas-grid" style={gridStyle} />
      <div className="simple-sticker-world" style={worldStyle}>
        {stickers.map((sticker) =>
          sticker.type === "image" ? (
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
          ) : (
            <CanvasElementItem
              key={sticker.id}
              element={sticker}
              selected={selectedId === sticker.id}
              editing={editingId === sticker.id}
              drawing={drawingId === sticker.id}
              onGestureStart={startStickerGesture}
              onSelect={selectSticker}
              onDelete={deleteSticker}
              onStartEditing={startElementEditing}
              onCommitText={commitElementText}
              onCancelEditing={cancelElementEditing}
              onStyleChange={updateCanvasElementProperties}
            />
          ),
        )}
      </div>

      {dissolveEffect ? (
        <BackgroundDissolveEffect
          effect={dissolveEffect}
          onReady={commitPendingCutout}
          onComplete={finishDissolveEffect}
        />
      ) : null}

      {!stickers.length ? (
        <p className="simple-empty-hint">
          Add an image or text, or drag to draw a shape
        </p>
      ) : null}

      {isImporting || isExporting || isCreatingCanvas ? (
        <div className="simple-processing" role="status" aria-live="polite">
          <span className="simple-processing-spinner" aria-hidden="true" />
          <strong>
            {notice ||
              (isCreatingCanvas
                ? "Creating new canvas…"
                : isExporting
                  ? "Exporting canvas…"
                  : "Creating sticker…")}
          </strong>
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

      {historyOpen ? (
        <>
          <button
            className="simple-canvas-history-backdrop"
            type="button"
            data-canvas-ui
            aria-label="Close canvas history"
            onClick={() => setHistoryOpen(false)}
          />
          <aside className="simple-canvas-history" data-canvas-ui aria-label="Canvas history">
            <div className="simple-canvas-history-header">
              <strong>Canvas history</strong>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                aria-label="Close canvas history"
                title="Close"
              >
                <Icon name="close" />
              </button>
            </div>
            <div className="simple-canvas-history-list">
              {[...canvasProjects]
                .sort((left, right) => right.updatedAt - left.updatedAt)
                .map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    disabled={isCreatingCanvas || project.id === activeCanvasId}
                    data-active={project.id === activeCanvasId}
                    onClick={() => void openCanvasProject(project.id)}
                  >
                    <span>{project.name}</span>
                    <small>
                      {new Date(project.updatedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </small>
                  </button>
                ))}
            </div>
          </aside>
        </>
      ) : null}

      <div className="simple-canvas-actions" data-canvas-ui aria-label="Canvas actions">
        <button
          type="button"
          disabled={isImporting || isExporting || isCreatingCanvas || Boolean(processingStickerId)}
          onClick={() => setHistoryOpen((current) => !current)}
          aria-label="Canvas history"
          title="Canvas history"
          data-active={historyOpen}
        >
          <Icon name="history" />
          <span>Canvas history</span>
        </button>
        <button
          type="button"
          disabled={isImporting || isExporting || isCreatingCanvas || Boolean(processingStickerId)}
          onClick={() => void createNewCanvas()}
          aria-label="New canvas"
          title="New canvas"
        >
          <Icon name="plus" />
          <span>New canvas</span>
        </button>
        <button
          type="button"
          disabled={isImporting || isExporting || isCreatingCanvas || Boolean(processingStickerId)}
          onClick={downloadCanvas}
          aria-label="Download canvas"
          title="Download canvas"
        >
          <Icon name="download" />
          <span>Download canvas</span>
        </button>
      </div>

      <CanvasBottomToolbar
        activeTool={activeTool}
        disabled={isImporting || isExporting || isCreatingCanvas || Boolean(processingStickerId)}
        shapeMenuOpen={shapeMenuOpen}
        onUpload={() => {
          setActiveTool("select");
          setShapeMenuOpen(false);
          uploadInputRef.current?.click();
        }}
        onCamera={() => {
          setActiveTool("select");
          setShapeMenuOpen(false);
          setCameraOpen(true);
        }}
        onSelectTool={(tool) => {
          setActiveTool(tool);
          setShapeMenuOpen(false);
          setEditingId(null);
          selectSticker(null);
        }}
        onToggleShapeMenu={() => {
          setShapeMenuOpen((current) => !current);
          setEditingId(null);
        }}
      />

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

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type {
  CanvasCropHandle,
  CanvasElement,
  CanvasImageCrop,
  CanvasShapeKind,
  CanvasShapeElement,
  CanvasSticker,
  CanvasTextElement,
  CanvasTool,
  CanvasView,
  StickerGestureKind,
  StickerStyleOptions,
} from "@/lib/canvas-types";
import {
  DEFAULT_IMAGE_CROP,
  DEFAULT_STICKER_CORNER_RADIUS,
  DEFAULT_STICKER_SHADOW_BLUR,
  MIN_IMAGE_CROP_SIZE,
  normalizeCanvasImageCrop,
} from "@/lib/canvas-types";
import { removeImageBackground } from "@/lib/background-removal";
import { getPinchView, type PinchGesture, type PointerSample } from "@/lib/canvas-viewport";
import { createCanvasTaskScope, type CanvasTask } from "@/lib/canvas-task";
import {
  appendStickerHistory,
  equalCanvasElementRecords,
  createStickerHistory,
  moveStickerHistory,
  restoreStickerSnapshot,
  type StickerHistory,
} from "@/lib/canvas-history";
import { convertHeicToJpeg, isHeicFile } from "@/lib/heic";
import { createBackgroundDissolveTexture } from "@/lib/background-dissolve";
import {
  cropImageBlob,
  createOutlinedCutout,
  exportStickerWithOutline,
} from "@/lib/sticker-image-processing";
import { exportCanvasToPng } from "@/lib/canvas-export";
import {
  readCanvasBackground,
  readCanvasProjects,
  readStickerRecords,
  removeStickerRecord,
  replaceStickerRecords,
  saveCanvasBackground,
  saveCanvasProject,
  switchCanvasProject,
  saveStickerRecord,
  type CanvasProject,
} from "@/lib/sticker-storage";
import type { CanvasBackgroundConfig } from "@/lib/canvas-types";
import { CameraCapture } from "./CameraCapture";
import {
  BackgroundDissolveEffect,
  preloadBackgroundDissolveEffect,
  type BackgroundDissolveEffectData,
} from "./BackgroundDissolveEffect";
import { CanvasBackgroundInspector } from "./CanvasBackgroundInspector";
import { CanvasBackgroundMenu } from "./CanvasBackgroundMenu";
import { CanvasBottomToolbar } from "./CanvasBottomToolbar";
import { CanvasElementItem } from "./CanvasElementItem";
import { CanvasInspector } from "./CanvasInspector";
import { CanvasTopBar } from "./CanvasTopBar";
import { CanvasZoomControls } from "./CanvasZoomControls";
import { Icon } from "./Icon";
import { StickerCanvasItem } from "./StickerCanvasItem";

type StickerGesture = {
  kind: StickerGestureKind;
  cropHandle?: CanvasCropHandle;
  startCrop: CanvasImageCrop;
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

type CanvasDropPoint = {
  clientX: number;
  clientY: number;
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
const DROP_STACK_OFFSET = 32;
const NOTICE_DURATION_MS = 4_200;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function isShapeTool(tool: CanvasTool): tool is CanvasShapeKind {
  return tool !== "select" && tool !== "text";
}

function isSupportedImageFile(file: File) {
  return (
    file.type.startsWith("image/") ||
    /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)
  );
}

function isFileTransfer(dataTransfer: DataTransfer) {
  return (
    dataTransfer.files.length > 0 ||
    Array.from(dataTransfer.items).some((item) => item.kind === "file") ||
    Array.from(dataTransfer.types).includes("Files")
  );
}

function getDroppedFiles(dataTransfer: DataTransfer) {
  const files = Array.from(dataTransfer.files);
  if (files.length) return files;
  return Array.from(dataTransfer.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

function previewSticker(element: HTMLElement, sticker: CanvasElement) {
  const width = `${sticker.width}px`;
  const height = `${sticker.height}px`;
  if (element.style.width !== width) element.style.width = width;
  if (element.style.height !== height) element.style.height = height;
  element.style.transform = `translate3d(${sticker.x - sticker.width / 2}px, ${sticker.y - sticker.height / 2}px, 0) rotate(${sticker.rotation}deg)`;
  if (sticker.type === "image") {
    const crop = normalizeCanvasImageCrop(sticker.crop) ?? DEFAULT_IMAGE_CROP;
    element.style.setProperty(
      "--image-crop-left",
      `${-(crop.x / crop.width) * 100}%`,
    );
    element.style.setProperty(
      "--image-crop-top",
      `${-(crop.y / crop.height) * 100}%`,
    );
    element.style.setProperty(
      "--image-crop-width",
      `${(1 / crop.width) * 100}%`,
    );
    element.style.setProperty(
      "--image-crop-height",
      `${(1 / crop.height) * 100}%`,
    );
    element.dataset.cropped =
      crop.x > 0 ||
      crop.y > 0 ||
      crop.width < 1 ||
      crop.height < 1
        ? "true"
        : "false";
  }
}

function getImageCrop(value: unknown): CanvasImageCrop {
  return normalizeCanvasImageCrop(value) ?? DEFAULT_IMAGE_CROP;
}

function updateCropGesture(
  gesture: StickerGesture,
  sample: PointerSample,
  zoom: number,
): CanvasSticker | null {
  if (
    gesture.kind !== "crop" ||
    gesture.start.type !== "image" ||
    !gesture.cropHandle
  ) {
    return null;
  }

  const start = gesture.start;
  const angle = (start.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const deltaX = (sample.clientX - gesture.centerX) / zoom;
  const deltaY = (sample.clientY - gesture.centerY) / zoom;
  const localX = deltaX * cos + deltaY * sin + start.width / 2;
  const localY = -deltaX * sin + deltaY * cos + start.height / 2;
  const minWidth = Math.min(
    start.width,
    Math.max(
      1 / zoom,
      Math.min(24 / zoom, start.width * 0.08),
    ),
  );
  const minHeight = Math.min(
    start.height,
    Math.max(
      1 / zoom,
      Math.min(24 / zoom, start.height * 0.08),
    ),
  );
  let left = 0;
  let top = 0;
  let right = start.width;
  let bottom = start.height;

  if (gesture.cropHandle.includes("w")) {
    left = clamp(localX, 0, start.width - minWidth);
  } else if (gesture.cropHandle.includes("e")) {
    right = clamp(localX, minWidth, start.width);
  }
  if (gesture.cropHandle.includes("n")) {
    top = clamp(localY, 0, start.height - minHeight);
  } else if (gesture.cropHandle.includes("s")) {
    bottom = clamp(localY, minHeight, start.height);
  }

  const startCrop = gesture.startCrop;
  const crop = normalizeCanvasImageCrop({
    x: startCrop.x + (left / start.width) * startCrop.width,
    y: startCrop.y + (top / start.height) * startCrop.height,
    width: ((right - left) / start.width) * startCrop.width,
    height: ((bottom - top) / start.height) * startCrop.height,
  }) ?? {
    x: 0,
    y: 0,
    width: MIN_IMAGE_CROP_SIZE,
    height: MIN_IMAGE_CROP_SIZE,
  };
  const offsetX = (left + right) / 2 - start.width / 2;
  const offsetY = (top + bottom) / 2 - start.height / 2;

  return {
    ...start,
    x: start.x + offsetX * cos - offsetY * sin,
    y: start.y + offsetX * sin + offsetY * cos,
    width: right - left,
    height: bottom - top,
    crop,
  };
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
  if (!response.ok) throw new Error("Example is unavailable");
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
      cornerRadius: DEFAULT_STICKER_CORNER_RADIUS,
      cornerRadiusEnabled: true,
      shadowEnabled: true,
      shadowBlur: DEFAULT_STICKER_SHADOW_BLUR,
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
      cornerRadius: DEFAULT_STICKER_CORNER_RADIUS,
      cornerRadiusEnabled: true,
      shadowEnabled: true,
      shadowBlur: DEFAULT_STICKER_SHADOW_BLUR,
      createdAt,
    },
  ] satisfies CanvasSticker[];
}

function applyViewTransform(
  world: HTMLElement | null,
  grid: HTMLElement | null,
  v: CanvasView,
) {
  if (world) {
    world.style.transform = `translate3d(calc(50vw - ${v.x * v.zoom}px), calc(50dvh - ${v.y * v.zoom}px), 0) scale(${v.zoom})`;
    world.style.setProperty("--simple-control-scale", String(1 / v.zoom));
  }
  if (grid) {
    grid.style.setProperty("--grid-size", `${28 * v.zoom}px`);
    grid.style.setProperty("--grid-x", `${-v.x * v.zoom}px`);
    grid.style.setProperty("--grid-y", `${-v.y * v.zoom}px`);
  }
}

export function SimpleStickerCanvas() {
  const viewportRef = useRef<HTMLElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const stickersRef = useRef<CanvasElement[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const processingRef = useRef(false);
  const activeCanvasIdRef = useRef<string | null>(null);
  const projectTransitionRef = useRef(false);
  const cutoutTasksRef = useRef(createCanvasTaskScope<CanvasElement>());
  const cutoutOperationRef = useRef<CanvasTask<CanvasElement> | null>(null);
  const pendingCutoutRef = useRef<{
    task: CanvasTask<CanvasElement>;
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
  const externalDragDepthRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const pointerSampleRef = useRef<PointerSample | null>(null);
  const pinchRef = useRef<PinchGesture | null>(null);

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
  const [isExternalDragActive, setIsExternalDragActive] = useState(false);
  const [activeTool, setActiveTool] = useState<CanvasTool>("select");
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [cropEditingId, setCropEditingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [historyPosition, setHistoryPosition] = useState({
    index: -1,
    length: 0,
  });
  const [background, setBackground] =
    useState<CanvasBackgroundConfig>(readCanvasBackground);
  const [backgroundMenuOpen, setBackgroundMenuOpen] = useState(false);
  const [backgroundInspectorOpen, setBackgroundInspectorOpen] = useState(false);

  const activateCanvas = useCallback((id: string) => {
    activeCanvasIdRef.current = id;
    setActiveCanvasId(id);
  }, []);

  const cancelCanvasTasks = useCallback((elementId?: string) => {
    if (!cutoutTasksRef.current.cancel(elementId)) return;
    const wasProcessing = cutoutOperationRef.current !== null;
    cutoutOperationRef.current = null;
    if (wasProcessing) processingRef.current = false;
    const pending = pendingCutoutRef.current;
    if (pending) URL.revokeObjectURL(pending.updated.url);
    pendingCutoutRef.current = null;
    setDissolveEffect(null);
    setProcessingStickerId(null);
  }, []);

  const clearPendingSaves = useCallback(() => {
    Object.values(saveTimerRef.current).forEach((timer) => window.clearTimeout(timer));
    saveTimerRef.current = {};
  }, []);

  const updateBackground = useCallback((next: CanvasBackgroundConfig) => {
    setBackground(next);
    saveCanvasBackground(next);
  }, []);

  useEffect(() => {
    if (
      !notice ||
      isImporting ||
      isExporting ||
      isCreatingCanvas ||
      processingStickerId
    ) {
      return;
    }

    const noticeTimer = window.setTimeout(() => {
      setNotice((current) => (current === notice ? "" : current));
    }, NOTICE_DURATION_MS);

    return () => window.clearTimeout(noticeTimer);
  }, [
    isCreatingCanvas,
    isExporting,
    isImporting,
    notice,
    processingStickerId,
  ]);

  const replaceHistory = useCallback((nextHistory: StickerHistory) => {
    historyRef.current = nextHistory;
    setHistoryPosition({
      index: nextHistory.index,
      length: nextHistory.entries.length,
    });
  }, []);

  const pushHistory = useCallback(
    (nextStickers: CanvasElement[]) => {
      replaceHistory(
        appendStickerHistory(historyRef.current, nextStickers),
      );
    },
    [replaceHistory],
  );

  const applyHistorySnapshot = useCallback(
    (snapshot: StickerHistory["entries"][number]) => {
      cancelCanvasTasks();
      clearPendingSaves();
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
        setNotice("Could not save canvas history"),
      );
    },
    [cancelCanvasTasks, clearPendingSaves],
  );

  const undo = useCallback(() => {
    const movement = moveStickerHistory(historyRef.current, -1);
    if (!movement) return;
    replaceHistory(movement.history);
    applyHistorySnapshot(movement.snapshot);
  }, [applyHistorySnapshot, replaceHistory]);

  const redo = useCallback(() => {
    const movement = moveStickerHistory(historyRef.current, 1);
    if (!movement) return;
    replaceHistory(movement.history);
    applyHistorySnapshot(movement.snapshot);
  }, [applyHistorySnapshot, replaceHistory]);

  const replaceStickers = useCallback(
    (
      update:
        | CanvasElement[]
        | ((current: CanvasElement[]) => CanvasElement[]),
      recordHistory = true,
    ) => {
      const current = stickersRef.current;
      const next = typeof update === "function" ? update(current) : update;
      stickersRef.current = next;
      if (recordHistory) pushHistory(next);
      setStickers(next);
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

  const toggleCropMode = useCallback(
    (stickerId: string) => {
      setEditingId(null);
      selectSticker(stickerId);
      setCropEditingId((current) =>
        current === stickerId ? null : stickerId,
      );
    },
    [selectSticker],
  );

  const commitPendingCutout = useCallback(
    (effectId: string) => {
      const pending = pendingCutoutRef.current;
      if (!pending || pending.effectId !== effectId) return;
      pendingCutoutRef.current = null;
      if (!cutoutTasksRef.current.isCurrent(
        pending.task, activeCanvasIdRef.current, stickersRef.current,
      )) {
        URL.revokeObjectURL(pending.updated.url);
        cutoutTasksRef.current.finish(pending.task);
        return;
      }
      cutoutTasksRef.current.finish(pending.task);
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
      const changed = !equalCanvasElementRecords([current], [updated]);
      if (!changed && !commit) return;
      if (changed) replaceStickers(
        (stickers) =>
          stickers.map((sticker) =>
            sticker.id === stickerId ? updated : sticker,
          ),
        commit,
      );
      else if (commit) pushHistory(stickersRef.current);

      const pendingSave = saveTimerRef.current[stickerId];
      if (pendingSave) {
        window.clearTimeout(saveTimerRef.current[stickerId]);
      }
      const record = changed ? updated : current;
      const isCurrent = () => stickersRef.current.find((item) => item.id === stickerId) === record;
      if (commit) {
        delete saveTimerRef.current[stickerId];
        if (changed || pendingSave) {
          void saveStickerRecord(record, isCurrent).catch(() => setNotice("Could not save"));
        }
      } else {
        saveTimerRef.current[stickerId] = window.setTimeout(() => {
          void saveStickerRecord(record, isCurrent).catch(() => setNotice("Could not save"));
          delete saveTimerRef.current[stickerId];
        }, 300);
      }
    },
    [pushHistory, replaceStickers],
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
      const changed = !equalCanvasElementRecords([current], [updated]);
      if (!changed && !commit) return;
      if (changed) replaceStickers(
        (elements) =>
          elements.map((element) =>
            element.id === elementId ? updated : element,
          ),
        commit,
      );
      else if (commit) pushHistory(stickersRef.current);

      const pendingSave = saveTimerRef.current[elementId];
      if (pendingSave) {
        window.clearTimeout(saveTimerRef.current[elementId]);
      }
      const record = changed ? updated : current;
      const isCurrent = () => stickersRef.current.find((item) => item.id === elementId) === record;
      if (commit) {
        delete saveTimerRef.current[elementId];
        if (changed || pendingSave) {
          void saveStickerRecord(record, isCurrent).catch(() => setNotice("Could not save"));
        }
      } else {
        saveTimerRef.current[elementId] = window.setTimeout(() => {
          void saveStickerRecord(record, isCurrent).catch(() =>
            setNotice("Could not save"),
          );
          delete saveTimerRef.current[elementId];
        }, 240);
      }
    },
    [pushHistory, replaceStickers],
  );

  useEffect(() => {
    let disposed = false;
    const cutoutTasks = cutoutTasksRef.current;
    void readStickerRecords()
      .then(async (records) => {
        if (disposed) return;
        let projects = await readCanvasProjects();
        let storedCanvasId: string | null = null;
        try { storedCanvasId = localStorage.getItem(ACTIVE_CANVAS_KEY); } catch { /* IndexedDB remains authoritative. */ }
        let currentProject = projects.find((project) => project.isActive) ?? projects.find(
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
        activateCanvas(currentProject.id);
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
                cornerRadius: DEFAULT_STICKER_CORNER_RADIUS,
                cornerRadiusEnabled: true,
                shadowEnabled: true,
                shadowBlur: DEFAULT_STICKER_SHADOW_BLUR,
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
          replaceHistory(createStickerHistory(defaults));
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
          replaceHistory(createStickerHistory(restored));
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
      .catch(() => setNotice("Could not restore canvas"));

    return () => {
      disposed = true;
      cutoutTasks.cancel();
      if (pendingCutoutRef.current) URL.revokeObjectURL(pendingCutoutRef.current.updated.url);
      pendingCutoutRef.current = null;
      cutoutOperationRef.current = null;
      Object.values(saveTimerRef.current).forEach((timer) =>
        window.clearTimeout(timer),
      );
      saveTimerRef.current = {};
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      stickersRef.current.forEach((sticker) => {
        if (sticker.type === "image") URL.revokeObjectURL(sticker.url);
      });
    };
  }, [activateCanvas, replaceHistory, replaceStickers]);

  const persistView = useCallback((next = viewRef.current) => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(next));
    } catch {
      // Canvas remains usable when preference storage is blocked.
    }
  }, []);

  const centerCanvasElements = useCallback((elements: CanvasElement[]) => {
    const viewport = viewportRef.current?.getBoundingClientRect();
    if (!viewport || !elements.length) {
      const next = { x: 0, y: 0, zoom: 1 };
      updateView(next);
      persistView(next);
      return;
    }

    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (const element of elements) {
      const angle = (element.rotation * Math.PI) / 180;
      const halfWidth = element.width / 2;
      const halfHeight = element.height / 2;
      const boundsWidth =
        Math.abs(Math.cos(angle)) * halfWidth +
        Math.abs(Math.sin(angle)) * halfHeight;
      const boundsHeight =
        Math.abs(Math.sin(angle)) * halfWidth +
        Math.abs(Math.cos(angle)) * halfHeight;
      left = Math.min(left, element.x - boundsWidth);
      top = Math.min(top, element.y - boundsHeight);
      right = Math.max(right, element.x + boundsWidth);
      bottom = Math.max(bottom, element.y + boundsHeight);
    }

    const padding = viewport.width <= 760 ? 32 : 96;
    const contentWidth = Math.max(1, right - left);
    const contentHeight = Math.max(1, bottom - top);
    const next = {
      x: (left + right) / 2,
      y: (top + bottom) / 2,
      zoom: clamp(
        Math.min(
          Math.max(160, viewport.width - padding * 2) / contentWidth,
          Math.max(160, viewport.height - padding * 2) / contentHeight,
        ),
        MIN_ZOOM,
        MAX_ZOOM,
      ),
    };
    updateView(next);
    persistView(next);
  }, [persistView, updateView]);

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
    async (selectedSticker: CanvasSticker) => {
      if (processingRef.current || projectTransitionRef.current) return;
      const pending = pendingCutoutRef.current;
      if (pending) commitPendingCutout(pending.effectId);
      const sticker = stickersRef.current.find((item) => item.id === selectedSticker.id);
      if (!sticker || sticker.type !== "image") return;
      if (sticker.isCutout && !sticker.originalImage) {
        setNotice("Original image is unavailable");
        return;
      }
      const task = cutoutTasksRef.current.start(activeCanvasIdRef.current, sticker);
      cutoutOperationRef.current = task;
      const isCurrent = () => cutoutTasksRef.current.isCurrent(
        task, activeCanvasIdRef.current, stickersRef.current,
      );
      processingRef.current = true;
      setDissolveEffect(null);
      setProcessingStickerId(sticker.id);
      let createdUrl: string | null = null;
      try {
        if (sticker.isCutout && sticker.originalImage) {
          const restoredImage = sticker.crop
            ? await cropImageBlob(sticker.originalImage, sticker.crop)
            : sticker.originalImage;
          const ratio = await readImageAspect(restoredImage);
          const restoredUrl = URL.createObjectURL(restoredImage);
          createdUrl = restoredUrl;
          await preloadImageUrl(restoredUrl);
          if (!isCurrent()) return;
          const restored: CanvasSticker = {
            ...sticker,
            image: restoredImage,
            url: restoredUrl,
            height: sticker.width / ratio,
            isCutout: false,
            crop: undefined,
            originalImage: restoredImage,
          };
          await saveStickerRecord(restored, isCurrent);
          if (!isCurrent()) return;
          replaceStickers((current) =>
            current.map((currentSticker) =>
              currentSticker.id === sticker.id ? restored : currentSticker,
            ),
          );
          URL.revokeObjectURL(sticker.url);
          createdUrl = null;
          setNotice("Original image background restored");
          return;
        }

        const sourceImage = sticker.originalImage ?? sticker.image;
        const sourceImageForCutout = sticker.crop
          ? await cropImageBlob(sourceImage, sticker.crop)
          : sourceImage;
        const result = await removeImageBackground(sourceImageForCutout, undefined, task.signal);
        if (!isCurrent()) return;

        const [cutout, dissolveTexture] = await Promise.all([
          createOutlinedCutout(
            result.pixels,
            result.width,
            result.height,
          ),
          createBackgroundDissolveTexture(
            sourceImageForCutout,
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
        if (!isCurrent()) return;

        const updated: CanvasSticker = {
          ...sticker,
          image: cutout.blob,
          url: newUrl,
          height: newHeight,
          outlineWidth: (sticker.outlineWidth && sticker.outlineWidth > 0) ? sticker.outlineWidth : 8,
          outlineColor: sticker.outlineColor || "#ffffff",
          isCutout: true,
          crop: undefined,
          originalImage: sourceImageForCutout,
        };

        await saveStickerRecord(updated, isCurrent);
        if (!isCurrent()) return;
        const viewport = viewportRef.current?.getBoundingClientRect();
        const currentView = viewRef.current;
        if (viewport && dissolveTexture) {
          const effectId = `${sticker.id}:${Date.now()}`;
          pendingCutoutRef.current = {
            task,
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
        setNotice("Background removed");
        createdUrl = null;
      } catch (error) {
        if (!isCurrent()) return;
        console.error("Could not cutout sticker.", error);
        setNotice(
          error instanceof Error ? error.message : "Could not remove background",
        );
      } finally {
        if (createdUrl) URL.revokeObjectURL(createdUrl);
        if (cutoutOperationRef.current === task) {
          cutoutOperationRef.current = null;
          processingRef.current = false;
          setProcessingStickerId(null);
        }
        if (pendingCutoutRef.current?.task !== task) cutoutTasksRef.current.finish(task);
      }
    },
    [commitPendingCutout, replaceStickers],
  );

  const processFile = useCallback(
    async (file?: File, dropPoint?: CanvasDropPoint) => {
      if (!file || processingRef.current || projectTransitionRef.current) return;
      if (!isSupportedImageFile(file)) {
        setNotice("Please select an image");
        return;
      }
      if (file.size > 20_000_000) {
        setNotice("Image must be 20 MB or smaller");
        return;
      }

      setCameraOpen(false);
      setActiveTool("select");
      setShapeMenuOpen(false);
      processingRef.current = true;
      setIsImporting(true);
      setNotice("Preparing image…");
      let createdUrl: string | null = null;
      try {
        const image = isHeicFile(file) ? await convertHeicToJpeg(file) : file;
        const aspect = await readImageAspect(image);

        const url = URL.createObjectURL(image);
        createdUrl = url;

        const rect = viewportRef.current?.getBoundingClientRect();
        const currentView = viewRef.current;
        const maximumWidth = Math.min(380, (rect?.width ?? 600) * 0.52);
        const maximumHeight = Math.min(430, (rect?.height ?? 800) * 0.52);
        let width = maximumWidth / currentView.zoom;
        let height = width / aspect;
        if (height > maximumHeight / currentView.zoom) {
          height = maximumHeight / currentView.zoom;
          width = height * aspect;
        }

        const position =
          dropPoint && rect
            ? {
                x:
                  currentView.x +
                  (dropPoint.clientX - rect.left - rect.width / 2) /
                    currentView.zoom,
                y:
                  currentView.y +
                  (dropPoint.clientY - rect.top - rect.height / 2) /
                    currentView.zoom,
              }
            : { x: currentView.x, y: currentView.y };

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
          x: position.x,
          y: position.y,
          rotation: 0,
          zIndex: topZ + 1,
          createdAt: Date.now(),
          outlineWidth: 0,
          outlineColor: "#ffffff",
          oilFilmEnabled: false,
          isCutout: false,
          cornerRadius: DEFAULT_STICKER_CORNER_RADIUS,
          cornerRadiusEnabled: true,
          shadowEnabled: true,
          shadowBlur: DEFAULT_STICKER_SHADOW_BLUR,
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
        setNotice("Image added");
      } catch (error) {
        if (createdUrl) {
          URL.revokeObjectURL(createdUrl);
        }
        console.error("Could not load image.", error);
        setNotice(
          error instanceof Error ? error.message : "Could not load image",
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

  const clearExternalDrag = useCallback(() => {
    externalDragDepthRef.current = 0;
    setIsExternalDragActive(false);
  }, []);

  const handleExternalDragEnter = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      if (
        !isFileTransfer(event.dataTransfer) ||
        processingRef.current ||
        isImporting ||
        isExporting ||
        isCreatingCanvas
      ) {
        return;
      }
      event.preventDefault();
      externalDragDepthRef.current += 1;
      if (externalDragDepthRef.current === 1) {
        setIsExternalDragActive(true);
      }
    },
    [isCreatingCanvas, isExporting, isImporting],
  );

  const handleExternalDragOver = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      if (
        !isFileTransfer(event.dataTransfer) ||
        processingRef.current ||
        isImporting ||
        isExporting ||
        isCreatingCanvas
      ) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [isCreatingCanvas, isExporting, isImporting],
  );

  const handleExternalDragLeave = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      if (!isFileTransfer(event.dataTransfer)) return;
      externalDragDepthRef.current = Math.max(
        0,
        externalDragDepthRef.current - 1,
      );
      if (externalDragDepthRef.current === 0) {
        setIsExternalDragActive(false);
      }
    },
    [],
  );

  const handleExternalDrop = useCallback(
    async (event: ReactDragEvent<HTMLElement>) => {
      if (!isFileTransfer(event.dataTransfer)) return;
      event.preventDefault();
      clearExternalDrag();
      if (
        processingRef.current ||
        isImporting ||
        isExporting ||
        isCreatingCanvas
      ) {
        return;
      }

      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLTextAreaElement) {
        activeElement.blur();
      }

      const files = getDroppedFiles(event.dataTransfer).filter(
        isSupportedImageFile,
      );
      if (!files.length) {
        setNotice("Please select an image");
        return;
      }

      const dropPoint = {
        clientX: event.clientX,
        clientY: event.clientY,
      };
      for (const [index, file] of files.entries()) {
        await processFile(file, {
          clientX: dropPoint.clientX + index * DROP_STACK_OFFSET,
          clientY: dropPoint.clientY + index * DROP_STACK_OFFSET,
        });
      }
    },
    [
      clearExternalDrag,
      isCreatingCanvas,
      isExporting,
      isImporting,
      processFile,
    ],
  );

  const startStickerGesture = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      sticker: CanvasElement,
      kind: StickerGestureKind,
      cropHandle?: CanvasCropHandle,
    ) => {
      if (event.button !== 0 || projectTransitionRef.current) return;
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
      if (kind !== "crop") setCropEditingId(null);
      gestureRef.current = {
        kind,
        cropHandle,
        startCrop:
          lifted.type === "image" ? getImageCrop(lifted.crop) : DEFAULT_IMAGE_CROP,
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
      if (kind === "move") {
        element.dataset.moving = "true";
      }
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
      } else if (gesture.kind === "crop") {
        latest =
          updateCropGesture(gesture, sample, viewRef.current.zoom) ??
          gesture.start;
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
      if (gesture.kind === "move") {
        delete gesture.element.dataset.moving;
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
        setNotice("Could not save"),
      );
      pushHistory(next);
    },
    [moveStickerGesture, pushHistory, replaceStickers],
  );

  const deleteSticker = useCallback(
    (sticker: CanvasElement) => {
      cancelCanvasTasks(sticker.id);
      if (saveTimerRef.current[sticker.id]) {
        window.clearTimeout(saveTimerRef.current[sticker.id]);
        delete saveTimerRef.current[sticker.id];
      }
      void removeStickerRecord(sticker.id)
        .then(() => {
          selectSticker(null);
          setCropEditingId(null);
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
        .catch(() => setNotice("Could not delete"));
    },
    [cancelCanvasTasks, replaceStickers, selectSticker],
  );

  const duplicateElement = useCallback(
    async (element: CanvasElement) => {
      const topZ = stickersRef.current.reduce(
        (largest, current) => Math.max(largest, current.zIndex),
        0,
      );
      const offset = Math.max(20, 28 / viewRef.current.zoom);
      const id = crypto.randomUUID();
      const duplicate: CanvasElement =
        element.type === "image"
          ? {
              ...element,
              id,
              x: element.x + offset,
              y: element.y + offset,
              zIndex: topZ + 1,
              createdAt: Date.now(),
              url: URL.createObjectURL(element.image),
            }
          : {
              ...element,
              id,
              x: element.x + offset,
              y: element.y + offset,
              zIndex: topZ + 1,
              createdAt: Date.now(),
            };

      replaceStickers((current) => [...current, duplicate]);
      selectSticker(duplicate.id);
      try {
        await saveStickerRecord(duplicate);
      } catch {
        setNotice("Could not duplicate");
      }
    },
    [replaceStickers, selectSticker],
  );

  const changeLayer = useCallback(
    (
      elementId: string,
      action: "send-back" | "backward" | "forward" | "bring-front",
    ) => {
      const ordered = [...stickersRef.current].sort(
        (left, right) => left.zIndex - right.zIndex,
      );
      const index = ordered.findIndex((element) => element.id === elementId);
      if (index < 0) return;
      const targetIndex =
        action === "send-back"
          ? 0
          : action === "backward"
            ? Math.max(0, index - 1)
            : action === "forward"
              ? Math.min(ordered.length - 1, index + 1)
              : ordered.length - 1;
      if (targetIndex === index) return;

      const [moved] = ordered.splice(index, 1);
      ordered.splice(targetIndex, 0, moved);
      const next = ordered.map(
        (element, zIndex) => ({ ...element, zIndex: zIndex + 1 }) as CanvasElement,
      );
      replaceStickers(next);
      void Promise.all(next.map((element) => saveStickerRecord(element))).catch(
        () => setNotice("Could not update layer order"),
      );
    },
    [replaceStickers],
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
        setNotice("Could not save"),
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
        textOutlineColor: "#ffffff",
        textOutlineWidth: 6 / currentView.zoom,
        holoEnabled: false,
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
        setNotice("Could not save"),
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
          setNotice("Could not save"),
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
      opacity: sticker.opacity,
      oilFilmEnabled: sticker.oilFilmEnabled,
      cornerRadius: sticker.cornerRadius,
      cornerRadiusEnabled: sticker.cornerRadiusEnabled,
      shadowEnabled: sticker.shadowEnabled,
      shadowBlur: sticker.shadowBlur,
      crop: sticker.crop,
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
      .catch(() => setNotice("Could not download"));
  }, []);

  const exportCanvas = useCallback(async () => {
    if (!stickersRef.current.length) {
      setNotice("Canvas is empty");
      return;
    }
    setIsExporting(true);
    setNotice("");
    try {
      const exported = background
        ? await exportCanvasToPng(stickersRef.current, background)
        : await exportCanvasToPng(stickersRef.current);
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
        error instanceof Error ? error.message : "Could not export canvas",
      );
    } finally {
      setIsExporting(false);
    }
  }, [background]);

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
    if (projectTransitionRef.current || isExporting ||
      (processingRef.current && !cutoutOperationRef.current)) return;
    projectTransitionRef.current = true;
    cancelCanvasTasks();
    clearPendingSaves();
    setIsCreatingCanvas(true);
    setNotice("");
    let createdDefaults: CanvasSticker[] | null = null;
    try {
      const defaults = await createDefaultCanvasStickers();
      createdDefaults = defaults;
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
        isActive: true,
      };
      const archivedProject = currentProject
        ? {
            ...currentProject,
            updatedAt: now,
            elements: previous,
            isActive: false,
          }
        : null;
      await switchCanvasProject(archivedProject, nextProject);
      replaceStickers(defaults, false);
      centerCanvasElements(defaults);
      createdDefaults = null;
      previous.forEach((sticker) => {
        if (sticker.type === "image") URL.revokeObjectURL(sticker.url);
      });
      replaceHistory(createStickerHistory(defaults));
      try {
        localStorage.setItem(SEEDED_KEY, SEEDED_VERSION);
        localStorage.setItem(ACTIVE_CANVAS_KEY, nextProject.id);
      } catch { /* The active project is also committed in IndexedDB. */ }
      setCanvasProjects((current) => [
        ...current.map((project) =>
          project.id === archivedProject?.id ? archivedProject : project,
        ),
        nextProject,
      ]);
      activateCanvas(nextProject.id);
      setHistoryOpen(false);
      setActiveTool("select");
      setShapeMenuOpen(false);
      setEditingId(null);
      setDrawingId(null);
      setCropEditingId(null);
      selectSticker(null);
      setNotice("New canvas is ready");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create canvas");
    } finally {
      createdDefaults?.forEach((sticker) => URL.revokeObjectURL(sticker.url));
      projectTransitionRef.current = false;
      setIsCreatingCanvas(false);
    }
  }, [
    activeCanvasId,
    activateCanvas,
    cancelCanvasTasks,
    canvasProjects,
    centerCanvasElements,
    clearPendingSaves,
    isExporting,
    replaceHistory,
    replaceStickers,
    selectSticker,
  ]);

  const openCanvasProject = useCallback(
    async (projectId: string) => {
      if (projectTransitionRef.current || isExporting ||
        (processingRef.current && !cutoutOperationRef.current)) return;
      if (projectId === activeCanvasId) {
        setHistoryOpen(false);
        return;
      }
      const targetProject = canvasProjects.find(
        (project) => project.id === projectId,
      );
      if (!targetProject) return;
      projectTransitionRef.current = true;
      cancelCanvasTasks();
      clearPendingSaves();
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
              isActive: false,
            }
          : null;
        const openedProject = { ...targetProject, updatedAt: now, isActive: true };
        await switchCanvasProject(archivedProject, openedProject);
        const restored = [...openedProject.elements]
          .sort((left, right) => left.zIndex - right.zIndex)
          .map(
            (record): CanvasElement =>
              record.type === "image"
                ? { ...record, url: URL.createObjectURL(record.image) }
                : { ...record },
          );
        const previous = stickersRef.current;
        replaceStickers(restored, false);
        centerCanvasElements(restored);
        previous.forEach((sticker) => {
          if (sticker.type === "image") URL.revokeObjectURL(sticker.url);
        });
        replaceHistory(createStickerHistory(restored));
        try {
          localStorage.setItem(ACTIVE_CANVAS_KEY, openedProject.id);
        } catch { /* The active project is also committed in IndexedDB. */ }
        setCanvasProjects((current) =>
          current.map((project) =>
            project.id === archivedProject?.id
              ? archivedProject
              : project.id === openedProject.id
                ? openedProject
                : project,
          ),
        );
        activateCanvas(openedProject.id);
        setHistoryOpen(false);
        setActiveTool("select");
        setShapeMenuOpen(false);
        setEditingId(null);
        setDrawingId(null);
        setCropEditingId(null);
        selectSticker(null);
        setNotice(`Opened “${openedProject.name}”`);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Could not open canvas");
      } finally {
        projectTransitionRef.current = false;
        setIsCreatingCanvas(false);
      }
    },
    [
      activeCanvasId,
      activateCanvas,
      cancelCanvasTasks,
      canvasProjects,
      centerCanvasElements,
      clearPendingSaves,
      isExporting,
      replaceHistory,
      replaceStickers,
      selectSticker,
    ],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || projectTransitionRef.current) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof Element && target.closest(
          '[data-canvas-ui], [contenteditable="true"], select',
        ))
      ) {
        return;
      }

      if (event.key === "Escape") {
        setActiveTool("select");
        setShapeMenuOpen(false);
        setEditingId(null);
        setCropEditingId(null);
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
        void saveStickerRecord(updated).catch(() => setNotice("Could not save"));
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
    if (projectTransitionRef.current) return;
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
    setCropEditingId(null);
    selectSticker(null);
    panRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      view: viewRef.current,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveViewportPointer = useCallback((sample: PointerSample) => {
    const pinch = pinchRef.current;
    if (pinch) {
      const first = touchPointsRef.current.get(pinch.ids[0]);
      const second = touchPointsRef.current.get(pinch.ids[1]);
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!first || !second || !rect) return;
      const nextView = getPinchView(pinch, first, second, rect, MIN_ZOOM, MAX_ZOOM);
      viewRef.current = nextView;
      applyViewTransform(worldRef.current, gridRef.current, nextView);
      return;
    }
    const pan = panRef.current;
    if (!pan || pan.pointerId !== sample.pointerId) return;
    const nextView = {
      ...pan.view,
      x: pan.view.x - (sample.clientX - pan.clientX) / pan.view.zoom,
      y: pan.view.y - (sample.clientY - pan.clientY) / pan.view.zoom,
    };
    viewRef.current = nextView;
    applyViewTransform(worldRef.current, gridRef.current, nextView);
  }, []);

  const moveGlobalPointer = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      // Keep both touches current even when their events share one animation frame.
      const touch = touchPointsRef.current.get(event.pointerId);
      if (touch) {
        touch.x = event.clientX;
        touch.y = event.clientY;
      }
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
          moveViewportPointer(sample);
        }
      });
    },
    [moveShapeDrawing, moveStickerGesture, moveViewportPointer],
  );

  const finishViewportPointer = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (event.type !== "pointercancel") {
      const touch = touchPointsRef.current.get(event.pointerId);
      if (touch) {
        touch.x = event.clientX;
        touch.y = event.clientY;
      }
      moveViewportPointer(event);
    }
    pointerSampleRef.current = null;
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
    setView(viewRef.current);
    persistView();
  }, [moveViewportPointer, persistView]);

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

  const changeZoom = useCallback(
    (factor: number) => {
      const current = viewRef.current;
      const next = {
        ...current,
        zoom: clamp(current.zoom * factor, MIN_ZOOM, MAX_ZOOM),
      };
      updateView(next);
      persistView(next);
    },
    [persistView, updateView],
  );

  const resetZoom = useCallback(() => {
    const next = { ...viewRef.current, zoom: 1 };
    updateView(next);
    persistView(next);
  }, [persistView, updateView]);

  const fitCanvasToContent = useCallback(() => {
    const viewport = viewportRef.current?.getBoundingClientRect();
    const elements = stickersRef.current;
    if (!viewport || !elements.length) {
      const next = { x: 0, y: 0, zoom: 1 };
      updateView(next);
      persistView(next);
      return;
    }

    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (const element of elements) {
      const angle = (element.rotation * Math.PI) / 180;
      const halfWidth = element.width / 2;
      const halfHeight = element.height / 2;
      const boundsWidth =
        Math.abs(Math.cos(angle)) * halfWidth +
        Math.abs(Math.sin(angle)) * halfHeight;
      const boundsHeight =
        Math.abs(Math.sin(angle)) * halfWidth +
        Math.abs(Math.cos(angle)) * halfHeight;
      left = Math.min(left, element.x - boundsWidth);
      top = Math.min(top, element.y - boundsHeight);
      right = Math.max(right, element.x + boundsWidth);
      bottom = Math.max(bottom, element.y + boundsHeight);
    }

    const isCompactViewport = viewport.width <= 760;
    const padding = isCompactViewport ? 32 : 96;
    const selectedElement = elements.find(
      (element) => element.id === selectedIdRef.current,
    );
    const hasPropertiesPanel = Boolean(selectedElement);
    const isLandscapeCompactViewport =
      isCompactViewport && viewport.width > viewport.height;
    const inspectorWidth = hasPropertiesPanel
      ? isCompactViewport
          ? isLandscapeCompactViewport
            ? Math.min(268, viewport.width * 0.4) + padding / 2
            : 0
        : 292
      : 0;
    const availableWidth = Math.max(
      isCompactViewport ? 160 : 240,
      viewport.width - padding * 2 - inspectorWidth,
    );
    const availableHeight = Math.max(
      isCompactViewport ? 160 : 240,
      viewport.height - padding * 2,
    );
    const contentWidth = Math.max(1, right - left);
    const contentHeight = Math.max(1, bottom - top);
    const next = {
      x: (left + right) / 2,
      y: (top + bottom) / 2,
      zoom: clamp(
        Math.min(availableWidth / contentWidth, availableHeight / contentHeight),
        MIN_ZOOM,
        MAX_ZOOM,
      ),
    };
    updateView(next);
    persistView(next);
  }, [persistView, updateView]);

  const worldStyle = {
    transform: `translate3d(calc(50vw - ${view.x * view.zoom}px), calc(50dvh - ${view.y * view.zoom}px), 0) scale(${view.zoom})`,
    "--simple-control-scale": String(1 / view.zoom),
  } as CSSProperties;

  const isDarkBg =
    background.color.startsWith("#") &&
    (() => {
      const hex = background.color.replace("#", "");
      const num = parseInt(
        hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex,
        16,
      );
      if (Number.isNaN(num)) return false;
      const r = (num >> 16) & 255;
      const g = (num >> 8) & 255;
      const b = num & 255;
      return (r * 299 + g * 587 + b * 114) / 1000 < 128;
    })();

  const gridStyle = {
    "--grid-size": `${28 * view.zoom}px`,
    "--grid-x": `${-view.x * view.zoom}px`,
    "--grid-y": `${-view.y * view.zoom}px`,
    "--grid-opacity": String(background.gridOpacity ?? 0.42),
    "--grid-color": isDarkBg
      ? "rgba(255, 255, 255, 0.45)"
      : "rgba(100, 90, 78, 0.42)",
  } as CSSProperties;
  const selectedElement = stickers.find(
    (element) => element.id === selectedId,
  );
  const selectedProperties =
    selectedElement && !editingId && !drawingId ? selectedElement : null;
  const canvasUiDisabled =
    isImporting ||
    isExporting ||
    isCreatingCanvas;
  const selectedPropertiesDisabled =
    canvasUiDisabled ||
    Boolean(
      selectedProperties &&
        selectedProperties.type === "image" &&
        processingStickerId === selectedProperties.id,
    );
  const canUndo = historyPosition.index > 0;
  const canRedo =
    historyPosition.index >= 0 &&
    historyPosition.index < historyPosition.length - 1;

  return (
    <main
      ref={viewportRef}
      className="simple-sticker-canvas"
      style={{ "--paper": background.color } as CSSProperties}
      data-bg-style={background.style}
      data-active-tool={activeTool}
      data-external-drag={isExternalDragActive}
      data-inspector-open={Boolean(selectedProperties)}
      data-bg-inspector-open={Boolean(backgroundInspectorOpen)}
      onPointerDown={startViewportPointer}
      onPointerMove={moveGlobalPointer}
      onPointerUp={finishGlobalPointer}
      onPointerCancel={finishGlobalPointer}
      onWheel={handleWheel}
      onDragEnter={handleExternalDragEnter}
      onDragOver={handleExternalDragOver}
      onDragLeave={handleExternalDragLeave}
      onDrop={(event) => void handleExternalDrop(event)}
      onDragEnd={clearExternalDrag}
    >
      <CanvasTopBar
        disabled={canvasUiDisabled}
        historyOpen={historyOpen}
        canUndo={canUndo}
        canRedo={canRedo}
        onToggleHistory={() => setHistoryOpen((current) => !current)}
        onNewCanvas={() => void createNewCanvas()}
        onDownloadCanvas={downloadCanvas}
        onUndo={undo}
        onRedo={redo}
      />

      {isExternalDragActive ? (
        <div className="simple-drop-overlay" role="status" aria-live="polite">
          <div className="simple-drop-overlay-card">
            <Icon name="image" />
            <strong>Drop an image to add it</strong>
            <span>Release to place the image here</span>
          </div>
        </div>
      ) : null}
      <div
        ref={gridRef}
        className="simple-canvas-grid"
        data-style={background.style}
        style={gridStyle}
      />
      <div ref={worldRef} className="simple-sticker-world" style={worldStyle}>
        {stickers.map((sticker) =>
          sticker.type === "image" ? (
            <StickerCanvasItem
              key={sticker.id}
              sticker={sticker}
              selected={selectedId === sticker.id}
              entering={enteringId === sticker.id}
              isProcessing={processingStickerId === sticker.id}
              cropMode={cropEditingId === sticker.id}
              onGestureStart={startStickerGesture}
              onSelect={selectSticker}
              onToggleCrop={toggleCropMode}
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
              onStartEditing={startElementEditing}
              onCommitText={commitElementText}
              onCancelEditing={cancelElementEditing}
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

      {selectedProperties ? (
        <CanvasInspector
          element={selectedProperties}
          disabled={selectedPropertiesDisabled}
          processing={
            selectedProperties.type === "image" &&
            processingStickerId === selectedProperties.id
          }
          onClose={() => {
            setEditingId(null);
            setCropEditingId(null);
            selectSticker(null);
          }}
          onStyleChange={(patch, commit) =>
            selectedProperties.type === "image"
              ? updateStickerStyle(
                  selectedProperties.id,
                  patch,
                  commit,
                )
              : updateCanvasElementProperties(
                  selectedProperties.id,
                  patch,
                  commit,
                )
          }
          onLayerChange={(action) =>
            changeLayer(selectedProperties.id, action)
          }
          onDuplicate={() => void duplicateElement(selectedProperties)}
          onDelete={() => deleteSticker(selectedProperties)}
          onDownload={
            selectedProperties.type === "image"
              ? () => downloadSticker(selectedProperties)
              : undefined
          }
          cropping={
            selectedProperties.type === "image" &&
            cropEditingId === selectedProperties.id
          }
          onToggleCrop={
            selectedProperties.type === "image"
              ? () => toggleCropMode(selectedProperties.id)
              : undefined
          }
          onToggleCutout={
            selectedProperties.type === "image"
              ? () => void cutoutSticker(selectedProperties)
              : undefined
          }
        />
      ) : backgroundInspectorOpen ? (
        <CanvasBackgroundInspector
          config={background}
          onChange={updateBackground}
          onClose={() => setBackgroundInspectorOpen(false)}
        />
      ) : null}

      {!stickers.length ? (
        <div
          className="simple-empty-state simple-empty-hint"
          role="note"
          aria-label="Start creating hint"
        >
          <span className="simple-empty-state-kicker">Start Creating</span>
          <strong>Add an image or draw a shape</strong>
          <span className="simple-empty-state-detail">
            Drop an image · Text tool · Shape tools
          </span>
        </div>
      ) : null}

      {isImporting || isExporting || isCreatingCanvas ? (
        <div className="simple-processing" role="status" aria-live="polite">
          <span className="simple-processing-spinner" aria-hidden="true" />
          <strong>
            {notice ||
              (isCreatingCanvas
                ? "Creating canvas…"
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
              <strong>Canvas History</strong>
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

      <CanvasBottomToolbar
        activeTool={activeTool}
        disabled={canvasUiDisabled}
        shapeMenuOpen={shapeMenuOpen}
        backgroundMenuOpen={backgroundMenuOpen}
        placement="top"
        onUpload={() => {
          setActiveTool("select");
          setShapeMenuOpen(false);
          setBackgroundMenuOpen(false);
          uploadInputRef.current?.click();
        }}
        onCamera={() => {
          setActiveTool("select");
          setShapeMenuOpen(false);
          setBackgroundMenuOpen(false);
          setCameraOpen(true);
        }}
        onSelectTool={(tool) => {
          setActiveTool(tool);
          setShapeMenuOpen(false);
          setBackgroundMenuOpen(false);
          setEditingId(null);
          selectSticker(null);
        }}
        onToggleShapeMenu={() => {
          setShapeMenuOpen((current) => !current);
          setBackgroundMenuOpen(false);
          setEditingId(null);
        }}
        onToggleBackgroundMenu={() => {
          setBackgroundMenuOpen((current) => !current);
          setShapeMenuOpen(false);
        }}
      >
        {backgroundMenuOpen ? (
          <CanvasBackgroundMenu
            config={background}
            onChange={updateBackground}
            onClose={() => setBackgroundMenuOpen(false)}
          />
        ) : null}
      </CanvasBottomToolbar>

      <CanvasZoomControls
        zoom={view.zoom}
        disabled={canvasUiDisabled}
        onZoomOut={() => changeZoom(0.8)}
        onResetZoom={resetZoom}
        onZoomIn={() => changeZoom(1.25)}
        onFitToContent={fitCanvasToContent}
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

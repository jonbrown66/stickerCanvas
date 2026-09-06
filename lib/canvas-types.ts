export type CanvasView = {
  x: number;
  y: number;
  zoom: number;
};

export type CanvasElementBase = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  opacity?: number; // 0 ~ 1
  createdAt: number;
};

export const DEFAULT_STICKER_CORNER_RADIUS = 16;
export const MAX_STICKER_CORNER_RADIUS = 80;
export const DEFAULT_STICKER_SHADOW_BLUR = 14;
export const MAX_STICKER_SHADOW_BLUR = 40;

export type CanvasImageCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasCropHandle = "nw" | "ne" | "sw" | "se";

export const DEFAULT_IMAGE_CROP: CanvasImageCrop = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};
export const MIN_IMAGE_CROP_SIZE = 0.02;

export function normalizeCanvasImageCrop(
  value: unknown,
): CanvasImageCrop | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const x = typeof raw.x === "number" && Number.isFinite(raw.x) ? raw.x : 0;
  const y = typeof raw.y === "number" && Number.isFinite(raw.y) ? raw.y : 0;
  const width =
    typeof raw.width === "number" && Number.isFinite(raw.width)
      ? raw.width
      : 1;
  const height =
    typeof raw.height === "number" && Number.isFinite(raw.height)
      ? raw.height
      : 1;
  const safeWidth = Math.min(1, Math.max(MIN_IMAGE_CROP_SIZE, width));
  const safeHeight = Math.min(1, Math.max(MIN_IMAGE_CROP_SIZE, height));
  return {
    x: Math.min(1 - safeWidth, Math.max(0, x)),
    y: Math.min(1 - safeHeight, Math.max(0, y)),
    width: safeWidth,
    height: safeHeight,
  };
}

export type StickerStyleOptions = {
  opacity?: number; // 0 ~ 1
  outlineWidth?: number; // 0 ~ 24
  outlineColor?: string; // hex or rgb
  oilFilmEnabled?: boolean;
  isCutout?: boolean;
  cornerRadius?: number; // 0 ~ 80px
  cornerRadiusEnabled?: boolean;
  shadowEnabled?: boolean;
  shadowBlur?: number; // 0 ~ 40px
  crop?: CanvasImageCrop;
};

export type StickerRecord = CanvasElementBase &
  StickerStyleOptions & {
    type: "image";
    image: Blob;
    originalImage?: Blob;
  };

export type CanvasTextElement = CanvasElementBase & {
  type: "text";
  text: string;
  fontSize: number;
  fontWeight: 400 | 600 | 700;
  color: string;
  textOutlineColor: string;
  textOutlineWidth: number;
  holoEnabled: boolean;
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  textAlign: "left" | "center" | "right";
};

export type CanvasShapeKind =
  | "rectangle"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "line";

export type CanvasShapeElement = CanvasElementBase & {
  type: "shape";
  shape: CanvasShapeKind;
  fillColor: string;
  fillEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
};

export type CanvasElementRecord =
  | StickerRecord
  | CanvasTextElement
  | CanvasShapeElement;

export type CanvasSticker = StickerRecord & {
  url: string;
};

export type CanvasElement =
  | CanvasSticker
  | CanvasTextElement
  | CanvasShapeElement;

export type CanvasTool =
  | "select"
  | "text"
  | "rectangle"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "line";

export type CanvasElementGestureKind = "move" | "resize" | "rotate" | "crop";

export type StickerGestureKind = CanvasElementGestureKind;

export type CanvasBackgroundStyle =
  | "dots"
  | "grid"
  | "lines"
  | "solid"
  | "transparent";

export type CanvasBackgroundConfig = {
  style: CanvasBackgroundStyle;
  color: string;
  gridOpacity?: number;
};

export const DEFAULT_CANVAS_BACKGROUND: CanvasBackgroundConfig = {
  style: "dots",
  color: "#f7f3ea",
  gridOpacity: 0.42,
};

export const CANVAS_BG_PRESETS = [
  { label: "Warm Paper", color: "#f7f3ea" },
  { label: "Cool Gray", color: "#f1f3f5" },
  { label: "Pure White", color: "#ffffff" },
  { label: "Midnight", color: "#18181b" },
  { label: "Peach", color: "#fdf2f4" },
  { label: "Matcha", color: "#f0f7ed" },
  { label: "Misty Blue", color: "#edf4fa" },
];

export const CANVAS_BG_STYLES: { id: CanvasBackgroundStyle; label: string }[] = [
  { id: "dots", label: "Dots" },
  { id: "grid", label: "Grid" },
  { id: "lines", label: "Lines" },
  { id: "solid", label: "Solid" },
  { id: "transparent", label: "Transparent" },
];

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
  createdAt: number;
};

export type StickerStyleOptions = {
  outlineWidth?: number; // 0 ~ 30
  outlineColor?: string; // hex or rgb
  oilFilmEnabled?: boolean;
  isCutout?: boolean;
};

export type StickerRecord = CanvasElementBase &
  StickerStyleOptions & {
    type: "image";
    image: Blob;
  };

export type CanvasTextElement = CanvasElementBase & {
  type: "text";
  text: string;
  fontSize: number;
  fontWeight: 400 | 600 | 700;
  color: string;
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

export type CanvasElementGestureKind = "move" | "resize" | "rotate";

export type StickerGestureKind = CanvasElementGestureKind;

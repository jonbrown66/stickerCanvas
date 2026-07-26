export type CanvasView = {
  x: number;
  y: number;
  zoom: number;
};

export type StickerStyleOptions = {
  outlineWidth?: number; // 0 ~ 30
  outlineColor?: string; // hex or rgb
  oilFilmEnabled?: boolean;
  isCutout?: boolean;
};

export type StickerRecord = StickerStyleOptions & {
  id: string;
  image: Blob;
  width: number;
  height: number;
  x: number;
  y: number;
  rotation: number;
  zIndex: number;
  createdAt: number;
};

export type CanvasSticker = StickerRecord & {
  url: string;
};

export type StickerGestureKind = "move" | "resize" | "rotate";

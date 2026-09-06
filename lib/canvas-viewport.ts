import type { CanvasView } from "./canvas-types";

export type PointerSample = {
  clientX: number;
  clientY: number;
  pointerId: number;
};

export type PinchGesture = {
  ids: [number, number];
  distance: number;
  view: CanvasView;
  anchorX: number;
  anchorY: number;
};

type Point = { x: number; y: number };
type ViewportBounds = { left: number; top: number; width: number; height: number };

export function getPinchView(
  pinch: PinchGesture,
  first: Point,
  second: Point,
  bounds: ViewportBounds,
  minimumZoom: number,
  maximumZoom: number,
): CanvasView {
  const distance = Math.max(1, Math.hypot(first.x - second.x, first.y - second.y));
  const zoom = Math.min(
    maximumZoom,
    Math.max(minimumZoom, pinch.view.zoom * distance / pinch.distance),
  );
  return {
    x: pinch.anchorX - ((first.x + second.x) / 2 - bounds.left - bounds.width / 2) / zoom,
    y: pinch.anchorY - ((first.y + second.y) / 2 - bounds.top - bounds.height / 2) / zoom,
    zoom,
  };
}

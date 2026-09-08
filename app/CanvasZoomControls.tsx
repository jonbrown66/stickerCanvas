import { Icon } from "./Icon";

interface CanvasZoomControlsProps {
  zoom: number;
  disabled: boolean;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onZoomIn: () => void;
  onFitToContent: () => void;
  canAutoLayout: boolean;
  onAutoLayout: () => void;
}

export function CanvasZoomControls({
  zoom,
  disabled,
  onZoomOut,
  onResetZoom,
  onZoomIn,
  onFitToContent,
  canAutoLayout,
  onAutoLayout,
}: CanvasZoomControlsProps) {
  return (
    <div
      className="simple-canvas-zoom-controls"
      data-canvas-ui
      aria-label="Canvas zoom controls"
    >
      <button
        type="button"
        disabled={disabled}
        aria-label="Zoom out"
        title="Zoom out"
        onClick={onZoomOut}
      >
        <Icon name="minus" />
      </button>
      <button
        type="button"
        className="simple-canvas-zoom-value"
        disabled={disabled}
        aria-label="Reset zoom"
        title="Reset zoom (100%)"
        onClick={onResetZoom}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-label="Zoom in"
        title="Zoom in"
        onClick={onZoomIn}
      >
        <Icon name="plus" />
      </button>
      <span className="simple-canvas-zoom-divider" aria-hidden="true" />
      <button
        type="button"
        disabled={disabled}
        aria-label="Fit canvas"
        title="Fit canvas content"
        onClick={onFitToContent}
      >
        <Icon name="fit" />
      </button>
      <span className="simple-canvas-zoom-divider" aria-hidden="true" />
      <button
        type="button"
        disabled={disabled || !canAutoLayout}
        onClick={onAutoLayout}
        aria-label="Auto arrange"
        title="Auto arrange"
      >
        <Icon name="layout" />
      </button>
    </div>
  );
}

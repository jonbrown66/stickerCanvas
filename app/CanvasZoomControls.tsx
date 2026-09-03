import { Icon } from "./Icon";

interface CanvasZoomControlsProps {
  zoom: number;
  disabled: boolean;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onZoomIn: () => void;
  onFitToContent: () => void;
}

export function CanvasZoomControls({
  zoom,
  disabled,
  onZoomOut,
  onResetZoom,
  onZoomIn,
  onFitToContent,
}: CanvasZoomControlsProps) {
  return (
    <div
      className="simple-canvas-zoom-controls"
      data-canvas-ui
      aria-label="画布缩放控制"
    >
      <button
        type="button"
        disabled={disabled}
        aria-label="缩小"
        title="缩小"
        onClick={onZoomOut}
      >
        <Icon name="minus" />
      </button>
      <button
        type="button"
        className="simple-canvas-zoom-value"
        disabled={disabled}
        aria-label="重置缩放"
        title="重置缩放（100%）"
        onClick={onResetZoom}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-label="放大"
        title="放大"
        onClick={onZoomIn}
      >
        <Icon name="plus" />
      </button>
      <span className="simple-canvas-zoom-divider" aria-hidden="true" />
      <button
        type="button"
        disabled={disabled}
        aria-label="适合画布"
        title="适合画布内容"
        onClick={onFitToContent}
      >
        <Icon name="fit" />
      </button>
    </div>
  );
}

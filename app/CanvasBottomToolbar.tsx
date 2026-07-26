import type { CanvasTool } from "@/lib/canvas-types";
import { Icon } from "./Icon";

interface CanvasBottomToolbarProps {
  activeTool: CanvasTool;
  disabled: boolean;
  shapeMenuOpen: boolean;
  onUpload: () => void;
  onCamera: () => void;
  onDownloadCanvas: () => void;
  onSelectTool: (tool: CanvasTool) => void;
  onToggleShapeMenu: () => void;
}

export function CanvasBottomToolbar({
  activeTool,
  disabled,
  shapeMenuOpen,
  onUpload,
  onCamera,
  onDownloadCanvas,
  onSelectTool,
  onToggleShapeMenu,
}: CanvasBottomToolbarProps) {
  const shapeToolActive =
    activeTool === "rectangle" ||
    activeTool === "ellipse" ||
    activeTool === "triangle" ||
    activeTool === "diamond" ||
    activeTool === "line";

  return (
    <nav
      className="simple-floating-actions"
      data-canvas-ui
      aria-label="Canvas tools"
    >
      {shapeMenuOpen ? (
        <div className="simple-shape-menu" id="canvas-shape-menu">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelectTool("rectangle")}
            data-active={activeTool === "rectangle"}
            aria-label="Rectangle"
            title="Rectangle"
          >
            <Icon name="rectangle" />
            <span>Rectangle</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelectTool("ellipse")}
            data-active={activeTool === "ellipse"}
            aria-label="Ellipse"
            title="Ellipse"
          >
            <Icon name="ellipse" />
            <span>Ellipse</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelectTool("triangle")}
            data-active={activeTool === "triangle"}
            aria-label="Triangle"
            title="Triangle"
          >
            <Icon name="triangle" />
            <span>Triangle</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelectTool("diamond")}
            data-active={activeTool === "diamond"}
            aria-label="Diamond"
            title="Diamond"
          >
            <Icon name="diamond" />
            <span>Diamond</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelectTool("line")}
            data-active={activeTool === "line"}
            aria-label="Line"
            title="Line"
          >
            <Icon name="line" />
            <span>Line</span>
          </button>
        </div>
      ) : null}

      <button
        type="button"
        disabled={disabled}
        onClick={onUpload}
        aria-label="Upload"
        title="Upload"
      >
        <Icon name="image" />
        <span>Upload</span>
      </button>
      <button
        type="button"
        className="simple-camera-button"
        disabled={disabled}
        onClick={onCamera}
        aria-label="Camera"
        title="Camera"
      >
        <Icon name="camera" />
        <span>Camera</span>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelectTool("text")}
        data-active={activeTool === "text"}
        aria-label="Text"
        title="Text"
      >
        <Icon name="text" />
        <span>Text</span>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onToggleShapeMenu}
        data-active={shapeMenuOpen || shapeToolActive}
        aria-label="Shape"
        title="Shape"
        aria-controls="canvas-shape-menu"
        aria-expanded={shapeMenuOpen}
      >
        <Icon name="shapes" />
        <span>Shape</span>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onDownloadCanvas}
        aria-label="Download canvas"
        title="Download canvas"
      >
        <Icon name="download" />
        <span>Download canvas</span>
      </button>
    </nav>
  );
}

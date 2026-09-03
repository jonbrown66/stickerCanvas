import type { CanvasTool } from "@/lib/canvas-types";
import { useEffect, useRef } from "react";
import { Icon } from "./Icon";

interface CanvasBottomToolbarProps {
  activeTool: CanvasTool;
  disabled: boolean;
  shapeMenuOpen: boolean;
  backgroundMenuOpen?: boolean;
  placement?: "bottom" | "top" | "left";
  onUpload: () => void;
  onCamera: () => void;
  onSelectTool: (tool: CanvasTool) => void;
  onToggleShapeMenu: () => void;
  onToggleBackgroundMenu?: () => void;
  children?: React.ReactNode;
}

type CanvasShapeTool = Extract<
  CanvasTool,
  "rectangle" | "ellipse" | "triangle" | "diamond" | "line"
>;

export function CanvasBottomToolbar({
  activeTool,
  disabled,
  shapeMenuOpen,
  backgroundMenuOpen = false,
  placement = "bottom",
  onUpload,
  onCamera,
  onSelectTool,
  onToggleShapeMenu,
  onToggleBackgroundMenu,
  children,
}: CanvasBottomToolbarProps) {
  const toolbarRef = useRef<HTMLElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const hasOpenedMenuRef = useRef(false);
  const restoreFocusRef = useRef(false);
  const menuCallbacksRef = useRef({ onToggleShapeMenu, onToggleBackgroundMenu });
  const resolvedPlacement = placement === "left" ? "top" : placement;
  const menuOpen = shapeMenuOpen || backgroundMenuOpen;

  useEffect(() => {
    menuCallbacksRef.current = { onToggleShapeMenu, onToggleBackgroundMenu };
  }, [onToggleBackgroundMenu, onToggleShapeMenu]);

  useEffect(() => {
    if (!menuOpen) {
      if (!hasOpenedMenuRef.current) return;
      hasOpenedMenuRef.current = false;
      const previouslyFocused = previouslyFocusedRef.current;
      previouslyFocusedRef.current = null;
      if (restoreFocusRef.current) {
        restoreFocusRef.current = false;
        if (previouslyFocused?.isConnected) {
          previouslyFocused.focus();
        } else {
          toolbarRef.current
            ?.querySelector<HTMLElement>("button[data-menu-trigger]")
            ?.focus();
        }
      }
      return;
    }

    hasOpenedMenuRef.current = true;
    if (!previouslyFocusedRef.current) {
      previouslyFocusedRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (toolbarRef.current?.contains(event.target as Node)) return;
      if (shapeMenuOpen) menuCallbacksRef.current.onToggleShapeMenu();
      if (backgroundMenuOpen) menuCallbacksRef.current.onToggleBackgroundMenu?.();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      restoreFocusRef.current = true;
      if (shapeMenuOpen) menuCallbacksRef.current.onToggleShapeMenu();
      if (backgroundMenuOpen) menuCallbacksRef.current.onToggleBackgroundMenu?.();
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen, shapeMenuOpen, backgroundMenuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const frame = requestAnimationFrame(() => {
      toolbarRef.current
        ?.querySelector<HTMLElement>(
          "#canvas-shape-menu button, #canvas-background-menu button, #canvas-background-menu input",
        )
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [backgroundMenuOpen, menuOpen, shapeMenuOpen]);

  const selectShape = (shape: CanvasShapeTool) => {
    restoreFocusRef.current = true;
    onSelectTool(shape);
  };

  const shapeToolActive =
    activeTool === "rectangle" ||
    activeTool === "ellipse" ||
    activeTool === "triangle" ||
    activeTool === "diamond" ||
    activeTool === "line";

  return (
    <nav
      ref={toolbarRef}
      className={`simple-floating-actions simple-canvas-toolbar ${
        resolvedPlacement === "top" ? "simple-left-toolbar" : ""
      }`}
      data-canvas-ui
      data-placement={resolvedPlacement}
      aria-label="画布工具"
    >
      {shapeMenuOpen ? (
        <div
          className="simple-shape-menu"
          id="canvas-shape-menu"
          role="menu"
          aria-label="添加形状"
        >
          <button
            type="button"
            role="menuitemradio"
            disabled={disabled}
            onClick={() => selectShape("rectangle")}
            data-active={activeTool === "rectangle"}
            aria-checked={activeTool === "rectangle"}
            aria-label="矩形"
            title="矩形"
          >
            <Icon name="rectangle" />
            <span>矩形</span>
          </button>
          <button
            type="button"
            role="menuitemradio"
            disabled={disabled}
            onClick={() => selectShape("ellipse")}
            data-active={activeTool === "ellipse"}
            aria-checked={activeTool === "ellipse"}
            aria-label="椭圆"
            title="椭圆"
          >
            <Icon name="ellipse" />
            <span>椭圆</span>
          </button>
          <button
            type="button"
            role="menuitemradio"
            disabled={disabled}
            onClick={() => selectShape("triangle")}
            data-active={activeTool === "triangle"}
            aria-checked={activeTool === "triangle"}
            aria-label="三角形"
            title="三角形"
          >
            <Icon name="triangle" />
            <span>三角形</span>
          </button>
          <button
            type="button"
            role="menuitemradio"
            disabled={disabled}
            onClick={() => selectShape("diamond")}
            data-active={activeTool === "diamond"}
            aria-checked={activeTool === "diamond"}
            aria-label="菱形"
            title="菱形"
          >
            <Icon name="diamond" />
            <span>菱形</span>
          </button>
          <button
            type="button"
            role="menuitemradio"
            disabled={disabled}
            onClick={() => selectShape("line")}
            data-active={activeTool === "line"}
            aria-checked={activeTool === "line"}
            aria-label="直线"
            title="直线"
          >
            <Icon name="line" />
            <span>直线</span>
          </button>
        </div>
      ) : null}

      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelectTool("select")}
        data-active={activeTool === "select"}
        aria-label="选择"
        title="选择"
      >
        <Icon name="cursor" />
        <span>选择</span>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onUpload}
        aria-label="上传图片"
        title="上传图片"
      >
        <Icon name="image" />
        <span>上传图片</span>
      </button>
      <button
        type="button"
        className="simple-camera-button"
        disabled={disabled}
        onClick={onCamera}
        aria-label="相机"
        title="相机"
      >
        <Icon name="camera" />
        <span>相机</span>
      </button>
      <span className="simple-toolbar-divider" aria-hidden="true" />
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelectTool("text")}
        data-active={activeTool === "text"}
        aria-label="文字"
        title="文字"
      >
        <Icon name="text" />
        <span>文字</span>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onToggleShapeMenu}
        data-active={shapeMenuOpen || shapeToolActive}
        data-menu-trigger="shape"
        aria-label="形状"
        title="形状"
        aria-controls="canvas-shape-menu"
        aria-haspopup="menu"
        aria-expanded={shapeMenuOpen}
      >
        <Icon name="shapes" />
        <span>形状</span>
      </button>
      {onToggleBackgroundMenu ? (
        <>
          <span className="simple-toolbar-divider" aria-hidden="true" />
          <button
            type="button"
            disabled={disabled}
            onClick={onToggleBackgroundMenu}
            data-active={backgroundMenuOpen}
            data-menu-trigger="background"
            aria-label="画布背景"
            title="画布背景"
            aria-controls="canvas-background-menu"
            aria-haspopup="dialog"
            aria-expanded={backgroundMenuOpen}
          >
            <Icon name="palette" />
            <span>画布背景</span>
          </button>
        </>
      ) : null}
      {children}
    </nav>
  );
}

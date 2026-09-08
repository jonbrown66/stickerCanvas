import type { CanvasTool } from "@/lib/canvas-types";
import { getRovingFocusIndex } from "@/lib/menu-keyboard";
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
  const menuOpenStateRef = useRef({ shape: shapeMenuOpen, background: backgroundMenuOpen });
  const shapeTabCloseFrameRef = useRef<number | null>(null);
  const resolvedPlacement = placement === "left" ? "top" : placement;
  const menuOpen = shapeMenuOpen || backgroundMenuOpen;

  useEffect(() => {
    menuCallbacksRef.current = { onToggleShapeMenu, onToggleBackgroundMenu };
  }, [onToggleBackgroundMenu, onToggleShapeMenu]);

  useEffect(() => {
    menuOpenStateRef.current = { shape: shapeMenuOpen, background: backgroundMenuOpen };
    if (!shapeMenuOpen && shapeTabCloseFrameRef.current !== null) {
      cancelAnimationFrame(shapeTabCloseFrameRef.current);
      shapeTabCloseFrameRef.current = null;
    }
  }, [backgroundMenuOpen, shapeMenuOpen]);

  useEffect(() => () => {
    if (shapeTabCloseFrameRef.current !== null) {
      cancelAnimationFrame(shapeTabCloseFrameRef.current);
    }
  }, []);

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
      event.stopPropagation();
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
  }, [backgroundMenuOpen, menuOpen, shapeMenuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const frame = requestAnimationFrame(() => {
      const toolbar = toolbarRef.current;
      if (!toolbar) return;
      const focusTarget = backgroundMenuOpen
        ? toolbar.querySelector<HTMLElement>(
            '#canvas-background-menu [role="radio"][aria-checked="true"]:not(:disabled)',
          ) ?? toolbar.querySelector<HTMLElement>(
            "#canvas-background-menu button:not(:disabled), #canvas-background-menu input:not(:disabled)",
          )
        : toolbar.querySelector<HTMLElement>("#canvas-shape-menu button:not(:disabled)");
      focusTarget?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [backgroundMenuOpen, menuOpen, shapeMenuOpen]);

  const selectShape = (shape: CanvasShapeTool) => {
    restoreFocusRef.current = true;
    onSelectTool(shape);
  };

  const closeShapeMenuAfterTab = () => {
    if (shapeTabCloseFrameRef.current !== null) return;
    shapeTabCloseFrameRef.current = requestAnimationFrame(() => {
      shapeTabCloseFrameRef.current = null;
      if (menuOpenStateRef.current.shape) {
        menuCallbacksRef.current.onToggleShapeMenu();
      }
    });
  };

  const handleShapeMenuKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const items = Array.from(
      toolbarRef.current?.querySelectorAll<HTMLButtonElement>('#canvas-shape-menu [role="menuitemradio"]') ?? [],
    );
    const nextIndex = getRovingFocusIndex(
      event.key,
      items.indexOf(event.currentTarget),
      items.map((item) => !item.disabled),
    );
    if (nextIndex !== null) {
      event.preventDefault();
      items[nextIndex]?.focus();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      restoreFocusRef.current = true;
      onToggleShapeMenu();
    } else if (event.key === "Tab") {
      closeShapeMenuAfterTab();
    }
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
      aria-label="Canvas tools"
    >
      {shapeMenuOpen ? (
        <div
          className="simple-shape-menu"
          id="canvas-shape-menu"
          role="menu"
          aria-label="Add shape"
        >
          <button
            type="button"
            role="menuitemradio"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => selectShape("rectangle")}
            data-active={activeTool === "rectangle"}
            aria-checked={activeTool === "rectangle"}
            aria-label="Rectangle"
            title="Rectangle"
            onKeyDown={handleShapeMenuKeyDown}
          >
            <Icon name="rectangle" />
            <span>Rectangle</span>
          </button>
          <button
            type="button"
            role="menuitemradio"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => selectShape("ellipse")}
            data-active={activeTool === "ellipse"}
            aria-checked={activeTool === "ellipse"}
            aria-label="Ellipse"
            title="Ellipse"
            onKeyDown={handleShapeMenuKeyDown}
          >
            <Icon name="ellipse" />
            <span>Ellipse</span>
          </button>
          <button
            type="button"
            role="menuitemradio"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => selectShape("triangle")}
            data-active={activeTool === "triangle"}
            aria-checked={activeTool === "triangle"}
            aria-label="Triangle"
            title="Triangle"
            onKeyDown={handleShapeMenuKeyDown}
          >
            <Icon name="triangle" />
            <span>Triangle</span>
          </button>
          <button
            type="button"
            role="menuitemradio"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => selectShape("diamond")}
            data-active={activeTool === "diamond"}
            aria-checked={activeTool === "diamond"}
            aria-label="Diamond"
            title="Diamond"
            onKeyDown={handleShapeMenuKeyDown}
          >
            <Icon name="diamond" />
            <span>Diamond</span>
          </button>
          <button
            type="button"
            role="menuitemradio"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => selectShape("line")}
            data-active={activeTool === "line"}
            aria-checked={activeTool === "line"}
            aria-label="Line"
            title="Line"
            onKeyDown={handleShapeMenuKeyDown}
          >
            <Icon name="line" />
            <span>Line</span>
          </button>
        </div>
      ) : null}

      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelectTool("select")}
        data-active={activeTool === "select"}
        aria-label="Select"
        title="Select"
      >
        <Icon name="cursor" />
        <span>Select</span>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onUpload}
        aria-label="Upload image"
        title="Upload image"
      >
        <Icon name="image" />
        <span>Upload image</span>
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
      <span className="simple-toolbar-divider" aria-hidden="true" />
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
        data-menu-trigger="shape"
        aria-label="Shapes"
        title="Shapes"
        aria-controls="canvas-shape-menu"
        aria-haspopup="menu"
        aria-expanded={shapeMenuOpen}
      >
        <Icon name="shapes" />
        <span>Shapes</span>
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
            aria-label="Canvas background"
            title="Canvas background"
            aria-controls="canvas-background-menu"
            aria-haspopup="dialog"
            aria-expanded={backgroundMenuOpen}
          >
            <Icon name="palette" />
            <span>Canvas background</span>
          </button>
        </>
      ) : null}
      {children}
    </nav>
  );
}

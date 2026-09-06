"use client";

import { useEffect, useRef, useState } from "react";
import { getRovingFocusIndex } from "@/lib/menu-keyboard";
import { Icon } from "./Icon";

interface CanvasTopBarProps {
  disabled: boolean;
  historyOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onToggleHistory: () => void;
  onNewCanvas: () => void;
  onDownloadCanvas: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function CanvasTopBar({
  disabled,
  historyOpen,
  canUndo,
  canRedo,
  onToggleHistory,
  onNewCanvas,
  onDownloadCanvas,
  onUndo,
  onRedo,
}: CanvasTopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const tabCloseFrameRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (tabCloseFrameRef.current !== null) {
      cancelAnimationFrame(tabCloseFrameRef.current);
    }
  }, []);

  useEffect(() => {
    if (!menuOpen && tabCloseFrameRef.current !== null) {
      cancelAnimationFrame(tabCloseFrameRef.current);
      tabCloseFrameRef.current = null;
    }
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;

    const frame = requestAnimationFrame(() => {
      menuRef.current
        ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
        ?.focus();
    });

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        restoreFocusRef.current = true;
        setMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    menuButtonRef.current?.focus();
  }, [menuOpen]);

  const runMenuAction = (action: () => void) => {
    restoreFocusRef.current = true;
    setMenuOpen(false);
    action();
  };

  const focusMenuItem = (key: string, currentTarget: HTMLButtonElement) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    const nextIndex = getRovingFocusIndex(
      key,
      items.indexOf(currentTarget),
      items.map((item) => !item.disabled),
    );
    if (nextIndex === null) return false;
    items[nextIndex]?.focus();
    return true;
  };

  const handleMenuItemKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (focusMenuItem(event.key, event.currentTarget)) {
      event.preventDefault();
      return;
    }
    if (event.key === "Tab") {
      if (tabCloseFrameRef.current !== null) return;
      tabCloseFrameRef.current = requestAnimationFrame(() => {
        tabCloseFrameRef.current = null;
        setMenuOpen(false);
      });
    }
  };

  return (
    <header className="simple-canvas-topbar" data-canvas-ui>
      <div className="simple-canvas-topbar-leading" ref={menuRef}>
        <button
          type="button"
          className="simple-canvas-menu-button"
          ref={menuButtonRef}
          data-active={menuOpen}
          aria-label="Canvas menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Canvas menu"
          onClick={() => setMenuOpen((current) => !current)}
        >
          <Icon name="menu" />
        </button>

        {menuOpen ? (
          <div className="simple-canvas-menu" role="menu" aria-label="Canvas actions">
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              data-active={historyOpen}
              disabled={disabled}
              aria-label="Canvas history"
              title="Canvas history"
              onKeyDown={handleMenuItemKeyDown}
              onClick={() => runMenuAction(onToggleHistory)}
            >
              <Icon name="history" />
            </button>
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={disabled}
              aria-label="New canvas"
              title="New canvas"
              onKeyDown={handleMenuItemKeyDown}
              onClick={() => runMenuAction(onNewCanvas)}
            >
              <Icon name="plus" />
            </button>
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={disabled}
              aria-label="Download canvas"
              title="Download canvas"
              onKeyDown={handleMenuItemKeyDown}
              onClick={() => runMenuAction(onDownloadCanvas)}
            >
              <Icon name="download" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="simple-canvas-topbar-trailing">
        <div className="simple-canvas-history-actions" aria-label="History actions">
          <button
            type="button"
            disabled={disabled || !canUndo}
            aria-label="Undo"
            title="Undo"
            onClick={onUndo}
          >
            <Icon name="undo" />
          </button>
          <button
            type="button"
            disabled={disabled || !canRedo}
            aria-label="Redo"
            title="Redo"
            onClick={onRedo}
          >
            <Icon name="redo" />
          </button>
        </div>
      </div>
    </header>
  );
}

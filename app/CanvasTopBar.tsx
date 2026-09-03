"use client";

import { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    if (!menuOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        restoreFocusRef.current = true;
        setMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
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

  return (
    <header className="simple-canvas-topbar" data-canvas-ui>
      <div className="simple-canvas-topbar-leading" ref={menuRef}>
        <button
          type="button"
          className="simple-canvas-menu-button"
          ref={menuButtonRef}
          data-active={menuOpen}
          aria-label="画布菜单"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="画布菜单"
          onClick={() => setMenuOpen((current) => !current)}
        >
          <Icon name="menu" />
        </button>

        {menuOpen ? (
          <div className="simple-canvas-menu" role="menu" aria-label="画布操作">
            <button
              type="button"
              role="menuitem"
              data-active={historyOpen}
              disabled={disabled}
              aria-label="画布历史"
              title="画布历史"
              onClick={() => runMenuAction(onToggleHistory)}
            >
              <Icon name="history" />
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={disabled}
              aria-label="新建画布"
              title="新建画布"
              onClick={() => runMenuAction(onNewCanvas)}
            >
              <Icon name="plus" />
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={disabled}
              aria-label="下载画布"
              title="下载画布"
              onClick={() => runMenuAction(onDownloadCanvas)}
            >
              <Icon name="download" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="simple-canvas-topbar-trailing">
        <div className="simple-canvas-history-actions" aria-label="历史操作">
          <button
            type="button"
            disabled={disabled || !canUndo}
            aria-label="撤销"
            title="撤销"
            onClick={onUndo}
          >
            <Icon name="undo" />
          </button>
          <button
            type="button"
            disabled={disabled || !canRedo}
            aria-label="重做"
            title="重做"
            onClick={onRedo}
          >
            <Icon name="redo" />
          </button>
        </div>
      </div>
    </header>
  );
}

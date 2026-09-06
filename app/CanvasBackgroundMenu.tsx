"use client";

import type { CanvasBackgroundConfig } from "@/lib/canvas-types";
import { CANVAS_BG_PRESETS, CANVAS_BG_STYLES } from "@/lib/canvas-types";
import { getRovingFocusIndex } from "@/lib/menu-keyboard";
import { CanvasColorInput } from "./CanvasColorInput";

interface CanvasBackgroundMenuProps {
  config: CanvasBackgroundConfig;
  onChange: (next: CanvasBackgroundConfig) => void;
  onClose?: () => void;
}

export function CanvasBackgroundMenu({
  config,
  onChange,
  onClose,
}: CanvasBackgroundMenuProps) {
  const handleStyleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const nextIndex = getRovingFocusIndex(
      event.key,
      CANVAS_BG_STYLES.findIndex((item) => item.id === event.currentTarget.dataset.styleId),
      CANVAS_BG_STYLES.map(() => true),
    );
    if (nextIndex !== null) {
      event.preventDefault();
      const nextStyle = CANVAS_BG_STYLES[nextIndex];
      if (nextStyle) {
        event.currentTarget.parentElement
          ?.querySelector<HTMLButtonElement>(`[data-style-id="${nextStyle.id}"]`)
          ?.focus();
        onChange({ ...config, style: nextStyle.id });
      }
    }
  };

  return (
    <div
      className="canvas-background-menu"
      id="canvas-background-menu"
      role="dialog"
      aria-modal="false"
      aria-label="Canvas background settings"
      tabIndex={-1}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onClose?.();
        }
      }}
    >
      <div className="canvas-bg-heading">
        <span>Canvas Style</span>
      </div>
      <div className="canvas-bg-styles-grid" role="radiogroup" aria-label="Background pattern">
        {CANVAS_BG_STYLES.map((item) => (
          <button
            key={item.id}
            type="button"
            className="canvas-bg-style-item"
            data-active={config.style === item.id}
            data-style-id={item.id}
            aria-checked={config.style === item.id}
            role="radio"
            tabIndex={config.style === item.id ? 0 : -1}
            title={item.label}
            onKeyDown={handleStyleKeyDown}
            onClick={() => onChange({ ...config, style: item.id })}
          >
            <span className={`canvas-bg-style-preview preview-${item.id}`} />
            <span className="canvas-bg-style-label">{item.label}</span>
          </button>
        ))}
      </div>

      {config.style !== "transparent" ? (
        <>
          <div className="canvas-bg-heading">
            <span>Background Colors</span>
          </div>
          <div className="canvas-bg-colors-row">
            {CANVAS_BG_PRESETS.map((preset) => (
              <button
                key={preset.color}
                type="button"
                className="canvas-bg-swatch"
                data-active={config.color.toLowerCase() === preset.color.toLowerCase()}
                style={{ backgroundColor: preset.color }}
                title={preset.label}
                onClick={() => onChange({ ...config, color: preset.color })}
              />
            ))}
            <CanvasColorInput
              label="Custom background color"
              value={config.color}
              onChange={(color) => onChange({ ...config, color })}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

"use client";

import type { CanvasBackgroundConfig } from "@/lib/canvas-types";
import { CANVAS_BG_PRESETS, CANVAS_BG_STYLES } from "@/lib/canvas-types";
import { CanvasColorInput } from "./CanvasColorInput";

interface CanvasBackgroundMenuProps {
  config: CanvasBackgroundConfig;
  onChange: (next: CanvasBackgroundConfig) => void;
  onClose?: () => void;
}

export function CanvasBackgroundMenu({
  config,
  onChange,
}: CanvasBackgroundMenuProps) {
  return (
    <div
      className="canvas-background-menu"
      id="canvas-background-menu"
      role="dialog"
      aria-modal="false"
      aria-label="画布背景设置"
      tabIndex={-1}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="canvas-bg-heading">
        <span>画布样式</span>
      </div>
      <div className="canvas-bg-styles-grid" role="radiogroup" aria-label="背景网格样式">
        {CANVAS_BG_STYLES.map((item) => (
          <button
            key={item.id}
            type="button"
            className="canvas-bg-style-item"
            data-active={config.style === item.id}
            aria-checked={config.style === item.id}
            role="radio"
            title={item.label}
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
            <span>背景配色</span>
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
              label="自定义背景色"
              value={config.color}
              onChange={(color) => onChange({ ...config, color })}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

"use client";

import type { SyntheticEvent } from "react";
import type { CanvasBackgroundConfig } from "@/lib/canvas-types";
import { CANVAS_BG_PRESETS, CANVAS_BG_STYLES } from "@/lib/canvas-types";
import { getRovingFocusIndex } from "@/lib/menu-keyboard";
import { CanvasColorInput } from "./CanvasColorInput";
import { Icon } from "./Icon";

interface CanvasBackgroundInspectorProps {
  config: CanvasBackgroundConfig;
  onChange: (next: CanvasBackgroundConfig) => void;
  onClose: () => void;
}

export function CanvasBackgroundInspector({
  config,
  onChange,
  onClose,
}: CanvasBackgroundInspectorProps) {
  const stopEvent = (event: SyntheticEvent) => event.stopPropagation();

  const handleOpacityChange = (value: number) => {
    onChange({
      ...config,
      gridOpacity: Math.max(0, Math.min(1, value / 100)),
    });
  };

  const opacityValue = Math.round((config.gridOpacity ?? 0.42) * 100);

  const handleStyleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const nextIndex = getRovingFocusIndex(
      event.key,
      CANVAS_BG_STYLES.findIndex((item) => item.id === event.currentTarget.dataset.styleId),
      CANVAS_BG_STYLES.map(() => true),
    );
    if (nextIndex === null) return;
    event.preventDefault();
    const nextStyle = CANVAS_BG_STYLES[nextIndex];
    if (nextStyle) {
      event.currentTarget.parentElement
        ?.querySelector<HTMLButtonElement>(`[data-style-id="${nextStyle.id}"]`)
        ?.focus();
      onChange({ ...config, style: nextStyle.id });
    }
  };

  return (
    <aside
      className="canvas-properties-panel"
      data-canvas-ui
      data-element-type="canvas"
      aria-label="Canvas background settings"
      onPointerDown={stopEvent}
      onTouchStart={stopEvent}
    >
      <section className="canvas-properties-section" aria-labelledby="canvas-bg-title">
        <div className="canvas-properties-section-heading">
          <h2 id="canvas-bg-title">Canvas Background</h2>
          <button
            type="button"
            className="canvas-properties-panel-close"
            aria-label="Close panel"
            title="Close"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="canvas-bg-styles-grid" role="radiogroup" aria-label="Background pattern" style={{ marginTop: 4 }}>
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
      </section>

      {config.style !== "transparent" ? (
        <>
          <section className="canvas-properties-section" aria-labelledby="canvas-bg-color-title">
            <div className="canvas-properties-section-heading">
              <h2 id="canvas-bg-color-title">Background Color</h2>
            </div>
            <div className="canvas-bg-colors-row" style={{ marginTop: 4 }}>
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
          </section>

          {config.style !== "solid" ? (
            <section className="canvas-properties-section" aria-labelledby="canvas-grid-opacity-title">
              <label className="canvas-properties-range" title="Pattern opacity">
                <div className="canvas-properties-range-heading">
                  <span className="canvas-properties-range-label">
                    <Icon name="sliders" />
                    Pattern opacity
                  </span>
                  <output>{opacityValue}%</output>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={1}
                  value={opacityValue}
                  aria-label="Pattern opacity"
                  style={{ "--range-progress": `${opacityValue}%` } as React.CSSProperties}
                  onChange={(e) => handleOpacityChange(Number(e.currentTarget.value))}
                />
              </label>
            </section>
          ) : null}
        </>
      ) : null}
    </aside>
  );
}

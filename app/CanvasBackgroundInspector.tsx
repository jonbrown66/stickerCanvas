"use client";

import type { SyntheticEvent } from "react";
import type { CanvasBackgroundConfig } from "@/lib/canvas-types";
import { CANVAS_BG_PRESETS, CANVAS_BG_STYLES } from "@/lib/canvas-types";
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

  return (
    <aside
      className="canvas-properties-panel"
      data-canvas-ui
      data-element-type="canvas"
      aria-label="画布背景设置"
      onPointerDown={stopEvent}
      onTouchStart={stopEvent}
    >
      <section className="canvas-properties-section" aria-labelledby="canvas-bg-title">
        <div className="canvas-properties-section-heading">
          <h2 id="canvas-bg-title">画布背景</h2>
          <button
            type="button"
            className="canvas-properties-panel-close"
            aria-label="关闭面板"
            title="关闭"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="canvas-bg-styles-grid" role="radiogroup" aria-label="背景网格样式" style={{ marginTop: 4 }}>
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
      </section>

      {config.style !== "transparent" ? (
        <>
          <section className="canvas-properties-section" aria-labelledby="canvas-bg-color-title">
            <div className="canvas-properties-section-heading">
              <h2 id="canvas-bg-color-title">底色</h2>
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
                label="自定义底色"
                value={config.color}
                onChange={(color) => onChange({ ...config, color })}
              />
            </div>
          </section>

          {config.style !== "solid" ? (
            <section className="canvas-properties-section" aria-labelledby="canvas-grid-opacity-title">
              <label className="canvas-properties-range" title="网格透明度">
                <div className="canvas-properties-range-heading">
                  <span className="canvas-properties-range-label">
                    <Icon name="sliders" />
                    网格深浅
                  </span>
                  <output>{opacityValue}%</output>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={1}
                  value={opacityValue}
                  aria-label="网格深浅"
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

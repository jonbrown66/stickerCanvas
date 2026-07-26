"use client";

import {
  useCallback,
  useState,
  type PointerEvent,
  type TouchEvent,
} from "react";
import type { CanvasSticker, StickerStyleOptions } from "@/lib/canvas-types";
import { Icon } from "./Icon";

const QUICK_COLORS = ["#ffffff", "#1a1a1a", "#f4a0c0", "#7dcea0", "#85c1e9"];

interface StickerSettingsToolbarProps {
  sticker: CanvasSticker;
  placement?: "left" | "right";
  onStyleChange: (
    patch: Partial<StickerStyleOptions>,
    commit?: boolean,
  ) => void;
  onDelete: () => void;
  onDownload: () => void;
  onCutout?: () => void;
}

export function StickerSettingsPanel({
  sticker,
  placement = "right",
  onStyleChange,
  onDelete,
  onDownload,
  onCutout,
}: StickerSettingsToolbarProps) {
  const [localWidth, setLocalWidth] = useState<number | null>(null);
  const [activeFlyout, setActiveFlyout] = useState<"stroke" | "color" | null>(
    null,
  );

  const stopEvent = (e: PointerEvent<HTMLElement> | TouchEvent<HTMLElement>) => {
    e.stopPropagation();
  };

  const changeWidth = useCallback(
    (value: number, commit: boolean) => {
      setLocalWidth(commit ? null : value);
      onStyleChange({ outlineWidth: value }, commit);
    },
    [onStyleChange],
  );

  const toggleFlyout = (mode: "stroke" | "color") => {
    setActiveFlyout((prev) => (prev === mode ? null : mode));
  };

  const currentOutlineWidth =
    activeFlyout === "stroke"
      ? (localWidth ?? sticker.outlineWidth ?? 0)
      : (sticker.outlineWidth ?? 0);

  return (
    <div
      style={{ transformOrigin: placement === "left" ? "100% 0%" : "0% 0%" }}
      className="sticker-vertical-toolbar"
      data-placement={placement}
      data-canvas-ui
      onPointerDown={stopEvent}
      onTouchStart={stopEvent}
    >
      {/* 1. Cutout (Remove Background) Button */}
      {onCutout ? (
        <>
          <div className="sticker-vtoolbar-item">
            <button
              type="button"
              className="sticker-vtoolbar-btn cutout-btn"
              data-disabled={Boolean(sticker.isCutout)}
              disabled={Boolean(sticker.isCutout)}
              onClick={onCutout}
              title={sticker.isCutout ? "Already cut out" : "Auto Cutout (Remove BG)"}
              aria-label="Remove background"
            >
              <Icon name="scissors" />
            </button>
          </div>
          <div className="sticker-vtoolbar-divider" />
        </>
      ) : null}

      {/* 2. Stroke Width Item */}
      <div className="sticker-vtoolbar-item">
        <button
          type="button"
          className="sticker-vtoolbar-btn"
          data-active={activeFlyout === "stroke" || (sticker.outlineWidth ?? 0) > 0}
          onClick={() => toggleFlyout("stroke")}
          title="Stroke Width"
          aria-label="Stroke width"
        >
          <Icon name="stroke" />
        </button>

        {activeFlyout === "stroke" ? (
            <div
              style={{ transformOrigin: placement === "left" ? "100% 50%" : "0% 50%" }}
              className="sticker-vtoolbar-flyout stroke-flyout"
              onPointerDown={stopEvent}
              onTouchStart={stopEvent}
            >
              <input
                type="range"
                aria-label="Stroke width"
                min={0}
                max={24}
                step={1}
                value={currentOutlineWidth}
                onChange={(event) =>
                  changeWidth(Number(event.currentTarget.value), false)
                }
                onPointerUp={() => changeWidth(currentOutlineWidth, true)}
                onKeyUp={() => changeWidth(currentOutlineWidth, true)}
                onBlur={() => changeWidth(currentOutlineWidth, true)}
                className="sticker-stroke-range"
              />
              <span className="sticker-toolbar-val">{currentOutlineWidth}px</span>
            </div>
          ) : null}
      </div>

      {/* 3. Color Swatch & Palette Item */}
      <div className="sticker-vtoolbar-item">
        <button
          type="button"
          className="sticker-vtoolbar-btn"
          data-active={activeFlyout === "color"}
          onClick={() => toggleFlyout("color")}
          title="Color"
          aria-label="Color palette"
        >
          <span
            className="sticker-vtoolbar-color-dot"
            style={{ backgroundColor: sticker.outlineColor || "#ffffff" }}
          />
        </button>

        {activeFlyout === "color" ? (
            <div
              style={{ transformOrigin: placement === "left" ? "100% 50%" : "0% 50%" }}
              className="sticker-vtoolbar-flyout color-flyout"
              onPointerDown={stopEvent}
              onTouchStart={stopEvent}
            >
              {QUICK_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="sticker-color-swatch-sm"
                  style={{ backgroundColor: c }}
                  data-active={sticker.outlineColor === c}
                  aria-label={`Use ${c} outline`}
                  onClick={() => {
                    onStyleChange({ outlineColor: c });
                    setActiveFlyout(null);
                  }}
                />
              ))}
              <label className="sticker-color-custom-sm" title="Custom color">
                <input
                  type="color"
                  aria-label="Custom outline color"
                  value={sticker.outlineColor || "#ffffff"}
                  onChange={(e) =>
                    onStyleChange({ outlineColor: e.target.value })
                  }
                />
              </label>
            </div>
          ) : null}
      </div>

      {/* 4. Holo Switch */}
      <div className="sticker-vtoolbar-item">
        <button
          type="button"
          className="sticker-vtoolbar-btn"
          data-active={Boolean(sticker.oilFilmEnabled)}
          onClick={() =>
            onStyleChange({ oilFilmEnabled: !sticker.oilFilmEnabled })
          }
          title="Holo Effect"
          aria-label="Holo effect"
        >
          <Icon name="sparkles" />
        </button>
      </div>

      <div className="sticker-vtoolbar-divider" />

      {/* 5. Save PNG */}
      <div className="sticker-vtoolbar-item">
        <button
          type="button"
          className="sticker-vtoolbar-btn"
          onClick={onDownload}
          title="Save PNG"
          aria-label="Download PNG"
        >
          <Icon name="download" />
        </button>
      </div>

      {/* 6. Delete */}
      <div className="sticker-vtoolbar-item">
        <button
          type="button"
          className="sticker-vtoolbar-btn delete"
          onClick={onDelete}
          title="Delete"
          aria-label="Delete"
        >
          <Icon name="trash" />
        </button>
      </div>
    </div>
  );
}

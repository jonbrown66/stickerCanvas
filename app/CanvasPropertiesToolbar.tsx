"use client";

import {
  useState,
  type PointerEvent,
  type TouchEvent,
} from "react";
import type {
  CanvasShapeElement,
  CanvasTextElement,
} from "@/lib/canvas-types";
import { Icon } from "./Icon";

type EditableElement = CanvasTextElement | CanvasShapeElement;
type Flyout = "font-size" | "border-width" | "text-outline-width" | null;

interface CanvasPropertiesToolbarProps {
  element: EditableElement;
  placement?: "left" | "right";
  onChange: (patch: Partial<EditableElement>, commit?: boolean) => void;
  onDelete: () => void;
}

interface ColorInputProps {
  label: string;
  visibleLabel?: string;
  value: string;
  onChange: (value: string, commit: boolean) => void;
}

function ColorInput({
  label,
  visibleLabel = label,
  value,
  onChange,
}: ColorInputProps) {
  return (
    <label className="canvas-style-color" title={label}>
      <input
        type="color"
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.currentTarget.value, false)}
        onBlur={(event) => onChange(event.currentTarget.value, true)}
      />
      <span
        className="canvas-style-color-dot"
        style={{ backgroundColor: value }}
        aria-hidden="true"
      />
      <span className="sticker-vtoolbar-label" aria-hidden="true">
        {visibleLabel}
      </span>
    </label>
  );
}

export function CanvasPropertiesToolbar({
  element,
  placement = "right",
  onChange,
  onDelete,
}: CanvasPropertiesToolbarProps) {
  const [activeFlyout, setActiveFlyout] = useState<Flyout>(null);
  const isText = element.type === "text";
  const backgroundEnabled = isText
    ? element.backgroundColor !== "transparent"
    : element.fillEnabled;
  const backgroundColor = isText
    ? backgroundEnabled
      ? element.backgroundColor
      : "#fff8ec"
    : element.fillColor;
  const borderEnabled = isText ? element.borderWidth > 0 : true;
  const borderColor = isText ? element.borderColor : element.strokeColor;
  const borderWidth = isText ? element.borderWidth : element.strokeWidth;
  const textOutlineEnabled = isText && element.textOutlineWidth > 0;
  const textHoloEnabled = isText && element.holoEnabled;

  const stopEvent = (
    event: PointerEvent<HTMLElement> | TouchEvent<HTMLElement>,
  ) => {
    event.stopPropagation();
  };

  const toggleFlyout = (flyout: Exclude<Flyout, null>) => {
    setActiveFlyout((current) => (current === flyout ? null : flyout));
  };

  return (
    <div
      className="sticker-vertical-toolbar canvas-element-toolbar sticker-labeled-toolbar"
      data-placement={placement}
      data-canvas-ui
      onPointerDown={stopEvent}
      onTouchStart={stopEvent}
    >
      {isText ? (
        <>
          <div className="sticker-vtoolbar-item">
            <button
              type="button"
              className="sticker-vtoolbar-btn"
              data-active={activeFlyout === "font-size"}
              aria-label="Font size"
              title="Font size"
              onClick={() => toggleFlyout("font-size")}
            >
              <Icon name="text" />
              <span className="sticker-vtoolbar-label">Size</span>
            </button>
            {activeFlyout === "font-size" ? (
              <label
                className="sticker-vtoolbar-flyout canvas-property-flyout"
                title="Font size"
              >
                <input
                  type="range"
                  min={12}
                  max={96}
                  value={element.fontSize}
                  aria-label="Font size"
                  onChange={(event) =>
                    onChange(
                      { fontSize: Number(event.currentTarget.value) },
                      false,
                    )
                  }
                  onPointerUp={(event) =>
                    onChange(
                      { fontSize: Number(event.currentTarget.value) },
                      true,
                    )
                  }
                  onKeyUp={(event) =>
                    onChange(
                      { fontSize: Number(event.currentTarget.value) },
                      true,
                    )
                  }
                />
              </label>
            ) : null}
          </div>
          <div className="sticker-vtoolbar-item">
            <button
              type="button"
              className="sticker-vtoolbar-btn"
              data-active={element.fontWeight >= 600}
              aria-label="Bold"
              title="Bold"
              onClick={() =>
                onChange(
                  {
                    fontWeight: element.fontWeight >= 600 ? 400 : 700,
                  },
                  true,
                )
              }
            >
              <Icon name="bold" />
              <span className="sticker-vtoolbar-label">Bold</span>
            </button>
          </div>
          <div className="sticker-vtoolbar-item">
            <button
              type="button"
              className="sticker-vtoolbar-btn"
              aria-label="Text alignment"
              title="Text alignment"
              onClick={() => {
                const textAlign =
                  element.textAlign === "left"
                    ? "center"
                    : element.textAlign === "center"
                      ? "right"
                      : "left";
                onChange({ textAlign }, true);
              }}
            >
              <Icon name={`align-${element.textAlign}`} />
              <span className="sticker-vtoolbar-label">Align</span>
            </button>
          </div>
          <div className="sticker-vtoolbar-item">
            <ColorInput
              label="Text color"
              visibleLabel="Text"
              value={element.color}
              onChange={(color, commit) => onChange({ color }, commit)}
            />
          </div>
          <div className="sticker-vtoolbar-item">
            <button
              type="button"
              className="sticker-vtoolbar-btn"
              data-active={textOutlineEnabled}
              aria-label={
                textOutlineEnabled
                  ? "Remove sticker outline"
                  : "Add sticker outline"
              }
              title={
                textOutlineEnabled
                  ? "Remove sticker outline"
                  : "Add sticker outline"
              }
              onClick={() =>
                onChange(
                  {
                    textOutlineWidth: textOutlineEnabled
                      ? 0
                      : Math.min(48, Math.max(1, element.fontSize * 0.18)),
                  },
                  true,
                )
              }
            >
              <Icon name="sparkles" />
              <span className="sticker-vtoolbar-label">Outline</span>
            </button>
          </div>
          {textOutlineEnabled ? (
            <div className="sticker-vtoolbar-item">
              <ColorInput
                label="Text outline color"
                visibleLabel="Outline color"
                value={element.textOutlineColor}
                onChange={(color, commit) =>
                  onChange({ textOutlineColor: color }, commit)
                }
              />
            </div>
          ) : null}
          <div className="sticker-vtoolbar-item">
            <button
              type="button"
              className="sticker-vtoolbar-btn"
              data-active={activeFlyout === "text-outline-width"}
              aria-label="Text outline width"
              title="Text outline width"
              onClick={() => toggleFlyout("text-outline-width")}
            >
              <Icon name="stroke" />
              <span className="sticker-vtoolbar-label">Outline width</span>
            </button>
            {activeFlyout === "text-outline-width" ? (
              <label
                className="sticker-vtoolbar-flyout canvas-property-flyout"
                title="Text outline width"
              >
                <input
                  type="range"
                  min={0}
                  max={48}
                  step={0.5}
                  value={element.textOutlineWidth}
                  aria-label="Text outline width"
                  onChange={(event) =>
                    onChange(
                      { textOutlineWidth: Number(event.currentTarget.value) },
                      false,
                    )
                  }
                  onPointerUp={(event) =>
                    onChange(
                      { textOutlineWidth: Number(event.currentTarget.value) },
                      true,
                    )
                  }
                  onKeyUp={(event) =>
                    onChange(
                      { textOutlineWidth: Number(event.currentTarget.value) },
                      true,
                    )
                  }
                />
              </label>
            ) : null}
          </div>
          <div className="sticker-vtoolbar-item">
            <button
              type="button"
              className="sticker-vtoolbar-btn"
              data-active={textHoloEnabled}
              aria-label={textHoloEnabled ? "Turn off Holo" : "Turn on Holo"}
              title={textHoloEnabled ? "Turn off Holo" : "Turn on Holo"}
              onClick={() => onChange({ holoEnabled: !element.holoEnabled }, true)}
            >
              <Icon name="sparkles" />
              <span className="sticker-vtoolbar-label">Holo</span>
            </button>
          </div>
          <div className="sticker-vtoolbar-divider" />
        </>
      ) : null}

      <div className="sticker-vtoolbar-item">
        <button
          type="button"
          className="sticker-vtoolbar-btn"
          data-active={backgroundEnabled}
          aria-label={
            backgroundEnabled ? "Transparent background" : "Add background"
          }
          title={
            backgroundEnabled ? "Transparent background" : "Add background"
          }
          onClick={() =>
            onChange(
              isText
                ? {
                    backgroundColor: backgroundEnabled
                      ? "transparent"
                      : backgroundColor,
                  }
                : { fillEnabled: !backgroundEnabled },
              true,
            )
          }
        >
          <Icon name="fill" />
          <span className="sticker-vtoolbar-label">Fill</span>
        </button>
      </div>
      {backgroundEnabled ? (
        <div className="sticker-vtoolbar-item">
          <ColorInput
            label={isText ? "Background color" : "Fill color"}
            visibleLabel="Fill color"
            value={backgroundColor}
            onChange={(value, commit) =>
              onChange(
                isText ? { backgroundColor: value } : { fillColor: value },
                commit,
              )
            }
          />
        </div>
      ) : null}

      {isText ? (
        <div className="sticker-vtoolbar-item">
          <button
            type="button"
            className="sticker-vtoolbar-btn"
            data-active={borderEnabled}
            aria-label={borderEnabled ? "Remove border" : "Add border"}
            title={borderEnabled ? "Remove border" : "Add border"}
            onClick={() =>
              onChange({ borderWidth: borderEnabled ? 0 : 2 }, true)
            }
          >
            <Icon name="stroke" />
            <span className="sticker-vtoolbar-label">Box</span>
          </button>
        </div>
      ) : null}
      {borderEnabled ? (
        <div className="sticker-vtoolbar-item">
          <ColorInput
            label="Border color"
            visibleLabel={isText ? "Box color" : "Stroke color"}
            value={borderColor}
            onChange={(value, commit) =>
              onChange(
                isText ? { borderColor: value } : { strokeColor: value },
                commit,
              )
            }
          />
        </div>
      ) : null}

      <div className="sticker-vtoolbar-item">
        <button
          type="button"
          className="sticker-vtoolbar-btn"
          data-active={activeFlyout === "border-width"}
          aria-label="Border width"
          title="Border width"
          onClick={() => toggleFlyout("border-width")}
        >
          <Icon name="sliders" />
          <span className="sticker-vtoolbar-label">
            {isText ? "Box width" : "Stroke width"}
          </span>
        </button>
        {activeFlyout === "border-width" ? (
          <label
            className="sticker-vtoolbar-flyout canvas-property-flyout"
            title="Border width"
          >
            <input
              type="range"
              min={isText ? 0 : 1}
              max={16}
              value={borderWidth}
              aria-label="Border width"
              onChange={(event) => {
                const value = Number(event.currentTarget.value);
                onChange(
                  isText ? { borderWidth: value } : { strokeWidth: value },
                  false,
                );
              }}
              onPointerUp={(event) => {
                const value = Number(event.currentTarget.value);
                onChange(
                  isText ? { borderWidth: value } : { strokeWidth: value },
                  true,
                );
              }}
              onKeyUp={(event) => {
                const value = Number(event.currentTarget.value);
                onChange(
                  isText ? { borderWidth: value } : { strokeWidth: value },
                  true,
                );
              }}
            />
          </label>
        ) : null}
      </div>

      <div className="sticker-vtoolbar-divider" />
      <div className="sticker-vtoolbar-item">
        <button
          type="button"
          className="sticker-vtoolbar-btn delete"
          aria-label="Delete"
          title="Delete"
          onClick={onDelete}
        >
          <Icon name="trash" />
          <span className="sticker-vtoolbar-label">Delete</span>
        </button>
      </div>
    </div>
  );
}

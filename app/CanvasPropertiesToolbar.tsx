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
type Flyout = "font-size" | "border-width" | null;

interface CanvasPropertiesToolbarProps {
  element: EditableElement;
  placement?: "left" | "right";
  onChange: (patch: Partial<EditableElement>, commit?: boolean) => void;
  onDelete: () => void;
}

interface ColorInputProps {
  label: string;
  value: string;
  onChange: (value: string, commit: boolean) => void;
}

function ColorInput({ label, value, onChange }: ColorInputProps) {
  return (
    <label className="canvas-style-color" title={label}>
      <input
        type="color"
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.currentTarget.value, false)}
        onBlur={(event) => onChange(event.currentTarget.value, true)}
      />
      <span style={{ backgroundColor: value }} aria-hidden="true" />
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
      className="sticker-vertical-toolbar canvas-element-toolbar"
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
            </button>
          </div>
          <div className="sticker-vtoolbar-item">
            <ColorInput
              label="Text color"
              value={element.color}
              onChange={(color, commit) => onChange({ color }, commit)}
            />
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
        </button>
      </div>
      {backgroundEnabled ? (
        <div className="sticker-vtoolbar-item">
          <ColorInput
            label={isText ? "Background color" : "Fill color"}
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
          </button>
        </div>
      ) : null}
      {borderEnabled ? (
        <div className="sticker-vtoolbar-item">
          <ColorInput
            label="Border color"
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
        </button>
      </div>
    </div>
  );
}

import {
  useState,
  useLayoutEffect,
  useRef,
  type ComponentProps,
  type CSSProperties,
  type PointerEvent,
  type TouchEvent,
} from "react";
import { createStyleCommitBoundary } from "@/lib/style-commit";
import type {
  CanvasElement,
  CanvasTextElement,
} from "@/lib/canvas-types";
import {
  DEFAULT_STICKER_CORNER_RADIUS,
  DEFAULT_STICKER_SHADOW_BLUR,
  MAX_STICKER_CORNER_RADIUS,
  MAX_STICKER_SHADOW_BLUR,
} from "@/lib/canvas-types";
import { CanvasColorInput } from "./CanvasColorInput";
import { Icon } from "./Icon";

type IconName = ComponentProps<typeof Icon>["name"];
type PanelFlyout =
  | "image-style"
  | "font-size"
  | "text-outline-width"
  | "border-width"
  | null;
export type CanvasLayerAction =
  | "send-back"
  | "backward"
  | "forward"
  | "bring-front";

type CanvasPropertiesPatch = Partial<{
  opacity: number;
  outlineWidth: number;
  outlineColor: string;
  oilFilmEnabled: boolean;
  isCutout: boolean;
  cornerRadius: number;
  cornerRadiusEnabled: boolean;
  shadowEnabled: boolean;
  shadowBlur: number;
  fontSize: number;
  fontWeight: CanvasTextElement["fontWeight"];
  color: string;
  textOutlineColor: string;
  textOutlineWidth: number;
  holoEnabled: boolean;
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  textAlign: CanvasTextElement["textAlign"];
  fillColor: string;
  fillEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
}>;

interface CanvasInspectorProps {
  element: CanvasElement;
  disabled: boolean;
  processing?: boolean;
  onClose: () => void;
  onStyleChange: (
    patch: CanvasPropertiesPatch,
    commit?: boolean,
  ) => void;
  onLayerChange: (action: CanvasLayerAction) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDownload?: () => void;
  cropping?: boolean;
  onToggleCrop?: () => void;
  onToggleCutout?: () => void;
}

interface PanelIconButtonProps {
  icon: IconName;
  label: string;
  title?: string;
  active?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}

function PanelIconButton({
  icon,
  label,
  title,
  active,
  expanded,
  disabled = false,
  danger = false,
  onClick,
}: PanelIconButtonProps) {
  return (
    <button
      type="button"
      className={`canvas-properties-icon-button${danger ? " danger" : ""}`}
      data-active={active}
      disabled={disabled}
      aria-pressed={active}
      aria-expanded={expanded}
      aria-label={label}
      title={title || label}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}

interface PanelRangeProps {
  scope: string;
  icon: IconName;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  formatValue?: (value: number) => string;
  onChange: (value: number, commit: boolean) => void;
}

function PanelRange({
  scope,
  icon,
  label,
  value,
  min,
  max,
  step = 1,
  disabled = false,
  formatValue = (current) => String(current),
  onChange,
}: PanelRangeProps) {
  const boundaryRef = useRef(createStyleCommitBoundary<number>());
  useLayoutEffect(() => {
    boundaryRef.current.syncScope(scope);
  }, [scope]);
  const commit = () =>
    boundaryRef.current.commit(scope, (nextValue) => onChange(nextValue, true));
  const progress =
    ((clamp(value, min, max) - min) / Math.max(1, max - min)) * 100;
  const rangeStyle = {
    "--range-progress": `${progress.toFixed(2)}%`,
  } as CSSProperties;

  return (
    <label className="canvas-properties-range" title={label}>
      <div className="canvas-properties-range-heading">
        <span className="canvas-properties-range-label">
          <Icon name={icon} />
          {label}
        </span>
        <output>{formatValue(value)}</output>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        style={rangeStyle}
        onChange={(event) =>
          boundaryRef.current.preview(scope, Number(event.currentTarget.value), (nextValue) =>
            onChange(nextValue, false),
          )
        }
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        onPointerCancel={commit}
      />
    </label>
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function CanvasInspector({
  element,
  disabled,
  processing = false,
  onClose,
  onStyleChange,
  onLayerChange,
  onDuplicate,
  onDelete,
  onDownload,
  cropping = false,
  onToggleCrop,
  onToggleCutout,
}: CanvasInspectorProps) {
  const opacityBoundaryRef = useRef(createStyleCommitBoundary<number>());
  useLayoutEffect(() => {
    opacityBoundaryRef.current.syncScope(element.id);
  }, [element.id]);
  const [activeFlyout, setActiveFlyout] = useState<PanelFlyout>(null);
  const image = element.type === "image" ? element : null;
  const text = element.type === "text" ? element : null;
  const shape = element.type === "shape" ? element : null;
  const opacity = clamp(element.opacity ?? 1, 0, 1);
  const opacityPercent = Math.round(opacity * 100);
  const imageCornerRadius = image
    ? clamp(
        image.cornerRadius ?? DEFAULT_STICKER_CORNER_RADIUS,
        0,
        MAX_STICKER_CORNER_RADIUS,
      )
    : 0;
  const textCornerRadius = text ? clamp(text.borderRadius, 0, 80) : 0;
  const cornerRadius = image ? imageCornerRadius : textCornerRadius;
  const roundedCorners = image
    ? image.cornerRadiusEnabled !== false
    : Boolean(text && text.borderRadius > 0);
  const backgroundEnabled = text
    ? text.backgroundColor !== "transparent"
    : Boolean(shape?.fillEnabled);
  const backgroundColor = text
    ? backgroundEnabled
      ? text.backgroundColor
      : "#fff8ec"
    : shape?.fillColor ?? "#f3ead8";
  const borderEnabled = text
    ? text.borderWidth > 0
    : Boolean(shape && shape.strokeWidth > 0);

  const stopEvent = (
    event: PointerEvent<HTMLElement> | TouchEvent<HTMLElement>,
  ) => {
    event.stopPropagation();
  };

  const toggleFlyout = (flyout: Exclude<PanelFlyout, null>) => {
    setActiveFlyout((current) => (current === flyout ? null : flyout));
  };

  const updateOpacity = (value: number, commit: boolean) => {
    onStyleChange({ opacity: clamp(value, 0, 100) / 100 }, commit);
  };

  const updateCornerRadius = (value: number, commit: boolean) => {
    if (image) {
      onStyleChange(
        {
          cornerRadius: clamp(value, 0, MAX_STICKER_CORNER_RADIUS),
        },
        commit,
      );
    } else if (text) {
      onStyleChange({ borderRadius: clamp(value, 0, 80) }, commit);
    }
  };

  const updateOutlineWidth = (value: number, commit: boolean) => {
    if (image) {
      onStyleChange({ outlineWidth: clamp(value, 0, 24) }, commit);
    } else if (text) {
      onStyleChange({ textOutlineWidth: clamp(value, 0, 48) }, commit);
    }
  };

  const updateBorderWidth = (value: number, commit: boolean) => {
    if (text) {
      onStyleChange({ borderWidth: clamp(value, 0, 16) }, commit);
    } else if (shape) {
      onStyleChange({ strokeWidth: clamp(value, 0, 16) }, commit);
    }
  };

  return (
    <aside
      className="canvas-properties-panel"
      data-canvas-ui
      data-element-type={element.type}
      aria-label="Element properties"
      aria-busy={processing}
      onPointerDown={stopEvent}
      onTouchStart={stopEvent}
    >
      {image || text ? (
        <section className="canvas-properties-section" aria-labelledby="properties-corners">
          <div className="canvas-properties-section-heading">
            <h2 id="properties-corners">Corners</h2>
            <button
              type="button"
              className="canvas-properties-panel-close"
              aria-label="Close properties"
              title="Close"
              onClick={onClose}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="canvas-properties-button-row canvas-properties-corner-row">
            <PanelIconButton
              icon="corners-square"
              label="Square corners"
              active={!roundedCorners}
              disabled={disabled}
              onClick={() =>
                onStyleChange(
                  image
                    ? { cornerRadiusEnabled: false }
                    : { borderRadius: 0 },
                  true,
                )
              }
            />
            <PanelIconButton
              icon="corners"
              label="Rounded corners"
              active={roundedCorners}
              disabled={disabled}
              onClick={() =>
                onStyleChange(
                  image
                    ? {
                        cornerRadiusEnabled: true,
                        cornerRadius: Math.max(8, imageCornerRadius),
                      }
                    : { borderRadius: Math.max(8, textCornerRadius) },
                  true,
                )
              }
            />
          </div>
          <PanelRange
            scope={element.id}
            icon="corners"
            label="Corner radius"
            value={cornerRadius}
            min={0}
            max={image ? MAX_STICKER_CORNER_RADIUS : 80}
            disabled={disabled || !roundedCorners}
            onChange={updateCornerRadius}
          />
        </section>
      ) : null}

      <section className="canvas-properties-section" aria-labelledby="properties-opacity">
        <div className="canvas-properties-section-heading">
          <h2 id="properties-opacity">Opacity</h2>
          {shape ? (
            <button
              type="button"
              className="canvas-properties-panel-close"
              aria-label="Close properties"
              title="Close"
              onClick={onClose}
            >
              <Icon name="close" />
            </button>
          ) : null}
        </div>
        <label className="canvas-properties-opacity">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={opacityPercent}
            disabled={disabled}
            aria-label="Opacity"
            style={{ "--range-progress": `${opacityPercent}%` } as CSSProperties}
            onChange={(event) =>
              opacityBoundaryRef.current.preview(
                element.id,
                Number(event.currentTarget.value),
                (nextValue) => updateOpacity(nextValue, false),
              )
            }
            onPointerUp={() =>
              opacityBoundaryRef.current.commit(element.id, (nextValue) =>
                updateOpacity(nextValue, true),
              )
            }
            onKeyUp={() =>
              opacityBoundaryRef.current.commit(element.id, (nextValue) =>
                updateOpacity(nextValue, true),
              )
            }
            onBlur={() =>
              opacityBoundaryRef.current.commit(element.id, (nextValue) =>
                updateOpacity(nextValue, true),
              )
            }
            onPointerCancel={() =>
              opacityBoundaryRef.current.commit(element.id, (nextValue) =>
                updateOpacity(nextValue, true),
              )
            }
          />
          <span className="canvas-properties-opacity-values">
            <span>0</span>
            <output>{opacityPercent}</output>
            <span>100</span>
          </span>
        </label>
      </section>

      <section className="canvas-properties-section" aria-labelledby="properties-style">
        <div className="canvas-properties-section-heading">
          <h2 id="properties-style">Style</h2>
        </div>
        <div className="canvas-properties-button-row canvas-properties-style-row">
          {image ? (
            <>
              <PanelIconButton
                icon="sparkles"
                label={image.oilFilmEnabled ? "Disable Holo" : "Enable Holo"}
                active={Boolean(image.oilFilmEnabled)}
                disabled={disabled}
                onClick={() =>
                  onStyleChange(
                    { oilFilmEnabled: !image.oilFilmEnabled },
                    true,
                  )
                }
              />
              <PanelIconButton
                icon="scissors"
                label={cropping ? "Finish crop" : "Crop image"}
                active={cropping}
                disabled={disabled}
                onClick={() => onToggleCrop?.()}
              />
              <PanelIconButton
                icon="shadow"
                label={image.shadowEnabled === false ? "Enable shadow" : "Disable shadow"}
                active={image.shadowEnabled !== false}
                disabled={disabled}
                onClick={() =>
                  onStyleChange(
                    { shadowEnabled: image.shadowEnabled === false },
                    true,
                  )
                }
              />
              <PanelIconButton
                icon="stroke"
                label={image.outlineWidth ? "Remove outline" : "Add outline"}
                active={Boolean(image.outlineWidth)}
                disabled={disabled}
                onClick={() =>
                  onStyleChange(
                    { outlineWidth: image.outlineWidth ? 0 : 2 },
                    true,
                  )
                }
              />
              <CanvasColorInput
                scope={element.id}
                label="Outline color"
                value={image.outlineColor || "#ffffff"}
                disabled={disabled || !(image.outlineWidth ?? 0)}
                onChange={(color, commit) =>
                  onStyleChange({ outlineColor: color }, commit)
                }
              />
              <PanelIconButton
                icon="sliders"
                label="Image style"
                active={activeFlyout === "image-style"}
                expanded={activeFlyout === "image-style"}
                disabled={disabled}
                onClick={() => toggleFlyout("image-style")}
              />
            </>
          ) : text ? (
            <>
              <PanelIconButton
                icon="font"
                label="Font size"
                active={activeFlyout === "font-size"}
                expanded={activeFlyout === "font-size"}
                disabled={disabled}
                onClick={() => toggleFlyout("font-size")}
              />
              <PanelIconButton
                icon="bold"
                label="Bold"
                active={text.fontWeight >= 600}
                disabled={disabled}
                onClick={() =>
                  onStyleChange(
                    { fontWeight: text.fontWeight >= 600 ? 400 : 700 },
                    true,
                  )
                }
              />
              <PanelIconButton
                icon={`align-${text.textAlign}` as IconName}
                label={`Text alignment: ${text.textAlign}`}
                disabled={disabled}
                onClick={() => {
                  const textAlign =
                    text.textAlign === "left"
                      ? "center"
                      : text.textAlign === "center"
                        ? "right"
                        : "left";
                  onStyleChange({ textAlign }, true);
                }}
              />
              <CanvasColorInput
                scope={element.id}
                label="Text color"
                value={text.color}
                disabled={disabled}
                onChange={(color, commit) =>
                  onStyleChange({ color }, commit)
                }
              />
              <PanelIconButton
                icon="text-outline"
                label={text.textOutlineWidth ? "Remove text outline" : "Add text outline"}
                title="Text outline"
                active={text.textOutlineWidth > 0}
                disabled={disabled}
                onClick={() =>
                  onStyleChange(
                    {
                      textOutlineWidth: text.textOutlineWidth
                        ? 0
                        : Math.min(48, Math.max(1, text.fontSize * 0.18)),
                    },
                    true,
                  )
                }
              />
              {text.textOutlineWidth > 0 ? (
                <CanvasColorInput
                  scope={element.id}
                  label="Text outline color"
                  value={text.textOutlineColor}
                  disabled={disabled}
                  onChange={(color, commit) =>
                    onStyleChange({ textOutlineColor: color }, commit)
                  }
                />
              ) : null}
              <PanelIconButton
                icon="stroke-width"
                label="Text outline width"
                title="Text outline width"
                active={activeFlyout === "text-outline-width"}
                expanded={activeFlyout === "text-outline-width"}
                disabled={disabled}
                onClick={() => toggleFlyout("text-outline-width")}
              />
              <PanelIconButton
                icon="sparkles"
                label={text.holoEnabled ? "Disable Holo" : "Enable Holo"}
                title="Holo effect"
                active={text.holoEnabled}
                disabled={disabled}
                onClick={() =>
                  onStyleChange({ holoEnabled: !text.holoEnabled }, true)
                }
              />
              <PanelIconButton
                icon="fill"
                label={backgroundEnabled ? "Remove background" : "Add background"}
                title="Background fill"
                active={backgroundEnabled}
                disabled={disabled}
                onClick={() =>
                  onStyleChange(
                    {
                      backgroundColor: backgroundEnabled
                        ? "transparent"
                        : backgroundColor,
                    },
                    true,
                  )
                }
              />
              {backgroundEnabled ? (
                <CanvasColorInput
                  scope={element.id}
                  label="Background color"
                  value={backgroundColor}
                  disabled={disabled}
                  onChange={(color, commit) =>
                    onStyleChange({ backgroundColor: color }, commit)
                  }
                />
              ) : null}
              <PanelIconButton
                icon="border"
                label={borderEnabled ? "Remove border" : "Add border"}
                title="Border"
                active={borderEnabled}
                disabled={disabled}
                onClick={() =>
                  onStyleChange({ borderWidth: borderEnabled ? 0 : 2 }, true)
                }
              />
              {borderEnabled ? (
                <CanvasColorInput
                  scope={element.id}
                  label="Border color"
                  value={text.borderColor}
                  disabled={disabled}
                  onChange={(color, commit) =>
                    onStyleChange({ borderColor: color }, commit)
                  }
                />
              ) : null}
              <PanelIconButton
                icon="sliders"
                label="Border width"
                title="Border width"
                active={activeFlyout === "border-width"}
                expanded={activeFlyout === "border-width"}
                disabled={disabled}
                onClick={() => toggleFlyout("border-width")}
              />
            </>
          ) : shape ? (
            <>
              <PanelIconButton
                icon="fill"
                label={shape.fillEnabled ? "Remove fill" : "Add fill"}
                active={shape.fillEnabled}
                disabled={disabled}
                onClick={() =>
                  onStyleChange({ fillEnabled: !shape.fillEnabled }, true)
                }
              />
              {shape.fillEnabled ? (
                <CanvasColorInput
                  scope={element.id}
                  label="Fill color"
                  value={shape.fillColor}
                  disabled={disabled}
                  onChange={(color, commit) =>
                    onStyleChange({ fillColor: color }, commit)
                  }
                />
              ) : null}
              <PanelIconButton
                icon="border"
                label={shape.strokeWidth ? "Remove outline" : "Add outline"}
                title="Outline"
                active={shape.strokeWidth > 0}
                disabled={disabled}
                onClick={() =>
                  onStyleChange(
                    { strokeWidth: shape.strokeWidth ? 0 : 2 },
                    true,
                  )
                }
              />
              <CanvasColorInput
                scope={element.id}
                label="Outline color"
                value={shape.strokeColor}
                disabled={disabled || shape.strokeWidth <= 0}
                onChange={(color, commit) =>
                  onStyleChange({ strokeColor: color }, commit)
                }
              />
              <PanelIconButton
                icon="stroke-width"
                label="Outline width"
                title="Outline width"
                active={activeFlyout === "border-width"}
                expanded={activeFlyout === "border-width"}
                disabled={disabled}
                onClick={() => toggleFlyout("border-width")}
              />
            </>
          ) : null}
        </div>

        {image && activeFlyout === "image-style" ? (
          <div className="canvas-properties-flyout" role="group" aria-label="Image style controls">
            <PanelRange
              scope={element.id}
              icon="stroke"
              label="Outline"
              value={image.outlineWidth ?? 0}
              min={0}
              max={24}
              disabled={disabled}
              onChange={(value, commit) =>
                onStyleChange({ outlineWidth: value }, commit)
              }
            />
            <PanelRange
              scope={element.id}
              icon="shadow"
              label="Shadow size"
              value={image.shadowBlur ?? DEFAULT_STICKER_SHADOW_BLUR}
              min={0}
              max={MAX_STICKER_SHADOW_BLUR}
              disabled={disabled || image.shadowEnabled === false}
              onChange={(value, commit) =>
                onStyleChange({ shadowBlur: value }, commit)
              }
            />
          </div>
        ) : null}

        {text && activeFlyout === "font-size" ? (
          <div className="canvas-properties-flyout" role="group" aria-label="Font size controls">
            <PanelRange
              scope={element.id}
              icon="font"
              label="Font size"
              value={text.fontSize}
              min={12}
              max={96}
              disabled={disabled}
              onChange={(value, commit) =>
                onStyleChange({ fontSize: value }, commit)
              }
            />
          </div>
        ) : null}

        {text && activeFlyout === "text-outline-width" ? (
          <div className="canvas-properties-flyout" role="group" aria-label="Text outline width controls">
            <PanelRange
              scope={element.id}
              icon="text-outline"
              label="Outline"
              value={text.textOutlineWidth}
              min={0}
              max={48}
              step={0.5}
              disabled={disabled}
              onChange={updateOutlineWidth}
            />
          </div>
        ) : null}

        {(text || shape) && activeFlyout === "border-width" ? (
          <div className="canvas-properties-flyout" role="group" aria-label="Border width controls">
            <PanelRange
              scope={element.id}
              icon="border"
              label={text ? "Border" : "Outline"}
              value={text ? text.borderWidth : shape?.strokeWidth ?? 0}
              min={0}
              max={16}
              disabled={disabled}
              onChange={updateBorderWidth}
            />
          </div>
        ) : null}
      </section>

      <details className="canvas-properties-advanced">
        <summary>More actions</summary>
        <section className="canvas-properties-section" aria-labelledby="properties-layer">
          <div className="canvas-properties-section-heading">
            <h2 id="properties-layer">Layers</h2>
          </div>
          <div className="canvas-properties-button-row canvas-properties-layer-row">
            <PanelIconButton
              icon="layer-send-back"
              label="Send to back"
              title="Send to back"
              disabled={disabled}
              onClick={() => onLayerChange("send-back")}
            />
            <PanelIconButton
              icon="layer-back"
              label="Send backward"
              title="Send backward"
              disabled={disabled}
              onClick={() => onLayerChange("backward")}
            />
            <PanelIconButton
              icon="layer-forward"
              label="Bring forward"
              title="Bring forward"
              disabled={disabled}
              onClick={() => onLayerChange("forward")}
            />
            <PanelIconButton
              icon="layer-front"
              label="Bring to front"
              title="Bring to front"
              disabled={disabled}
              onClick={() => onLayerChange("bring-front")}
            />
          </div>
        </section>

        <section className="canvas-properties-section" aria-labelledby="properties-actions">
          <div className="canvas-properties-section-heading">
            <h2 id="properties-actions">Actions</h2>
          </div>
          <div className="canvas-properties-button-row canvas-properties-action-row">
            <PanelIconButton
              icon="copy"
              label="Duplicate"
              title="Duplicate"
              disabled={disabled}
              onClick={onDuplicate}
            />
            <PanelIconButton
              icon="trash"
              label="Delete"
              title="Delete"
              danger
              disabled={disabled}
              onClick={onDelete}
            />
            {image && onToggleCutout ? (
              <PanelIconButton
                icon="eraser"
                label={image.isCutout ? "Restore background" : "Remove background"}
                active={Boolean(image.isCutout)}
                disabled={
                  disabled || Boolean(image.isCutout && !image.originalImage)
                }
                onClick={onToggleCutout}
              />
            ) : null}
            {image && onDownload ? (
              <PanelIconButton
                icon="download"
                label="Save PNG"
                disabled={disabled}
                onClick={onDownload}
              />
            ) : null}
          </div>
        </section>
      </details>
    </aside>
  );
}

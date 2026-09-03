import {
  useState,
  type ComponentProps,
  type CSSProperties,
  type PointerEvent,
  type SyntheticEvent,
  type TouchEvent,
} from "react";
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
  const commit = (event: SyntheticEvent<HTMLInputElement>) =>
    onChange(Number(event.currentTarget.value), true);
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
          onChange(Number(event.currentTarget.value), false)
        }
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
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
      aria-label="元素属性"
      aria-busy={processing}
      onPointerDown={stopEvent}
      onTouchStart={stopEvent}
    >
      {image || text ? (
        <section className="canvas-properties-section" aria-labelledby="properties-corners">
          <div className="canvas-properties-section-heading">
            <h2 id="properties-corners">边角</h2>
            <button
              type="button"
              className="canvas-properties-panel-close"
              aria-label="关闭属性"
              title="关闭"
              onClick={onClose}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="canvas-properties-button-row canvas-properties-corner-row">
            <PanelIconButton
              icon="corners-square"
              label="直角"
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
              label="圆角"
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
            icon="corners"
            label="圆角大小"
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
          <h2 id="properties-opacity">透明度</h2>
          {shape ? (
            <button
              type="button"
              className="canvas-properties-panel-close"
              aria-label="关闭属性"
              title="关闭"
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
            aria-label="透明度"
            style={{ "--range-progress": `${opacityPercent}%` } as CSSProperties}
            onChange={(event) =>
              updateOpacity(Number(event.currentTarget.value), false)
            }
            onPointerUp={(event) =>
              updateOpacity(Number(event.currentTarget.value), true)
            }
            onKeyUp={(event) =>
              updateOpacity(Number(event.currentTarget.value), true)
            }
            onBlur={(event) =>
              updateOpacity(Number(event.currentTarget.value), true)
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
          <h2 id="properties-style">样式</h2>
        </div>
        <div className="canvas-properties-button-row canvas-properties-style-row">
          {image ? (
            <>
              <PanelIconButton
                icon="sparkles"
                label={image.oilFilmEnabled ? "关闭全息" : "开启全息"}
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
                label={cropping ? "完成裁剪" : "裁剪图片"}
                active={cropping}
                disabled={disabled}
                onClick={() => onToggleCrop?.()}
              />
              <PanelIconButton
                icon="shadow"
                label={image.shadowEnabled === false ? "开启阴影" : "关闭阴影"}
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
                label={image.outlineWidth ? "移除描边" : "添加描边"}
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
                label="描边颜色"
                value={image.outlineColor || "#ffffff"}
                disabled={disabled || !(image.outlineWidth ?? 0)}
                onChange={(color, commit) =>
                  onStyleChange({ outlineColor: color }, commit)
                }
              />
              <PanelIconButton
                icon="sliders"
                label="图片样式"
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
                label="字号"
                active={activeFlyout === "font-size"}
                expanded={activeFlyout === "font-size"}
                disabled={disabled}
                onClick={() => toggleFlyout("font-size")}
              />
              <PanelIconButton
                icon="bold"
                label="粗体"
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
                label={`文字对齐：${text.textAlign}`}
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
                label="文字颜色"
                value={text.color}
                disabled={disabled}
                onChange={(color, commit) =>
                  onStyleChange({ color }, commit)
                }
              />
              <PanelIconButton
                icon="text-outline"
                label={text.textOutlineWidth ? "移除文字描边" : "添加文字描边"}
                title="文字描边"
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
                  label="文字描边颜色"
                  value={text.textOutlineColor}
                  disabled={disabled}
                  onChange={(color, commit) =>
                    onStyleChange({ textOutlineColor: color }, commit)
                  }
                />
              ) : null}
              <PanelIconButton
                icon="stroke-width"
                label="文字描边粗细"
                title="文字描边粗细"
                active={activeFlyout === "text-outline-width"}
                expanded={activeFlyout === "text-outline-width"}
                disabled={disabled}
                onClick={() => toggleFlyout("text-outline-width")}
              />
              <PanelIconButton
                icon="sparkles"
                label={text.holoEnabled ? "关闭全息" : "开启全息"}
                title="全息效果"
                active={text.holoEnabled}
                disabled={disabled}
                onClick={() =>
                  onStyleChange({ holoEnabled: !text.holoEnabled }, true)
                }
              />
              <PanelIconButton
                icon="fill"
                label={backgroundEnabled ? "移除背景" : "添加背景"}
                title="背景填充"
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
                  label="背景颜色"
                  value={backgroundColor}
                  disabled={disabled}
                  onChange={(color, commit) =>
                    onStyleChange({ backgroundColor: color }, commit)
                  }
                />
              ) : null}
              <PanelIconButton
                icon="border"
                label={borderEnabled ? "移除边框" : "添加边框"}
                title="边框"
                active={borderEnabled}
                disabled={disabled}
                onClick={() =>
                  onStyleChange({ borderWidth: borderEnabled ? 0 : 2 }, true)
                }
              />
              {borderEnabled ? (
                <CanvasColorInput
                  label="边框颜色"
                  value={text.borderColor}
                  disabled={disabled}
                  onChange={(color, commit) =>
                    onStyleChange({ borderColor: color }, commit)
                  }
                />
              ) : null}
              <PanelIconButton
                icon="sliders"
                label="边框粗细"
                title="边框粗细"
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
                label={shape.fillEnabled ? "移除填充" : "添加填充"}
                active={shape.fillEnabled}
                disabled={disabled}
                onClick={() =>
                  onStyleChange({ fillEnabled: !shape.fillEnabled }, true)
                }
              />
              {shape.fillEnabled ? (
                <CanvasColorInput
                  label="填充颜色"
                  value={shape.fillColor}
                  disabled={disabled}
                  onChange={(color, commit) =>
                    onStyleChange({ fillColor: color }, commit)
                  }
                />
              ) : null}
              <PanelIconButton
                icon="border"
                label={shape.strokeWidth ? "移除描边" : "添加描边"}
                title="描边"
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
                label="描边颜色"
                value={shape.strokeColor}
                disabled={disabled || shape.strokeWidth <= 0}
                onChange={(color, commit) =>
                  onStyleChange({ strokeColor: color }, commit)
                }
              />
              <PanelIconButton
                icon="stroke-width"
                label="描边粗细"
                title="描边粗细"
                active={activeFlyout === "border-width"}
                expanded={activeFlyout === "border-width"}
                disabled={disabled}
                onClick={() => toggleFlyout("border-width")}
              />
            </>
          ) : null}
        </div>

        {image && activeFlyout === "image-style" ? (
          <div className="canvas-properties-flyout" role="group" aria-label="图片样式控件">
            <PanelRange
              icon="stroke"
              label="描边"
              value={image.outlineWidth ?? 0}
              min={0}
              max={24}
              disabled={disabled}
              onChange={(value, commit) =>
                onStyleChange({ outlineWidth: value }, commit)
              }
            />
            <PanelRange
              icon="shadow"
              label="阴影大小"
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
          <div className="canvas-properties-flyout" role="group" aria-label="字号控件">
            <PanelRange
              icon="font"
              label="字号"
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
          <div className="canvas-properties-flyout" role="group" aria-label="文字描边粗细控件">
            <PanelRange
              icon="text-outline"
              label="描边"
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
          <div className="canvas-properties-flyout" role="group" aria-label="边框粗细控件">
            <PanelRange
              icon="border"
              label={text ? "边框" : "描边"}
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
        <summary>更多操作</summary>
        <section className="canvas-properties-section" aria-labelledby="properties-layer">
          <div className="canvas-properties-section-heading">
            <h2 id="properties-layer">图层</h2>
          </div>
          <div className="canvas-properties-button-row canvas-properties-layer-row">
            <PanelIconButton
              icon="layer-send-back"
              label="置于底层"
              title="置于底层"
              disabled={disabled}
              onClick={() => onLayerChange("send-back")}
            />
            <PanelIconButton
              icon="layer-back"
              label="下移一层"
              title="下移一层"
              disabled={disabled}
              onClick={() => onLayerChange("backward")}
            />
            <PanelIconButton
              icon="layer-forward"
              label="上移一层"
              title="上移一层"
              disabled={disabled}
              onClick={() => onLayerChange("forward")}
            />
            <PanelIconButton
              icon="layer-front"
              label="置于顶层"
              title="置于顶层"
              disabled={disabled}
              onClick={() => onLayerChange("bring-front")}
            />
          </div>
        </section>

        <section className="canvas-properties-section" aria-labelledby="properties-actions">
          <div className="canvas-properties-section-heading">
            <h2 id="properties-actions">操作</h2>
          </div>
          <div className="canvas-properties-button-row canvas-properties-action-row">
            <PanelIconButton
              icon="copy"
              label="复制"
              title="复制"
              disabled={disabled}
              onClick={onDuplicate}
            />
            <PanelIconButton
              icon="trash"
              label="删除"
              title="删除"
              danger
              disabled={disabled}
              onClick={onDelete}
            />
            {image && onToggleCutout ? (
              <PanelIconButton
                icon="eraser"
                label={image.isCutout ? "恢复背景" : "移除背景"}
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
                label="保存 PNG"
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

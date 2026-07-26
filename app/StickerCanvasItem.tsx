"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import type {
  CanvasSticker,
  StickerGestureKind,
  StickerStyleOptions,
} from "@/lib/canvas-types";
import { Icon } from "./Icon";
import { StickerSettingsPanel } from "./StickerSettingsPanel";

interface StickerCanvasItemProps {
  sticker: CanvasSticker;
  selected: boolean;
  entering: boolean;
  isProcessing?: boolean;
  onGestureStart: (
    event: PointerEvent<HTMLElement>,
    sticker: CanvasSticker,
    kind: StickerGestureKind,
  ) => void;
  onDelete: (sticker: CanvasSticker) => void;
  onDownload: (sticker: CanvasSticker) => void;
  onCutout?: (sticker: CanvasSticker) => void;
  onUpdateStyle: (
    stickerId: string,
    patch: Partial<StickerStyleOptions>,
    commit?: boolean,
  ) => void;
  onSelect: (stickerId: string) => void;
}

function StickerCanvasItemComponent({
  sticker,
  selected,
  entering,
  isProcessing = false,
  onGestureStart,
  onDelete,
  onDownload,
  onCutout,
  onUpdateStyle,
  onSelect,
}: StickerCanvasItemProps) {
  const articleRef = useRef<HTMLElement>(null);
  const [placement, setPlacement] = useState<"left" | "right">("right");

  useEffect(() => {
    if (!selected) return;
    const updatePlacement = () => {
      if (!articleRef.current) return;
      const rect = articleRef.current.getBoundingClientRect();
      if (rect.right + 200 > window.innerWidth) {
        setPlacement("left");
      } else {
        setPlacement("right");
      }
    };
    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    return () => window.removeEventListener("resize", updatePlacement);
  }, [selected, sticker.x, sticker.y, sticker.width, sticker.rotation]);

  const outlineId = useMemo(
    () => `sticker-outline-${sticker.id.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [sticker.id],
  );

  const imgFilter = useMemo(() => {
    const filters: string[] = [];

    if (sticker.outlineWidth && sticker.outlineWidth > 0) {
      filters.push(`url(#${outlineId})`);
    }

    filters.push(selected ? "drop-shadow(0 16px 14px rgba(0,0,0,0.24))" : "drop-shadow(0 12px 10px rgba(0,0,0,0.18))");

    if (isProcessing) {
      filters.push("blur(10px) brightness(0.85)");
    }

    return filters.join(" ");
  }, [sticker.outlineWidth, outlineId, isProcessing, selected]);

  const style = {
    width: sticker.width,
    height: sticker.height,
    left: sticker.x - sticker.width / 2,
    top: sticker.y - sticker.height / 2,
    zIndex: sticker.zIndex,
    transform: `rotate(${sticker.rotation}deg)`,
  } satisfies CSSProperties;

  const imgStyle = {
    filter: imgFilter,
  } satisfies CSSProperties;

  const maskStyle = {
    maskImage: `url(${sticker.url})`,
    WebkitMaskImage: `url(${sticker.url})`,
    maskSize: "contain",
    WebkitMaskSize: "contain",
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    WebkitMaskPosition: "center",
  } satisfies CSSProperties;

  const handleStyleChange = useCallback(
    (patch: Partial<StickerStyleOptions>, commit = true) => {
      onUpdateStyle(sticker.id, patch, commit);
    },
    [onUpdateStyle, sticker.id],
  );

  return (
    <article
      ref={articleRef}
      className="simple-sticker"
      data-sticker
      data-selected={selected}
      data-entering={entering}
      data-processing={isProcessing}
      style={style}
      aria-label="Sticker"
      role="group"
      tabIndex={0}
      onFocus={() => onSelect(sticker.id)}
      onPointerDown={(event) => onGestureStart(event, sticker, "move")}
    >
      {/* SVG 滤镜：扩充 Filter 边界范围至 200% 防止边缘厚描边被裁剪 */}
      {sticker.outlineWidth && sticker.outlineWidth > 0 ? (
        <svg
          style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}
          aria-hidden="true"
        >
          <defs>
            <filter
              id={outlineId}
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
              colorInterpolationFilters="sRGB"
            >
              <feMorphology
                in="SourceAlpha"
                operator="dilate"
                radius={sticker.outlineWidth}
                result="dilated"
              />
              <feGaussianBlur in="dilated" stdDeviation={Math.max(2.4, sticker.outlineWidth * 0.35).toFixed(1)} result="blurred" />
              <feColorMatrix
                in="blurred"
                type="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -11.5"
                result="solidMask"
              />
              <feFlood
                floodColor={sticker.outlineColor || "#ffffff"}
                result="color"
              />
              <feComposite in="color" in2="solidMask" operator="in" result="stroke" />
              <feMerge>
                <feMergeNode in="stroke" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        </svg>
      ) : null}

      <img
        src={sticker.url}
        alt=""
        draggable={false}
        style={imgStyle}
        className="simple-sticker-img"
      />

      {/* 实体质感油膜/镭射流光多层效果 */}
      {sticker.oilFilmEnabled ? (
        <div className="simple-sticker-oil-film" style={maskStyle}>
          <div className="simple-oil-spectrum" />
          <div className="simple-oil-grating" />
          <div className="simple-oil-streak" />
          <div className="simple-oil-gloss" />
        </div>
      ) : null}

      {/* 抠图处理中：轻量转圈遮罩 */}
      {isProcessing ? (
        <div
          className="simple-sticker-processing-overlay"
          data-canvas-ui
          role="status"
          aria-label="Removing background"
        >
          <span className="simple-processing-spinner" aria-hidden="true" />
        </div>
      ) : null}

      {selected && !isProcessing ? (
        <>
          {/* 左上角：旋转句柄 */}
          <button
            className="simple-sticker-rotate"
            type="button"
            aria-label="Rotate sticker"
            onPointerDown={(event) =>
              onGestureStart(event, sticker, "rotate")
            }
          >
            <Icon name="rotate" />
          </button>

          {/* 右上角、左下角、右下角：圆角折线缩放句柄 */}
          <button
            className="simple-sticker-corner tr"
            type="button"
            aria-label="Resize sticker"
            onPointerDown={(event) =>
              onGestureStart(event, sticker, "resize")
            }
          />
          <button
            className="simple-sticker-resize-bl"
            type="button"
            aria-label="Resize sticker"
            onPointerDown={(event) =>
              onGestureStart(event, sticker, "resize")
            }
          />
          <button
            className="simple-sticker-resize"
            type="button"
            aria-label="Resize sticker"
            onPointerDown={(event) =>
              onGestureStart(event, sticker, "resize")
            }
          />

          {/* 选中贴纸自动弹出 Floating Toolbar（具备智能视口翻转防遮挡功能） */}
          <StickerSettingsPanel
            sticker={sticker}
            placement={placement}
            onStyleChange={handleStyleChange}
            onDelete={() => onDelete(sticker)}
            onDownload={() => onDownload(sticker)}
            onCutout={onCutout ? () => onCutout(sticker) : undefined}
          />
        </>
      ) : null}
    </article>
  );
}

export const StickerCanvasItem = memo(StickerCanvasItemComponent);

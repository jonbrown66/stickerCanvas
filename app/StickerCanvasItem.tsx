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
  const holoFrameRef = useRef<number | null>(null);
  const holoMotionRef = useRef({
    x: 0.5,
    y: 0.5,
    targetX: 0.5,
    targetY: 0.5,
    velocityX: 0,
    velocityY: 0,
    lastTime: 0,
  });
  const holoBorderGlintRef = useRef<SVGCircleElement>(null);
  const holoBorderSpectrumRef = useRef<SVGRectElement>(null);
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
  const holoIds = useMemo(() => {
    const suffix = sticker.id.replace(/[^a-zA-Z0-9_-]/g, "");
    return {
      ringFilter: `sticker-holo-ring-${suffix}`,
      ringMask: `sticker-holo-mask-${suffix}`,
      spectrum: `sticker-holo-spectrum-${suffix}`,
      glint: `sticker-holo-glint-${suffix}`,
    };
  }, [sticker.id]);

  const applyHoloPointer = useCallback(
    (x: number, y: number) => {
      const article = articleRef.current;
      if (!article) return;
      const localX = x * sticker.width;
      const localY = y * sticker.height;
      article.style.setProperty("--holo-pointer-x", `${localX}px`);
      article.style.setProperty("--holo-pointer-y", `${localY}px`);
      article.style.setProperty(
        "--holo-shift-x",
        `${(x - 0.5) * sticker.width * 0.16}px`,
      );
      article.style.setProperty(
        "--holo-shift-y",
        `${(y - 0.5) * sticker.height * 0.16}px`,
      );
      article.style.setProperty(
        "--holo-tilt",
        `${(x - y) * 7}deg`,
      );
      article.style.setProperty(
        "--holo-rotate-x",
        `${(0.5 - y) * 13}deg`,
      );
      article.style.setProperty(
        "--holo-rotate-y",
        `${(x - 0.5) * 13}deg`,
      );
      const distance = Math.min(1, Math.hypot(x - 0.5, y - 0.5) * 1.8);
      article.style.setProperty(
        "--holo-foil-opacity",
        `${0.09 + distance * 0.1}`,
      );
      holoBorderGlintRef.current?.setAttribute("cx", `${localX}`);
      holoBorderGlintRef.current?.setAttribute("cy", `${localY}`);
      holoBorderSpectrumRef.current?.setAttribute(
        "transform",
        `translate(${(x - 0.5) * sticker.width * 0.12} ${(y - 0.5) * sticker.height * 0.12})`,
      );
    },
    [sticker.height, sticker.width],
  );

  const scheduleHoloPointer = useCallback(
    (x: number, y: number) => {
      const motion = holoMotionRef.current;
      motion.targetX = x;
      motion.targetY = y;
      if (holoFrameRef.current !== null) return;
      if (articleRef.current) {
        articleRef.current.dataset.holoMotion = "true";
      }
      motion.lastTime = 0;

      const tick = (now: number) => {
        const deltaSeconds = motion.lastTime
          ? Math.min(0.032, (now - motion.lastTime) / 1_000)
          : 1 / 60;
        motion.lastTime = now;

        const stiffness = 230;
        const damping = 24;
        const accelerationX =
          (motion.targetX - motion.x) * stiffness -
          motion.velocityX * damping;
        const accelerationY =
          (motion.targetY - motion.y) * stiffness -
          motion.velocityY * damping;
        motion.velocityX += accelerationX * deltaSeconds;
        motion.velocityY += accelerationY * deltaSeconds;
        motion.x += motion.velocityX * deltaSeconds;
        motion.y += motion.velocityY * deltaSeconds;

        applyHoloPointer(motion.x, motion.y);

        const unsettled =
          Math.abs(motion.targetX - motion.x) > 0.0005 ||
          Math.abs(motion.targetY - motion.y) > 0.0005 ||
          Math.abs(motion.velocityX) > 0.002 ||
          Math.abs(motion.velocityY) > 0.002;
        if (unsettled) {
          holoFrameRef.current = requestAnimationFrame(tick);
          return;
        }

        motion.x = motion.targetX;
        motion.y = motion.targetY;
        motion.velocityX = 0;
        motion.velocityY = 0;
        motion.lastTime = 0;
        holoFrameRef.current = null;
        applyHoloPointer(motion.x, motion.y);
        if (articleRef.current) {
          articleRef.current.dataset.holoMotion = "false";
        }
      };

      holoFrameRef.current = requestAnimationFrame(tick);
    },
    [applyHoloPointer],
  );

  const handleHoloPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!sticker.oilFilmEnabled) return;
      const article = event.currentTarget;
      const rect = article.getBoundingClientRect();
      const x = Math.min(
        1,
        Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)),
      );
      const y = Math.min(
        1,
        Math.max(0, (event.clientY - rect.top) / Math.max(1, rect.height)),
      );
      article.dataset.holoHover = "true";
      scheduleHoloPointer(x, y);
    },
    [scheduleHoloPointer, sticker.oilFilmEnabled],
  );

  const handleHoloPointerLeave = useCallback(() => {
    if (!sticker.oilFilmEnabled) return;
    if (articleRef.current) {
      articleRef.current.dataset.holoHover = "false";
    }
    scheduleHoloPointer(0.5, 0.5);
  }, [scheduleHoloPointer, sticker.oilFilmEnabled]);

  useEffect(
    () => () => {
      if (holoFrameRef.current !== null) {
        cancelAnimationFrame(holoFrameRef.current);
      }
    },
    [],
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
    zIndex: sticker.zIndex,
    transform: `translate3d(${sticker.x - sticker.width / 2}px, ${sticker.y - sticker.height / 2}px, 0) rotate(${sticker.rotation}deg)`,
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
      data-holo={Boolean(sticker.oilFilmEnabled)}
      style={style}
      aria-label="Sticker"
      role="group"
      tabIndex={0}
      onFocus={() => onSelect(sticker.id)}
      onPointerDown={(event) => onGestureStart(event, sticker, "move")}
      onPointerEnter={handleHoloPointerMove}
      onPointerMove={handleHoloPointerMove}
      onPointerLeave={handleHoloPointerLeave}
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

      <div className="simple-sticker-visual">
        <img
          src={sticker.url}
          alt=""
          draggable={false}
          style={imgStyle}
          className="simple-sticker-img"
        />

      {/* 镭射描边：独立环形遮罩，虹彩和镜面光斑跟随指针 */}
      {sticker.oilFilmEnabled &&
      sticker.outlineWidth &&
      sticker.outlineWidth > 0 ? (
        <svg
          className="simple-sticker-holo-border"
          viewBox={`0 0 ${sticker.width} ${sticker.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <filter
              id={holoIds.ringFilter}
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
              colorInterpolationFilters="sRGB"
            >
              <feMorphology
                in="SourceAlpha"
                operator="dilate"
                radius={Math.max(1.5, sticker.outlineWidth)}
                result="expanded"
              />
              <feComposite
                in="expanded"
                in2="SourceAlpha"
                operator="out"
                result="ring"
              />
              <feGaussianBlur in="ring" stdDeviation="0.45" result="softRing" />
              <feFlood floodColor="#ffffff" result="white" />
              <feComposite in="white" in2="softRing" operator="in" />
            </filter>
            <mask
              id={holoIds.ringMask}
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width={sticker.width}
              height={sticker.height}
            >
              <image
                href={sticker.url}
                x="0"
                y="0"
                width={sticker.width}
                height={sticker.height}
                preserveAspectRatio="none"
                filter={`url(#${holoIds.ringFilter})`}
              />
            </mask>
            <linearGradient
              id={holoIds.spectrum}
              x1="0%"
              y1="100%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#ff83bb" />
              <stop offset="22%" stopColor="#ffd783" />
              <stop offset="46%" stopColor="#f7fff4" />
              <stop offset="68%" stopColor="#77e6d2" />
              <stop offset="86%" stopColor="#8cbcff" />
              <stop offset="100%" stopColor="#d89cff" />
            </linearGradient>
            <radialGradient id={holoIds.glint}>
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
              <stop offset="20%" stopColor="#fff7d6" stopOpacity="0.82" />
              <stop offset="46%" stopColor="#bdefff" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#bdefff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g mask={`url(#${holoIds.ringMask})`}>
            <rect
              ref={holoBorderSpectrumRef}
              className="simple-holo-border-spectrum"
              x={-sticker.width * 0.12}
              y={-sticker.height * 0.12}
              width={sticker.width * 1.24}
              height={sticker.height * 1.24}
              fill={`url(#${holoIds.spectrum})`}
            />
            <circle
              ref={holoBorderGlintRef}
              className="simple-holo-border-glint"
              cx={sticker.width / 2}
              cy={sticker.height / 2}
              r={Math.max(sticker.width, sticker.height) * 0.28}
              fill={`url(#${holoIds.glint})`}
            />
          </g>
        </svg>
      ) : null}

      {/* 图片内部只保留非常轻的镭射膜质感 */}
        {sticker.oilFilmEnabled ? (
          <div className="simple-sticker-oil-film" style={maskStyle}>
            <div className="simple-oil-spectrum" />
            <div className="simple-oil-grating" />
            <div className="simple-oil-streak" />
            <div className="simple-oil-gloss" />
            <div className="simple-oil-cursor-glow" />
          </div>
        ) : null}
      </div>

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

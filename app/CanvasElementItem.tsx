"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type {
  CanvasElementGestureKind,
  CanvasShapeElement,
  CanvasTextElement,
} from "@/lib/canvas-types";
import { Icon } from "./Icon";

type CanvasNonImageElement =
  | CanvasTextElement
  | CanvasShapeElement;

interface CanvasElementItemProps {
  element: CanvasNonImageElement;
  selected: boolean;
  editing: boolean;
  drawing?: boolean;
  onGestureStart: (
    event: PointerEvent<HTMLElement>,
    element: CanvasNonImageElement,
    kind: CanvasElementGestureKind,
  ) => void;
  onSelect: (id: string) => void;
  onStartEditing: (id: string) => void;
  onCommitText: (id: string, text: string) => void;
  onCancelEditing: (id: string) => void;
}

function CanvasElementItemComponent({
  element,
  selected,
  editing,
  drawing = false,
  onGestureStart,
  onSelect,
  onStartEditing,
  onCommitText,
  onCancelEditing,
}: CanvasElementItemProps) {
  const articleRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editFinishedRef = useRef(false);
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
  const elementText = "text" in element ? element.text : "";
  const draftRef = useRef(elementText);

  useEffect(() => {
    if (!editing || element.type !== "text") {
      return;
    }
    draftRef.current = elementText;
    editFinishedRef.current = false;
    const textarea = textareaRef.current;
    if (textarea) textarea.value = elementText;
    textarea?.focus();
    textarea?.select();
  }, [editing, element.id, element.type, elementText]);

  const style = {
    width: element.width,
    height: element.height,
    zIndex: element.zIndex,
    opacity: element.opacity ?? 1,
    transform: `translate3d(${element.x - element.width / 2}px, ${element.y - element.height / 2}px, 0) rotate(${element.rotation}deg)`,
  } satisfies CSSProperties;

  const isTextual = element.type === "text";

  const commitText = (value = draftRef.current) => {
    if (!isTextual || editFinishedRef.current) return;
    editFinishedRef.current = true;
    draftRef.current = value;
    onCommitText(element.id, value);
  };

  const handleTextKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      editFinishedRef.current = true;
      onCancelEditing(element.id);
      return;
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      commitText(event.currentTarget.value);
    }
  };

  const handleElementPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (editing) return;
    if (
      event.target instanceof Element &&
      event.target.closest("[data-canvas-ui]")
    ) {
      return;
    }
    event.stopPropagation();
    onSelect(element.id);
    onGestureStart(event, element, "move");
  };

  const applyHoloPointer = useCallback((x: number, y: number) => {
    const article = articleRef.current;
    if (!article) return;
    const shiftX = (x - 0.5) * 26;
    const shiftY = (y - 0.5) * 32;
    const angle = 112 + (x - 0.5) * 56 + (y - 0.5) * 36;
    article.style.setProperty("--text-holo-x", `${(x * 100).toFixed(1)}%`);
    article.style.setProperty("--text-holo-y", `${(y * 100).toFixed(1)}%`);
    article.style.setProperty("--text-holo-shift-x", `${shiftX.toFixed(1)}px`);
    article.style.setProperty("--text-holo-shift-y", `${shiftY.toFixed(1)}px`);
    article.style.setProperty("--text-holo-angle", `${angle.toFixed(1)}deg`);
    article.style.setProperty(
      "--text-holo-rotate-x",
      `${((0.5 - y) * 9).toFixed(2)}deg`,
    );
    article.style.setProperty(
      "--text-holo-rotate-y",
      `${((x - 0.5) * 11).toFixed(2)}deg`,
    );
  }, []);

  const scheduleHoloPointer = useCallback(
    (targetX: number, targetY: number) => {
      const motion = holoMotionRef.current;
      motion.targetX = targetX;
      motion.targetY = targetY;
      if (holoFrameRef.current !== null) return;

      const tick = (now: number) => {
        const delta = motion.lastTime ? Math.min(34, now - motion.lastTime) : 16;
        motion.lastTime = now;
        const spring = 0.18;
        const damping = 0.74;
        motion.velocityX =
          (motion.velocityX + (motion.targetX - motion.x) * spring) * damping;
        motion.velocityY =
          (motion.velocityY + (motion.targetY - motion.y) * spring) * damping;
        motion.x += motion.velocityX * (delta / 16);
        motion.y += motion.velocityY * (delta / 16);
        applyHoloPointer(motion.x, motion.y);

        const settled =
          Math.abs(motion.targetX - motion.x) < 0.002 &&
          Math.abs(motion.targetY - motion.y) < 0.002 &&
          Math.abs(motion.velocityX) < 0.001 &&
          Math.abs(motion.velocityY) < 0.001;

        if (!settled) {
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
      };

      holoFrameRef.current = requestAnimationFrame(tick);
    },
    [applyHoloPointer],
  );

  const isTextHoloEnabled =
    element.type === "text" && element.holoEnabled;

  const handleHoloPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!isTextHoloEnabled || editing) return;
      if (
        event.target instanceof Element &&
        event.target.closest("[data-canvas-ui]")
      ) {
        return;
      }
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
      article.dataset.textHoloHover = "true";
      scheduleHoloPointer(x, y);
    },
    [editing, isTextHoloEnabled, scheduleHoloPointer],
  );

  const handleHoloPointerLeave = useCallback(() => {
    if (!isTextHoloEnabled || editing) return;
    if (articleRef.current) {
      articleRef.current.dataset.textHoloHover = "false";
    }
    scheduleHoloPointer(0.5, 0.5);
  }, [editing, isTextHoloEnabled, scheduleHoloPointer]);

  useEffect(
    () => () => {
      if (holoFrameRef.current !== null) {
        cancelAnimationFrame(holoFrameRef.current);
      }
    },
    [],
  );

  const startGesture = (event: PointerEvent<HTMLElement>, kind: CanvasElementGestureKind) => {
    event.stopPropagation();
    onGestureStart(event, element, kind);
  };

  const content = (() => {
    if (element.type === "shape") {
      const fill = element.fillEnabled ? element.fillColor : "none";
      const commonShapeProps = {
        fill,
        stroke: element.strokeColor,
        strokeWidth: element.strokeWidth,
        vectorEffect: "non-scaling-stroke" as const,
      };
      return (
        <svg
          className="canvas-shape-visual"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-label="Shape"
        >
          {element.shape === "rectangle" ? (
            <rect
              x={1}
              y={1}
              width={98}
              height={98}
              {...commonShapeProps}
            />
          ) : element.shape === "ellipse" ? (
            <ellipse
              cx={50}
              cy={50}
              rx={49}
              ry={49}
              {...commonShapeProps}
            />
          ) : element.shape === "triangle" ? (
            <polygon
              points="50,1 99,99 1,99"
              {...commonShapeProps}
            />
          ) : element.shape === "diamond" ? (
            <polygon
              points="50,1 99,50 50,99 1,50"
              {...commonShapeProps}
            />
          ) : (
            <line
              x1={1}
              y1={50}
              x2={99}
              y2={50}
              stroke={element.strokeColor}
              strokeWidth={element.strokeWidth}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      );
    }

    const textOutlineWidth = Math.max(0, element.textOutlineWidth);
    const textOutlineStrokeWidth = textOutlineWidth * 0.66;
    const textOutlineEdgeBlur =
      textOutlineWidth > 0 ? Math.max(0.35, textOutlineWidth * 0.12) : 0;
    const textOutlineShadow =
      textOutlineWidth > 0
        ? [
            `0 0 ${textOutlineEdgeBlur}px ${element.textOutlineColor}`,
            `0 ${Math.max(1.5, textOutlineWidth * 0.28)}px ${Math.max(1.5, textOutlineWidth * 0.34)}px rgba(42, 48, 31, 0.48)`,
          ].join(", ")
        : "none";
    const textContentStyle = {
      color: element.color,
      fontSize: element.fontSize,
      fontWeight: element.fontWeight,
      textAlign: element.textAlign,
      lineHeight: 1.35,
      whiteSpace: "pre-wrap" as const,
      fontFamily: "inherit",
    };
    const textBoxStyle = {
      background: element.backgroundColor,
      border: `${element.borderWidth}px solid ${element.borderColor}`,
      borderRadius: element.borderRadius,
    };
    const textOutlineStyle = {
      ...textContentStyle,
      color: element.textOutlineColor,
      WebkitTextStroke: `${textOutlineStrokeWidth}px ${element.textOutlineColor}`,
      paintOrder: "stroke fill",
      textShadow: textOutlineShadow,
    };

    if (editing) {
      return (
        <textarea
          ref={textareaRef}
          defaultValue={elementText}
          aria-label="Edit text"
          onChange={(event) => {
            draftRef.current = event.target.value;
          }}
          onKeyDown={handleTextKeyDown}
          onBlur={(event) => commitText(event.currentTarget.value)}
          onPointerDown={(event) => event.stopPropagation()}
          style={{
            ...textBoxStyle,
            ...textContentStyle,
            width: "100%",
            height: "100%",
            display: "block",
            boxSizing: "border-box",
            border: "none",
            outline: "2px solid #111827",
            padding: 8,
            resize: "none",
            lineHeight: 1.35,
            fontFamily: "inherit",
          }}
        />
      );
    }

    return (
      <div
        className="canvas-text-surface"
        style={{
          ...textBoxStyle,
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          overflow: "hidden",
          position: "relative",
          userSelect: "none",
        }}
      >
        {textOutlineWidth > 0 ? (
          <span
            className="canvas-text-outline"
            aria-hidden="true"
            style={{
              ...textOutlineStyle,
              position: "absolute",
              inset: 8,
              zIndex: 1,
              display: "block",
              width: "auto",
              height: "auto",
              overflow: "visible",
              pointerEvents: "none",
            }}
          >
            {element.text}
          </span>
        ) : null}
        {element.holoEnabled && textOutlineWidth > 0 ? (
          <span
            className="canvas-text-holo"
            aria-hidden="true"
            style={{
              ...textContentStyle,
              position: "absolute",
              inset: 8,
              zIndex: 2,
              width: "auto",
              height: "auto",
              color: "transparent",
              WebkitTextFillColor: "transparent",
              WebkitTextStroke: `${textOutlineStrokeWidth}px transparent`,
              paintOrder: "stroke fill",
              textShadow: "none",
              pointerEvents: "none",
            }}
          >
            {element.text}
          </span>
        ) : null}
        <span
          className="canvas-text-content"
          style={{
            ...textContentStyle,
            position: "absolute",
            inset: 8,
            zIndex: 3,
            display: "block",
            width: "auto",
            height: "auto",
            overflow: "hidden",
          }}
        >
          {element.text}
        </span>
      </div>
    );
  })();

  return (
    <article
      ref={articleRef}
      className="simple-sticker"
      data-canvas-element
      data-element-id={element.id}
      data-element-type={element.type}
      data-selected={selected}
      data-drawing={drawing}
      data-text-holo={element.type === "text" && element.holoEnabled}
      style={style}
      aria-label={isTextual ? "Text" : "Shape"}
      role="group"
      tabIndex={0}
      onFocus={() => onSelect(element.id)}
      onPointerDown={handleElementPointerDown}
      onDoubleClick={() => {
        if (isTextual) onStartEditing(element.id);
      }}
      onPointerEnter={handleHoloPointerMove}
      onPointerMove={handleHoloPointerMove}
      onPointerLeave={handleHoloPointerLeave}
    >
      {content}

      {selected && !editing && !drawing ? (
        <>
          <button
            className="simple-sticker-rotate"
            type="button"
            aria-label="Rotate element"
            onPointerDown={(event) => startGesture(event, "rotate")}
          >
            <Icon name="rotate" />
          </button>
          <button
            className="simple-sticker-corner tr"
            type="button"
            aria-label="Resize element"
            onPointerDown={(event) => startGesture(event, "resize")}
          />
          <button
            className="simple-sticker-resize-bl"
            type="button"
            aria-label="Resize element"
            onPointerDown={(event) => startGesture(event, "resize")}
          />
          <button
            className="simple-sticker-resize"
            type="button"
            aria-label="Resize element"
            onPointerDown={(event) => startGesture(event, "resize")}
          />
        </>
      ) : null}
    </article>
  );
}

export const CanvasElementItem = memo(CanvasElementItemComponent);

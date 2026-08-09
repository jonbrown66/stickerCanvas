"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
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
import { CanvasPropertiesToolbar } from "./CanvasPropertiesToolbar";

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
  onDelete: (element: CanvasNonImageElement) => void;
  onStartEditing: (id: string) => void;
  onCommitText: (id: string, text: string) => void;
  onCancelEditing: (id: string) => void;
  onStyleChange: (
    id: string,
    patch: Partial<CanvasNonImageElement>,
    commit?: boolean,
  ) => void;
}

function CanvasElementItemComponent({
  element,
  selected,
  editing,
  drawing = false,
  onGestureStart,
  onSelect,
  onDelete,
  onStartEditing,
  onCommitText,
  onCancelEditing,
  onStyleChange,
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
  const [toolbarPlacement, setToolbarPlacement] = useState<"left" | "right">(
    "right",
  );
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

  useEffect(() => {
    if (!selected) return;
    const updatePlacement = () => {
      const rect = articleRef.current?.getBoundingClientRect();
      if (!rect) return;
      setToolbarPlacement(
        window.innerWidth - rect.right < 260 ? "left" : "right",
      );
    };
    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    return () => window.removeEventListener("resize", updatePlacement);
  }, [selected, element.x, element.y, element.width, element.height]);

  const style = {
    width: element.width,
    height: element.height,
    zIndex: element.zIndex,
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
      commitText();
    }
  };

  const handleElementPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (editing) {
      event.stopPropagation();
      return;
    }
    onSelect(element.id);
    onGestureStart(event, element, "move");
  };

  const applyHoloPointer = useCallback((x: number, y: number) => {
    const article = articleRef.current;
    if (!article) return;
    const offsetX = x - 0.5;
    const offsetY = y - 0.5;
    const distance = Math.min(1, Math.hypot(offsetX, offsetY) * 1.8);
    article.style.setProperty("--text-holo-x", `${x * 100}%`);
    article.style.setProperty("--text-holo-y", `${y * 100}%`);
    article.style.setProperty(
      "--text-holo-angle",
      `${112 + offsetX * 34 - offsetY * 22}deg`,
    );
    article.style.setProperty(
      "--text-holo-opacity",
      `${0.66 + distance * 0.24}`,
    );
  }, []);

  const scheduleHoloPointer = useCallback(
    (x: number, y: number) => {
      const motion = holoMotionRef.current;
      motion.targetX = x;
      motion.targetY = y;
      if (holoFrameRef.current !== null) return;
      motion.lastTime = 0;

      const tick = (now: number) => {
        const deltaSeconds = motion.lastTime
          ? Math.min(0.032, (now - motion.lastTime) / 1_000)
          : 1 / 60;
        motion.lastTime = now;
        const stiffness = 230;
        const damping = 24;
        motion.velocityX +=
          (motion.targetX - motion.x) * stiffness * deltaSeconds -
          motion.velocityX * damping * deltaSeconds;
        motion.velocityY +=
          (motion.targetY - motion.y) * stiffness * deltaSeconds -
          motion.velocityY * damping * deltaSeconds;
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
          aria-label={element.shape}
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
      aria-label={element.type}
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
          <CanvasPropertiesToolbar
            element={element}
            placement={toolbarPlacement}
            onChange={(patch, commit) =>
              onStyleChange(element.id, patch, commit)
            }
            onDelete={() => onDelete(element)}
          />
        </>
      ) : null}
    </article>
  );
}

export const CanvasElementItem = memo(CanvasElementItemComponent);

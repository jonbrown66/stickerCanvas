"use client";

import {
  memo,
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
        window.innerWidth - rect.right < 210 ? "left" : "right",
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

    const textStyle = {
      color: element.color,
      fontSize: element.fontSize,
      fontWeight: element.fontWeight,
      textAlign: element.textAlign,
      background: element.backgroundColor,
      border: `${element.borderWidth}px solid ${element.borderColor}`,
      borderRadius: element.borderRadius,
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
            ...textStyle,
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
          ...textStyle,
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          padding: 8,
          whiteSpace: "pre-wrap",
          overflow: "hidden",
          lineHeight: 1.35,
          userSelect: "none",
        }}
      >
        {element.text}
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
      style={style}
      aria-label={element.type}
      role="group"
      tabIndex={0}
      onFocus={() => onSelect(element.id)}
      onPointerDown={handleElementPointerDown}
      onDoubleClick={() => {
        if (isTextual) onStartEditing(element.id);
      }}
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

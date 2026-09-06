"use client";

import { useLayoutEffect, useRef } from "react";
import { createStyleCommitBoundary } from "@/lib/style-commit";

interface ColorInputProps {
  label: string;
  value: string;
  scope?: string;
  disabled?: boolean;
  onChange: (value: string, commit: boolean) => void;
}

export function CanvasColorInput({
  label,
  value,
  scope = label,
  disabled = false,
  onChange,
}: ColorInputProps) {
  const boundaryRef = useRef(createStyleCommitBoundary<string>());
  useLayoutEffect(() => {
    boundaryRef.current.syncScope(scope);
  }, [scope]);

  return (
    <label
      className="canvas-style-color"
      data-disabled={disabled}
      title={label}
    >
      <input
        type="color"
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) =>
          boundaryRef.current.preview(scope, event.currentTarget.value, (nextValue) =>
            onChange(nextValue, false),
          )
        }
        onBlur={() =>
          boundaryRef.current.commit(scope, (nextValue) => onChange(nextValue, true))
        }
      />
      <span
        className="canvas-style-color-dot"
        style={{ backgroundColor: value }}
        aria-hidden="true"
      />
    </label>
  );
}

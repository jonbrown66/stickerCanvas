"use client";

interface ColorInputProps {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string, commit: boolean) => void;
}

export function CanvasColorInput({
  label,
  value,
  disabled = false,
  onChange,
}: ColorInputProps) {
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
        onChange={(event) => onChange(event.currentTarget.value, false)}
        onBlur={(event) => onChange(event.currentTarget.value, true)}
      />
      <span
        className="canvas-style-color-dot"
        style={{ backgroundColor: value }}
        aria-hidden="true"
      />
    </label>
  );
}

import type {
  CanvasBackgroundConfig,
  CanvasElement,
  CanvasShapeElement,
  CanvasSticker,
  CanvasTextElement,
} from "./canvas-types";
import { getStickerVisualPadding, renderStickerWithOutline } from "./sticker-image-processing";

const PAPER_COLOR = "#f6f1e7";
const DOT_COLOR = "rgba(116, 108, 95, 0.18)";
const GRID_SIZE = 28;
const CONTENT_MARGIN = 52;
const MAX_EXPORT_EDGE = 4096;
const MAX_EXPORT_PIXELS = 16_000_000;
const PREFERRED_SCALE = 2;

export type CanvasExportResult = {
  blob: Blob;
  width: number;
  height: number;
  scale: number;
};

type Bounds = { left: number; top: number; right: number; bottom: number };

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Canvas export failed")),
      "image/png",
    );
  });
}

function getImagePadding(element: CanvasSticker) {
  return getStickerVisualPadding(element.outlineWidth ?? 0, element);
}

function getVisualPadding(element: CanvasElement) {
  if (element.type === "image") return getImagePadding(element);
  if (element.type === "shape") return element.strokeWidth / 2 + 2;
  return Math.max(element.borderWidth / 2,
    element.textOutlineWidth > 0 ? element.textOutlineWidth * 1.8 + 4 : 0);
}

function includeRotatedElement(bounds: Bounds, element: CanvasElement) {
  const padding = getVisualPadding(element);
  const halfWidth = element.width / 2 + padding;
  const halfHeight = element.height / 2 + padding;
  const radians = (element.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const corners = [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ];

  corners.forEach(([x, y]) => {
    const rotatedX = element.x + x * cos - y * sin;
    const rotatedY = element.y + x * sin + y * cos;
    bounds.left = Math.min(bounds.left, rotatedX);
    bounds.top = Math.min(bounds.top, rotatedY);
    bounds.right = Math.max(bounds.right, rotatedX);
    bounds.bottom = Math.max(bounds.bottom, rotatedY);
  });
}

export function getCanvasExportBounds(elements: readonly CanvasElement[]): Bounds {
  if (!elements.length) throw new Error("Canvas is empty");
  const bounds: Bounds = {
    left: Number.POSITIVE_INFINITY,
    top: Number.POSITIVE_INFINITY,
    right: Number.NEGATIVE_INFINITY,
    bottom: Number.NEGATIVE_INFINITY,
  };
  elements.forEach((element) => includeRotatedElement(bounds, element));
  return {
    left: bounds.left - CONTENT_MARGIN,
    top: bounds.top - CONTENT_MARGIN,
    right: bounds.right + CONTENT_MARGIN,
    bottom: bounds.bottom + CONTENT_MARGIN,
  };
}

function getExportScale(bounds: Bounds) {
  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  return Math.min(
    PREFERRED_SCALE,
    MAX_EXPORT_EDGE / Math.max(width, height),
    Math.sqrt(MAX_EXPORT_PIXELS / (width * height)),
  );
}

function isColorDark(hexColor: string): boolean {
  if (!hexColor.startsWith("#")) return false;
  const hex = hexColor.replace("#", "");
  const num = parseInt(hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex, 16);
  if (Number.isNaN(num)) return false;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

function drawPaperBackground(
  context: CanvasRenderingContext2D,
  bounds: Bounds,
  scale: number,
  background?: CanvasBackgroundConfig,
) {
  const bgStyle = background?.style ?? "dots";
  if (bgStyle === "transparent") {
    return;
  }

  const width = (bounds.right - bounds.left) * scale;
  const height = (bounds.bottom - bounds.top) * scale;
  const bgColor = background?.color ?? PAPER_COLOR;
  context.fillStyle = PAPER_COLOR;
  if (bgColor !== PAPER_COLOR) {
    context.fillStyle = bgColor;
  }
  context.fillRect(0, 0, width, height);

  if (bgStyle === "solid") {
    return;
  }

  const firstX = Math.floor(bounds.left / GRID_SIZE) * GRID_SIZE;
  const firstY = Math.floor(bounds.top / GRID_SIZE) * GRID_SIZE;

  const isDark = isColorDark(bgColor);
  const gridAlpha = background?.gridOpacity ?? 0.42;
  const gridColor = isDark
    ? `rgba(255, 255, 255, ${gridAlpha})`
    : (background ? `rgba(60, 50, 40, ${gridAlpha})` : DOT_COLOR);

  context.fillStyle = gridColor;
  context.strokeStyle = gridColor;
  context.lineWidth = Math.max(0.75, scale * 0.75);

  if (bgStyle === "dots") {
    const dotRadius = Math.max(0.65, scale * 0.9);
    for (let x = firstX; x <= bounds.right; x += GRID_SIZE) {
      for (let y = firstY; y <= bounds.bottom; y += GRID_SIZE) {
        context.beginPath();
        context.arc((x - bounds.left) * scale, (y - bounds.top) * scale, dotRadius, 0, Math.PI * 2);
        context.fill();
      }
    }
  } else if (bgStyle === "grid") {
    context.beginPath();
    for (let x = firstX; x <= bounds.right; x += GRID_SIZE) {
      const drawX = (x - bounds.left) * scale;
      context.moveTo(drawX, 0);
      context.lineTo(drawX, height);
    }
    for (let y = firstY; y <= bounds.bottom; y += GRID_SIZE) {
      const drawY = (y - bounds.top) * scale;
      context.moveTo(0, drawY);
      context.lineTo(width, drawY);
    }
    context.stroke();
  } else if (bgStyle === "lines") {
    context.beginPath();
    for (let y = firstY; y <= bounds.bottom; y += GRID_SIZE) {
      const drawY = (y - bounds.top) * scale;
      context.moveTo(0, drawY);
      context.lineTo(width, drawY);
    }
    context.stroke();
  }
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function drawTextLine(
  context: CanvasRenderingContext2D,
  line: string,
  x: number,
  y: number,
  maximumWidth: number,
  align: CanvasTextElement["textAlign"],
  lineHeight: number,
  textOutlineWidth: number,
  textOutlineColor: string,
  holoEnabled: boolean,
) {
  const words = line.includes(" ") ? line.split(/(\s+)/) : [...line];
  let current = "";
  const lines: string[] = [];
  words.forEach((word) => {
    if (current && context.measureText(current + word).width > maximumWidth) {
      lines.push(current);
      current = word.trimStart();
    } else {
      current += word;
    }
  });
  if (current || !lines.length) lines.push(current);
  lines.forEach((wrapped, index) => {
    const measured = context.measureText(wrapped).width;
    const drawX =
      align === "center"
        ? x + maximumWidth / 2 - measured / 2
        : align === "right"
          ? x + maximumWidth - measured
          : x;
    if (textOutlineWidth > 0) {
      context.save();
      context.strokeStyle = textOutlineColor;
      context.lineWidth = textOutlineWidth;
      context.shadowColor = "rgba(42, 48, 31, 0.48)";
      context.shadowBlur = Math.max(1.5, textOutlineWidth * 0.34);
      context.shadowOffsetY = Math.max(1.5, textOutlineWidth * 0.28);
      context.strokeText(wrapped, drawX, y + index * lineHeight);
      if (holoEnabled) {
        const holo = context.createLinearGradient(
          drawX,
          y - lineHeight,
          drawX + Math.max(1, measured),
          y,
        );
        holo.addColorStop(0, "rgba(93, 221, 211, 0.88)");
        holo.addColorStop(0.24, "rgba(192, 154, 255, 0.78)");
        holo.addColorStop(0.46, "rgba(255, 220, 132, 0.84)");
        holo.addColorStop(0.64, "rgba(133, 224, 171, 0.82)");
        holo.addColorStop(0.82, "rgba(111, 181, 255, 0.84)");
        holo.addColorStop(1, "rgba(247, 165, 208, 0.82)");
        context.shadowColor = "transparent";
        context.shadowBlur = 0;
        context.shadowOffsetY = 0;
        context.globalAlpha = Math.min(1, 0.84);
        context.strokeStyle = holo;
        context.strokeText(wrapped, drawX, y + index * lineHeight);
      }
      context.restore();
    }
    context.fillText(wrapped, drawX, y + index * lineHeight);
  });
  return lines.length;
}

function drawTextElement(
  context: CanvasRenderingContext2D,
  element: CanvasTextElement,
  scale: number,
) {
  const width = element.width * scale;
  const height = element.height * scale;
  const padding = 8 * scale;
  if (element.backgroundColor !== "transparent") {
    roundedRect(context, 0, 0, width, height, element.borderRadius * scale);
    context.fillStyle = element.backgroundColor;
    context.fill();
  }
  if (element.borderWidth > 0) {
    roundedRect(context, 0, 0, width, height, element.borderRadius * scale);
    context.strokeStyle = element.borderColor;
    context.lineWidth = element.borderWidth * scale;
    context.stroke();
  }
  context.fillStyle = element.color;
  context.font = `${element.fontWeight} ${element.fontSize * scale}px "Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif`;
  context.textBaseline = "alphabetic";
  context.lineJoin = "round";
  context.lineCap = "round";
  context.miterLimit = 2;
  const lineHeight = element.fontSize * scale * 1.35;
  let lineOffset = 0;
  element.text.split("\n").forEach((line) => {
    const lineCount = drawTextLine(
      context,
      line,
      padding,
      padding + element.fontSize * scale + lineOffset * lineHeight,
      Math.max(1, width - padding * 2),
      element.textAlign,
      lineHeight,
      element.textOutlineWidth * scale,
      element.textOutlineColor,
      element.holoEnabled,
    );
    lineOffset += lineCount;
  });
}

function drawShapeElement(
  context: CanvasRenderingContext2D,
  element: CanvasShapeElement,
  scale: number,
) {
  const width = element.width * scale;
  const height = element.height * scale;
  context.beginPath();
  if (element.shape === "rectangle") {
    context.rect(0, 0, width, height);
  } else if (element.shape === "ellipse") {
    context.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  } else if (element.shape === "triangle") {
    context.moveTo(width / 2, 0);
    context.lineTo(width, height);
    context.lineTo(0, height);
    context.closePath();
  } else if (element.shape === "diamond") {
    context.moveTo(width / 2, 0);
    context.lineTo(width, height / 2);
    context.lineTo(width / 2, height);
    context.lineTo(0, height / 2);
    context.closePath();
  } else {
    context.moveTo(0, height / 2);
    context.lineTo(width, height / 2);
  }
  if (element.fillEnabled && element.shape !== "line") {
    context.fillStyle = element.fillColor;
    context.fill();
  }
  context.strokeStyle = element.strokeColor;
  context.lineWidth = element.strokeWidth * scale;
  context.lineCap = element.shape === "line" ? "round" : "butt";
  context.stroke();
}

async function drawImageElement(
  context: CanvasRenderingContext2D,
  element: CanvasSticker,
  scale: number,
) {
  const rendered = await renderStickerWithOutline(
    element.image,
    element.width,
    element.outlineWidth ?? 0,
    element.outlineColor || "#ffffff",
    { ...element, opacity: 1 },
    { width: element.width * scale, height: element.height * scale },
  );
  try {
    const scaleX = element.width * scale / rendered.contentWidth;
    const scaleY = element.height * scale / rendered.contentHeight;
    context.drawImage(
      rendered.canvas,
      -rendered.padding * scaleX,
      -rendered.padding * scaleY,
      rendered.canvas.width * scaleX,
      rendered.canvas.height * scaleY,
    );
  } finally {
    rendered.canvas.width = 1;
    rendered.canvas.height = 1;
  }
}

async function drawElement(
  context: CanvasRenderingContext2D,
  element: CanvasElement,
  bounds: Bounds,
  scale: number,
) {
  const opacity = Math.max(0, Math.min(1, element.opacity ?? 1));
  if (opacity === 0) return;
  context.save();
  context.translate((element.x - bounds.left) * scale, (element.y - bounds.top) * scale);
  context.rotate((element.rotation * Math.PI) / 180);
  context.translate((-element.width / 2) * scale, (-element.height / 2) * scale);
  let layer: HTMLCanvasElement | null = null;
  try {
    context.globalAlpha = opacity;
    if (element.type === "image") {
      await drawImageElement(context, element, scale);
    } else if (opacity < 1) {
      // Apply opacity once to the whole element, including overlapping fill,
      // stroke and foil, just like the preview's element opacity.
      const padding = Math.ceil(getVisualPadding(element) * scale);
      layer = document.createElement("canvas");
      layer.width = Math.max(1, Math.ceil(element.width * scale) + padding * 2);
      layer.height = Math.max(1, Math.ceil(element.height * scale) + padding * 2);
      const layerContext = layer.getContext("2d");
      if (!layerContext) throw new Error("Canvas export unavailable");
      layerContext.translate(padding, padding);
      if (element.type === "text") drawTextElement(layerContext, element, scale);
      else drawShapeElement(layerContext, element, scale);
      context.drawImage(layer, -padding, -padding);
    } else if (element.type === "text") {
      drawTextElement(context, element, scale);
    } else {
      drawShapeElement(context, element, scale);
    }
  } finally {
    if (layer) {
      layer.width = 1;
      layer.height = 1;
    }
    context.restore();
  }
}

export async function exportCanvasToPng(
  elements: readonly CanvasElement[],
  background?: CanvasBackgroundConfig,
): Promise<CanvasExportResult> {
  const ordered = [...elements].sort((left, right) => left.zIndex - right.zIndex);
  const bounds = getCanvasExportBounds(ordered);
  const scale = getExportScale(bounds);
  const width = Math.max(1, Math.round((bounds.right - bounds.left) * scale));
  const height = Math.max(1, Math.round((bounds.bottom - bounds.top) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas export unavailable");
  try {
    if (background) {
      drawPaperBackground(context, bounds, scale, background);
    } else {
      drawPaperBackground(context, bounds, scale);
    }
    for (const element of ordered) {
      await drawElement(context, element, bounds, scale);
    }
    const blob = await canvasToBlob(canvas);
    return { blob, width, height, scale };
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}

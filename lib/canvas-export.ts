import type {
  CanvasElement,
  CanvasShapeElement,
  CanvasSticker,
  CanvasTextElement,
} from "./canvas-types";
import { renderStaticHoloBorder, renderStaticOilFilm } from "./oil-film-render";

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
  const outline = element.outlineWidth ?? 0;
  if (outline <= 0) return 0;
  return outline + Math.max(2.4, outline * 0.35) * 2 + 3;
}

function getVisualPadding(element: CanvasElement) {
  if (element.type === "image") return getImagePadding(element);
  if (element.type === "shape") return element.strokeWidth / 2 + 2;
  return 0;
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

function drawPaperBackground(
  context: CanvasRenderingContext2D,
  bounds: Bounds,
  scale: number,
) {
  const width = (bounds.right - bounds.left) * scale;
  const height = (bounds.bottom - bounds.top) * scale;
  context.fillStyle = PAPER_COLOR;
  context.fillRect(0, 0, width, height);
  context.fillStyle = DOT_COLOR;
  const firstX = Math.floor(bounds.left / GRID_SIZE) * GRID_SIZE;
  const firstY = Math.floor(bounds.top / GRID_SIZE) * GRID_SIZE;
  const dotRadius = Math.max(0.65, scale * 0.9);
  for (let x = firstX; x <= bounds.right; x += GRID_SIZE) {
    for (let y = firstY; y <= bounds.bottom; y += GRID_SIZE) {
      context.beginPath();
      context.arc((x - bounds.left) * scale, (y - bounds.top) * scale, dotRadius, 0, Math.PI * 2);
      context.fill();
    }
  }
}

type DecodedImage = {
  image: HTMLImageElement;
  url: string;
};

async function decodeBlob(blob: Blob): Promise<DecodedImage> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { image, url };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function closeDecodedImage(decoded: DecodedImage) {
  URL.revokeObjectURL(decoded.url);
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
  const decoded = await decodeBlob(element.image);
  try {
    const { image } = decoded;
    const padding = getImagePadding(element);
    if (padding > 0) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil((element.width + padding * 2) * scale));
      canvas.height = Math.max(1, Math.ceil((element.height + padding * 2) * scale));
      const itemContext = canvas.getContext("2d");
      if (!itemContext) throw new Error("Canvas export unavailable");
      const mask = document.createElement("canvas");
      mask.width = canvas.width;
      mask.height = canvas.height;
      const maskContext = mask.getContext("2d");
      if (!maskContext) throw new Error("Canvas export unavailable");
      maskContext.drawImage(
        image,
        padding * scale,
        padding * scale,
        element.width * scale,
        element.height * scale,
      );
      const outline = document.createElement("canvas");
      outline.width = canvas.width;
      outline.height = canvas.height;
      const outlineContext = outline.getContext("2d");
      if (!outlineContext) throw new Error("Canvas export unavailable");
      outlineContext.filter = `blur(${Math.max(0.75, (element.outlineWidth ?? 0) * 0.35) * scale}px)`;
      for (let angle = 0; angle < 360; angle += 20) {
        const radians = (angle * Math.PI) / 180;
        outlineContext.drawImage(
          mask,
          Math.cos(radians) * (element.outlineWidth ?? 0) * scale,
          Math.sin(radians) * (element.outlineWidth ?? 0) * scale,
        );
      }
      outlineContext.filter = "none";
      outlineContext.globalCompositeOperation = "source-in";
      outlineContext.fillStyle = element.outlineColor || "#ffffff";
      outlineContext.fillRect(0, 0, outline.width, outline.height);
      itemContext.drawImage(outline, 0, 0);
      if (element.oilFilmEnabled) {
        const holoBorder = document.createElement("canvas");
        holoBorder.width = canvas.width;
        holoBorder.height = canvas.height;
        const holoContext = holoBorder.getContext("2d");
        if (!holoContext) throw new Error("Canvas export unavailable");
        holoContext.drawImage(outline, 0, 0);
        renderStaticHoloBorder(holoContext, holoBorder.width, holoBorder.height);
        itemContext.drawImage(holoBorder, 0, 0);
        holoBorder.width = 1;
        holoBorder.height = 1;
      }
      itemContext.drawImage(mask, 0, 0);
      if (element.oilFilmEnabled) {
        const oilCanvas = document.createElement("canvas");
        oilCanvas.width = canvas.width;
        oilCanvas.height = canvas.height;
        const oilContext = oilCanvas.getContext("2d");
        if (!oilContext) throw new Error("Canvas export unavailable");
        oilContext.drawImage(mask, 0, 0);
        renderStaticOilFilm(oilContext, oilCanvas.width, oilCanvas.height);
        oilContext.globalCompositeOperation = "destination-in";
        oilContext.drawImage(mask, 0, 0);
        itemContext.drawImage(oilCanvas, 0, 0);
        oilCanvas.width = 1;
        oilCanvas.height = 1;
      }
      context.drawImage(canvas, -padding * scale, -padding * scale);
      mask.width = 1;
      mask.height = 1;
      outline.width = 1;
      outline.height = 1;
      canvas.width = 1;
      canvas.height = 1;
      return;
    }
    context.drawImage(image, 0, 0, element.width * scale, element.height * scale);
  } finally {
    closeDecodedImage(decoded);
  }
}

async function drawElement(
  context: CanvasRenderingContext2D,
  element: CanvasElement,
  bounds: Bounds,
  scale: number,
) {
  context.save();
  context.translate((element.x - bounds.left) * scale, (element.y - bounds.top) * scale);
  context.rotate((element.rotation * Math.PI) / 180);
  context.translate((-element.width / 2) * scale, (-element.height / 2) * scale);
  if (element.type === "image") {
    await drawImageElement(context, element, scale);
  } else if (element.type === "text") {
    drawTextElement(context, element, scale);
  } else {
    drawShapeElement(context, element, scale);
  }
  context.restore();
}

export async function exportCanvasToPng(
  elements: readonly CanvasElement[],
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
  drawPaperBackground(context, bounds, scale);
  for (const element of ordered) {
    await drawElement(context, element, bounds, scale);
  }
  const blob = await canvasToBlob(canvas);
  canvas.width = 1;
  canvas.height = 1;
  return { blob, width, height, scale };
}

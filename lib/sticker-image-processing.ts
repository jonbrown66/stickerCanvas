import { renderStaticHoloBorder, renderStaticOilFilm } from "./oil-film-render";

export type AlphaBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type ProcessedStickerImage = {
  blob: Blob;
  width: number;
  height: number;
};

export function findAlphaBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = 10,
): AlphaBounds | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] < alphaThreshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  return right < left || bottom < top
    ? null
    : { left, top, right, bottom };
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Sticker failed"))),
      "image/png",
    );
  });
}

export async function ensurePngBlob(blob: Blob) {
  if (blob.type === "image/png") return blob;
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, image.naturalWidth);
    canvas.height = Math.max(1, image.naturalHeight);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PNG unavailable");
    context.drawImage(image, 0, 0);
    return await canvasToBlob(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function createOutlinedCutout(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<ProcessedStickerImage> {
  const bounds = findAlphaBounds(pixels, width, height, 15);
  if (!bounds) throw new Error("No subject found");

  const cropWidth = bounds.right - bounds.left + 1;
  const cropHeight = bounds.bottom - bounds.top + 1;
  const padding = 16;

  const fullImage = new ImageData(width, height);
  fullImage.data.set(pixels);
  const fullCanvas = document.createElement("canvas");
  fullCanvas.width = width;
  fullCanvas.height = height;
  const fullContext = fullCanvas.getContext("2d");
  if (!fullContext) throw new Error("Image processing unavailable");
  fullContext.putImageData(fullImage, 0, 0);

  const silhouette = document.createElement("canvas");
  silhouette.width = cropWidth;
  silhouette.height = cropHeight;
  const silhouetteContext = silhouette.getContext("2d");
  if (silhouetteContext) {
    silhouetteContext.drawImage(
      fullCanvas,
      bounds.left,
      bounds.top,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight,
    );
    silhouetteContext.globalCompositeOperation = "source-in";
  }

  const output = document.createElement("canvas");
  output.width = cropWidth + padding * 2;
  output.height = cropHeight + padding * 2;
  const context = output.getContext("2d");
  if (!context) throw new Error("Image processing unavailable");

  context.drawImage(
    fullCanvas,
    bounds.left,
    bounds.top,
    cropWidth,
    cropHeight,
    padding,
    padding,
    cropWidth,
    cropHeight,
  );

  const blob = await canvasToBlob(output);
  fullCanvas.width = 1;
  fullCanvas.height = 1;
  silhouette.width = 1;
  silhouette.height = 1;
  output.width = 1;
  output.height = 1;

  return {
    blob,
    width: cropWidth + padding * 2,
    height: cropHeight + padding * 2,
  };
}

export async function exportStickerWithOutline(
  imageBlob: Blob,
  displayWidth: number,
  outlineWidth: number,
  outlineColor: string = "#ffffff",
  options: { oilFilmEnabled?: boolean } = {},
): Promise<Blob> {
  if ((!outlineWidth || outlineWidth <= 0) && !options.oilFilmEnabled) {
    return ensurePngBlob(imageBlob);
  }

  const url = URL.createObjectURL(imageBlob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();

    const naturalWidth = Math.max(1, img.naturalWidth || img.width);
    const naturalHeight = Math.max(1, img.naturalHeight || img.height);
    const maximumSide = 4096;
    const maximumPixels = 12_000_000;
    const renderScale = Math.min(
      1,
      maximumSide / Math.max(naturalWidth, naturalHeight),
      Math.sqrt(maximumPixels / (naturalWidth * naturalHeight)),
    );
    const renderedWidth = Math.max(1, Math.round(naturalWidth * renderScale));
    const renderedHeight = Math.max(1, Math.round(naturalHeight * renderScale));
    const scale = renderedWidth / Math.max(1, displayWidth);
    const scaledOutlineWidth =
      outlineWidth > 0 ? Math.max(0.75, outlineWidth * scale) : 0;
    const scaledBlurRadius =
      outlineWidth > 0
        ? Math.max(0.75, Math.max(2.4, outlineWidth * 0.35) * scale)
        : 0;

    const padding = Math.ceil(
      scaledOutlineWidth + scaledBlurRadius * 2 + 2,
    );
    const w = renderedWidth + padding * 2;
    const h = renderedHeight + padding * 2;

    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = w;
    sourceCanvas.height = h;
    const sCtx = sourceCanvas.getContext("2d");
    if (!sCtx) throw new Error("Export canvas unavailable");

    sCtx.drawImage(
      img,
      padding,
      padding,
      renderedWidth,
      renderedHeight,
    );
    let pixels = sCtx.getImageData(0, 0, w, h).data;

    const size = w * h;
    const pixelBufferLength = size * 4;
    const alpha = new Uint8Array(size);
    for (let i = 0; i < size; i += 1) {
      alpha[i] = pixels[i * 4 + 3];
    }

    const dist = new Float32Array(size);
    const INF = 1e9;
    for (let i = 0; i < size; i += 1) {
      dist[i] = alpha[i] > 15 ? 0 : INF;
    }

    for (let x = 0; x < w; x += 1) {
      for (let y = 1; y < h; y += 1) {
        const idx = y * w + x;
        const prev = (y - 1) * w + x;
        if (dist[idx] > dist[prev] + 1) dist[idx] = dist[prev] + 1;
      }
      for (let y = h - 2; y >= 0; y -= 1) {
        const idx = y * w + x;
        const next = (y + 1) * w + x;
        if (dist[idx] > dist[next] + 1) dist[idx] = dist[next] + 1;
      }
    }

    const d1 = 1.0;
    const d2 = Math.SQRT2;
    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      for (let x = 1; x < w; x += 1) {
        const idx = row + x;
        let minD = dist[idx];
        minD = Math.min(minD, dist[idx - 1] + d1);
        if (y > 0) {
          minD = Math.min(minD, dist[idx - w] + d1);
          minD = Math.min(minD, dist[idx - w - 1] + d2);
          if (x < w - 1) minD = Math.min(minD, dist[idx - w + 1] + d2);
        }
        dist[idx] = minD;
      }
      for (let x = w - 2; x >= 0; x -= 1) {
        const idx = row + x;
        let minD = dist[idx];
        minD = Math.min(minD, dist[idx + 1] + d1);
        if (y < h - 1) {
          minD = Math.min(minD, dist[idx + w] + d1);
          minD = Math.min(minD, dist[idx + w + 1] + d2);
          if (x > 0) minD = Math.min(minD, dist[idx + w - 1] + d2);
        }
        dist[idx] = minD;
      }
    }

    let r = 255, g = 255, b = 255;
    if (outlineColor.startsWith("#")) {
      const hex = outlineColor.slice(1);
      if (hex.length === 6) {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      }
    }

    pixels = new Uint8ClampedArray(0);
    sourceCanvas.width = 1;
    sourceCanvas.height = 1;

    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = w;
    outputCanvas.height = h;
    const oCtx = outputCanvas.getContext("2d");
    if (!oCtx) throw new Error("Export canvas unavailable");

    let maskCanvas: HTMLCanvasElement | null = null;
    let softenedMaskCanvas: HTMLCanvasElement | null = null;
    if (scaledOutlineWidth > 0) {
      let maskPixels = new Uint8ClampedArray(pixelBufferLength);
      for (let i = 0; i < size; i += 1) {
        const coverage = Math.max(
          0,
          Math.min(1, scaledOutlineWidth + 0.5 - dist[i]),
        );
        const p = i * 4;
        maskPixels[p] = 255;
        maskPixels[p + 1] = 255;
        maskPixels[p + 2] = 255;
        maskPixels[p + 3] = Math.round(coverage * 255);
      }

      maskCanvas = document.createElement("canvas");
      maskCanvas.width = w;
      maskCanvas.height = h;
      const maskContext = maskCanvas.getContext("2d");
      if (!maskContext) throw new Error("Export canvas unavailable");
      maskContext.putImageData(new ImageData(maskPixels, w, h), 0, 0);
      maskPixels = new Uint8ClampedArray(0);

      softenedMaskCanvas = document.createElement("canvas");
      softenedMaskCanvas.width = w;
      softenedMaskCanvas.height = h;
      const softenedContext = softenedMaskCanvas.getContext("2d");
      if (!softenedContext) throw new Error("Export canvas unavailable");
      softenedContext.filter = `blur(${scaledBlurRadius}px)`;
      softenedContext.drawImage(maskCanvas, 0, 0);
      softenedContext.filter = "none";
      maskCanvas.width = 1;
      maskCanvas.height = 1;

      const outlineImage = softenedContext.getImageData(0, 0, w, h);
      const outlinePixels = outlineImage.data;
      softenedMaskCanvas.width = 1;
      softenedMaskCanvas.height = 1;
      for (let i = 0; i < size; i += 1) {
        const p = i * 4;
        const solidAlpha = Math.max(
          0,
          Math.min(1, (outlinePixels[p + 3] / 255) * 24 - 11.5),
        );
        outlinePixels[p] = r;
        outlinePixels[p + 1] = g;
        outlinePixels[p + 2] = b;
        outlinePixels[p + 3] = Math.round(solidAlpha * 255);
      }
      oCtx.putImageData(outlineImage, 0, 0);
    }

    if (options.oilFilmEnabled && scaledOutlineWidth > 0) {
      const holoBorder = document.createElement("canvas");
      holoBorder.width = w;
      holoBorder.height = h;
      const holoContext = holoBorder.getContext("2d");
      if (!holoContext) throw new Error("Export canvas unavailable");
      holoContext.drawImage(outputCanvas, 0, 0);
      renderStaticHoloBorder(holoContext, w, h);
      oCtx.drawImage(holoBorder, 0, 0);
      holoBorder.width = 1;
      holoBorder.height = 1;
    }

    oCtx.drawImage(
      img,
      padding,
      padding,
      renderedWidth,
      renderedHeight,
    );

    if (options.oilFilmEnabled) {
      const oilCanvas = document.createElement("canvas");
      oilCanvas.width = w;
      oilCanvas.height = h;
      const oilContext = oilCanvas.getContext("2d");
      if (!oilContext) throw new Error("Export canvas unavailable");
      oilContext.drawImage(img, padding, padding, renderedWidth, renderedHeight);
      renderStaticOilFilm(oilContext, w, h);
      oilContext.globalCompositeOperation = "destination-in";
      oilContext.drawImage(img, padding, padding, renderedWidth, renderedHeight);
      oCtx.drawImage(oilCanvas, 0, 0);
      oilCanvas.width = 1;
      oilCanvas.height = 1;
    }

    const exportBlob = await canvasToBlob(outputCanvas);
    if (maskCanvas) {
      maskCanvas.width = 1;
      maskCanvas.height = 1;
    }
    if (softenedMaskCanvas) {
      softenedMaskCanvas.width = 1;
      softenedMaskCanvas.height = 1;
    }
    outputCanvas.width = 1;
    outputCanvas.height = 1;

    return exportBlob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

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
      outlineWidth > 0 ? Math.max(1, Math.round(outlineWidth * scale)) : 0;

    const padding = Math.ceil(scaledOutlineWidth + 16);
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
    const imgData = sCtx.getImageData(0, 0, w, h);
    const pixels = imgData.data;

    const size = w * h;
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

    const outData = new Uint8ClampedArray(pixels.length);
    for (let i = 0; i < size; i += 1) {
      const p = i * 4;
      const srcA = pixels[p + 3] / 255;
      const d = dist[i];

      if (srcA > 0.02) {
        const bgWeight = 1 - srcA;
        outData[p] = Math.round(pixels[p] * srcA + r * bgWeight);
        outData[p + 1] = Math.round(pixels[p + 1] * srcA + g * bgWeight);
        outData[p + 2] = Math.round(pixels[p + 2] * srcA + b * bgWeight);
        outData[p + 3] = 255;
      } else if (d <= scaledOutlineWidth + 0.5) {
        const edgeAlpha = Math.max(0, Math.min(1, scaledOutlineWidth + 0.5 - d));
        outData[p] = r;
        outData[p + 1] = g;
        outData[p + 2] = b;
        outData[p + 3] = Math.round(edgeAlpha * 255);
      }
    }

    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = w;
    outputCanvas.height = h;
    const oCtx = outputCanvas.getContext("2d");
    if (!oCtx) throw new Error("Export canvas unavailable");
    const exportPixels = new Uint8ClampedArray(outData.length);
    exportPixels.set(outData);
    oCtx.putImageData(new ImageData(exportPixels, w, h), 0, 0);

    if (options.oilFilmEnabled) {
      oCtx.save();
      oCtx.globalCompositeOperation = "source-atop";
      oCtx.globalAlpha = 0.34;
      const spectrum = oCtx.createLinearGradient(0, h, w, 0);
      spectrum.addColorStop(0, "#ff4d9d");
      spectrum.addColorStop(0.2, "#ffd166");
      spectrum.addColorStop(0.4, "#66e3b4");
      spectrum.addColorStop(0.62, "#5eb5ff");
      spectrum.addColorStop(0.82, "#a978ff");
      spectrum.addColorStop(1, "#ff72d2");
      oCtx.fillStyle = spectrum;
      oCtx.fillRect(0, 0, w, h);

      oCtx.globalAlpha = 0.24;
      const gloss = oCtx.createRadialGradient(
        w * 0.3,
        h * 0.22,
        0,
        w * 0.3,
        h * 0.22,
        Math.max(w, h) * 0.72,
      );
      gloss.addColorStop(0, "rgba(255,255,255,0.95)");
      gloss.addColorStop(0.38, "rgba(255,255,255,0.12)");
      gloss.addColorStop(1, "rgba(255,255,255,0)");
      oCtx.fillStyle = gloss;
      oCtx.fillRect(0, 0, w, h);
      oCtx.restore();
    }

    const exportBlob = await canvasToBlob(outputCanvas);
    sourceCanvas.width = 1;
    sourceCanvas.height = 1;
    outputCanvas.width = 1;
    outputCanvas.height = 1;

    return exportBlob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

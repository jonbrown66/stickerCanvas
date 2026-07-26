const HEIC_EXTENSION = /\.(heic|heif)$/i;
const HEIC_MIME_TYPE = /^image\/hei[cf]$/i;

export function isHeicFile(file: File) {
  return HEIC_MIME_TYPE.test(file.type) || HEIC_EXTENSION.test(file.name);
}

export async function convertHeicToJpeg(file: File) {
  const { default: decode } = await import("heic-decode");
  const decoded = await decode({
    buffer: new Uint8Array(await file.arrayBuffer()),
  }) as {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  };
  if (!decoded.width || !decoded.height || !decoded.data.length) {
    throw new Error("The HEIC image contained no displayable frame");
  }
  if (decoded.width * decoded.height > 50_000_000) {
    throw new Error("The HEIC image is too large to process safely");
  }
  const pixels: Uint8ClampedArray<ArrayBuffer> = new Uint8ClampedArray(
    decoded.data.length,
  );
  pixels.set(decoded.data);
  const imageData = new ImageData(pixels, decoded.width, decoded.height);

  const maximumSide = 2048;
  const scale = Math.min(
    1,
    maximumSide / Math.max(decoded.width, decoded.height),
  );
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = Math.max(1, Math.round(decoded.width * scale));
  outputCanvas.height = Math.max(1, Math.round(decoded.height * scale));
  const outputContext = outputCanvas.getContext("2d");
  if (!outputContext) throw new Error("Canvas is unavailable");
  let sourceCanvas: HTMLCanvasElement | null = null;
  if ("createImageBitmap" in globalThis) {
    const bitmap = await createImageBitmap(imageData, {
      resizeWidth: outputCanvas.width,
      resizeHeight: outputCanvas.height,
      resizeQuality: "high",
    });
    outputContext.drawImage(bitmap, 0, 0);
    bitmap.close();
  } else {
    sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = decoded.width;
    sourceCanvas.height = decoded.height;
    const sourceContext = sourceCanvas.getContext("2d");
    if (!sourceContext) throw new Error("Canvas is unavailable");
    sourceContext.putImageData(imageData, 0, 0);
    outputContext.drawImage(
      sourceCanvas,
      0,
      0,
      outputCanvas.width,
      outputCanvas.height,
    );
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    outputCanvas.toBlob(
      (blob) => blob
        ? resolve(blob)
        : reject(new Error("Could not encode the decoded HEIC image")),
      "image/jpeg",
      0.94,
    );
  });
  if (sourceCanvas) {
    sourceCanvas.width = 1;
    sourceCanvas.height = 1;
  }
  outputCanvas.width = 1;
  outputCanvas.height = 1;
  return blob;
}

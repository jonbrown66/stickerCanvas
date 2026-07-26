export type BackgroundRemovalProgress = {
  phase: "loading" | "processing";
  progress?: number;
};

export type BackgroundRemovalResult = {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
};

type WorkerResponse =
  | {
      type: "progress";
      id: number;
      phase: BackgroundRemovalProgress["phase"];
      progress?: number;
    }
  | {
      type: "result";
      id: number;
      pixels: ArrayBuffer;
      width: number;
      height: number;
    }
  | { type: "error"; id: number; message: string };

type PendingRequest = {
  resolve: (result: BackgroundRemovalResult) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: BackgroundRemovalProgress) => void;
};

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<number, PendingRequest>();

function resetWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker(
    new URL("../workers/background-removal.worker.ts", import.meta.url),
    { type: "module", name: "sticker-background-removal" },
  );
  worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    if (response.type === "progress") {
      request.onProgress?.({
        phase: response.phase,
        progress: response.progress,
      });
      return;
    }
    pending.delete(response.id);
    if (response.type === "error") {
      resetWorker();
      request.reject(new Error(response.message));
      return;
    }
    try {
      const pixels = new Uint8ClampedArray(response.pixels);
      request.resolve({
        pixels,
        width: response.width,
        height: response.height,
      });
    } catch (error) {
      request.reject(
        error instanceof Error ? error : new Error("Could not create the cutout"),
      );
    }
  });
  worker.addEventListener("error", (event) => {
    const error = new Error(event.message || "Background removal worker failed");
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    resetWorker();
  });
  return worker;
}

async function normalizeImageSource(source: string | Blob) {
  let image: CanvasImageSource;
  let naturalWidth: number;
  let naturalHeight: number;
  let cleanup = () => {};

  if (source instanceof Blob && "createImageBitmap" in globalThis) {
    const bitmap = await createImageBitmap(source);
    image = bitmap;
    naturalWidth = bitmap.width;
    naturalHeight = bitmap.height;
    cleanup = () => bitmap.close();
  } else {
    const element = new Image();
    element.decoding = "async";
    const temporaryUrl =
      source instanceof Blob ? URL.createObjectURL(source) : null;
    await new Promise<void>((resolve, reject) => {
      element.onload = () => resolve();
      element.onerror = () =>
        reject(new Error("The source image could not be decoded"));
      element.src =
        typeof source === "string" ? source : (temporaryUrl as string);
    });
    image = element;
    naturalWidth = element.naturalWidth || element.width;
    naturalHeight = element.naturalHeight || element.height;
    cleanup = () => {
      if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
    };
  }

  try {
    if (!naturalWidth || !naturalHeight) {
      throw new Error("The source image has no visible dimensions");
    }
    const maximumSide = 2048;
    const scale = Math.min(
      1,
      maximumSide / Math.max(naturalWidth, naturalHeight),
    );
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("Could not prepare the image")),
        "image/png",
      );
    });
  } finally {
    cleanup();
  }
}

export async function removeImageBackground(
  source: string | Blob,
  onProgress?: (progress: BackgroundRemovalProgress) => void,
) {
  const blob = await normalizeImageSource(source);
  const image = await blob.arrayBuffer();
  const id = ++requestId;
  return new Promise<BackgroundRemovalResult>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    getWorker().postMessage(
      { type: "remove", id, image, mimeType: blob.type || "image/png" },
      [image],
    );
  });
}

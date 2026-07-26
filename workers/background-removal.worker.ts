/// <reference lib="webworker" />

import * as ort from "onnxruntime-web";

type WorkerRequest = {
  id: number;
  type: "remove";
  image: ArrayBuffer;
  mimeType: string;
};

const LOCAL_MODEL_PATH = new URL(
  `${import.meta.env.BASE_URL}models/`,
  self.location.origin,
).href;
const MODEL_URL = new URL(
  "isnet-general-use-onnx/onnx/model_quantized.onnx",
  LOCAL_MODEL_PATH,
).href;
const MODEL_INPUT_SIZE = 320;

// IS-Net returns a soft matte. The 320px mobile profile can be conservative on
// low-contrast white subjects, so make confident object regions opaque while
// retaining a narrow feathered edge.
const MATTE_BLACK_POINT = 0.08;
const MATTE_WHITE_POINT = 0.72;

let removerPromise: Promise<Awaited<ReturnType<typeof createRemover>>> | null = null;

function cleanMatteAlpha(value: number) {
  const normalized = Math.max(0, Math.min(1, value / 255));
  const clipped = Math.max(
    0,
    Math.min(
      1,
      (normalized - MATTE_BLACK_POINT) /
        (MATTE_WHITE_POINT - MATTE_BLACK_POINT),
    ),
  );
  // Smooth Hermite curve to ensure anti-aliased alpha boundary without stair-stepping
  return clipped * clipped * (3 - 2 * clipped);
}

function postProgress(id: number, phase: "loading" | "processing", progress?: number) {
  self.postMessage({ type: "progress", id, phase, progress });
}

async function createRemover(id: number) {
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  const session = await ort.InferenceSession.create(MODEL_URL, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
  postProgress(id, "loading", 100);

  return async (input: Blob) => {
    const bitmap = await createImageBitmap(input);
    try {
      const preparedCanvas = new OffscreenCanvas(
        MODEL_INPUT_SIZE,
        MODEL_INPUT_SIZE,
      );
      const preparedContext = preparedCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      if (!preparedContext) throw new Error("Image processing is unavailable");
      preparedContext.drawImage(
        bitmap,
        0,
        0,
        MODEL_INPUT_SIZE,
        MODEL_INPUT_SIZE,
      );
      const prepared = preparedContext.getImageData(
        0,
        0,
        MODEL_INPUT_SIZE,
        MODEL_INPUT_SIZE,
      ).data;

      const planeSize = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
      const normalized = new Float32Array(planeSize * 3);
      for (let pixel = 0; pixel < planeSize; pixel += 1) {
        for (let channel = 0; channel < 3; channel += 1) {
          normalized[channel * planeSize + pixel] =
            prepared[pixel * 4 + channel] / 255 - 0.5;
        }
      }

      const pixelValues = new ort.Tensor("float32", normalized, [
        1,
        3,
        MODEL_INPUT_SIZE,
        MODEL_INPUT_SIZE,
      ]);
      const prediction = await session.run({
        [session.inputNames[0]]: pixelValues,
      });
      const composite = prediction[session.outputNames[0]];
      if (!composite) throw new Error("The model returned no foreground mask");

      let minimum = Number.POSITIVE_INFINITY;
      let maximum = Number.NEGATIVE_INFINITY;
      for (const value of composite.data) {
        minimum = Math.min(minimum, Number(value));
        maximum = Math.max(maximum, Number(value));
      }
      const range = Math.max(maximum - minimum, 0.00001);
      const maskRgba = new Uint8ClampedArray(planeSize * 4);
      for (let index = 0; index < planeSize; index += 1) {
        const value = Math.round(
          ((Number(composite.data[index]) - minimum) / range) * 255,
        );
        const offset = index * 4;
        maskRgba[offset] = 255;
        maskRgba[offset + 1] = 255;
        maskRgba[offset + 2] = 255;
        maskRgba[offset + 3] = value;
      }

      const maskCanvas = new OffscreenCanvas(
        MODEL_INPUT_SIZE,
        MODEL_INPUT_SIZE,
      );
      const maskContext = maskCanvas.getContext("2d");
      if (!maskContext) throw new Error("Mask processing is unavailable");
      maskContext.putImageData(
        new ImageData(maskRgba, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE),
        0,
        0,
      );

      const outputCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const outputContext = outputCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      if (!outputContext) throw new Error("Image processing is unavailable");
      outputContext.drawImage(bitmap, 0, 0);
      const output = outputContext.getImageData(
        0,
        0,
        bitmap.width,
        bitmap.height,
      );

      const resizedMaskCanvas = new OffscreenCanvas(
        bitmap.width,
        bitmap.height,
      );
      const resizedMaskContext = resizedMaskCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      if (!resizedMaskContext) {
        throw new Error("Mask resizing is unavailable");
      }
      resizedMaskContext.imageSmoothingEnabled = true;
      resizedMaskContext.imageSmoothingQuality = "high";
      resizedMaskContext.drawImage(
        maskCanvas,
        0,
        0,
        bitmap.width,
        bitmap.height,
      );
      const resizedMask = resizedMaskContext.getImageData(
        0,
        0,
        bitmap.width,
        bitmap.height,
      ).data;

      for (let index = 0; index < bitmap.width * bitmap.height; index += 1) {
        const alphaOffset = index * 4 + 3;
        const cleanedAlpha = cleanMatteAlpha(resizedMask[alphaOffset]);
        const sourceAlpha = output.data[alphaOffset] / 255;
        output.data[alphaOffset] = Math.round(
          cleanedAlpha * sourceAlpha * 255,
        );
      }

      return {
        data: output.data,
        width: bitmap.width,
        height: bitmap.height,
      };
    } finally {
      bitmap.close();
    }
  };
}

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  try {
    postProgress(request.id, "loading", 0);
    removerPromise ??= createRemover(request.id);
    const remover = await removerPromise;
    postProgress(request.id, "processing");

    const input = new Blob([request.image], { type: request.mimeType });
    const output = await remover(input);
    const pixels = new Uint8ClampedArray(output.data);
    self.postMessage(
      {
        type: "result",
        id: request.id,
        pixels: pixels.buffer,
        width: output.width,
        height: output.height,
      },
      { transfer: [pixels.buffer] },
    );
  } catch (error) {
    removerPromise = null;
    self.postMessage({
      type: "error",
      id: request.id,
      message: error instanceof Error ? error.message : "Background removal failed",
    });
  }
});

export {};

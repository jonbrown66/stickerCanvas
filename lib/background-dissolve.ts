export type DissolveParticle = {
  x: number;
  y: number;
  red: number;
  green: number;
  blue: number;
  alpha: number;
  size: number;
  driftX: number;
  driftY: number;
  delay: number;
};

export type BackgroundDissolveTexture = {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  particles: DissolveParticle[];
};

const MAX_EFFECT_SIDE = 512;
const MAX_PARTICLES = 420;

function noiseAt(x: number, y: number, seed: number) {
  let value = Math.imul(x + 1, 374_761_393);
  value = Math.imul(value ^ Math.imul(y + 1, 668_265_263), 1_274_126_177);
  value ^= seed;
  value ^= value >>> 13;
  value = Math.imul(value, 1_274_126_177);
  return (value ^ (value >>> 16)) >>> 0;
}

async function decodeImage(blob: Blob) {
  if ("createImageBitmap" in globalThis) {
    const bitmap = await createImageBitmap(blob);
    return {
      image: bitmap as CanvasImageSource,
      close: () => bitmap.close(),
    };
  }

  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Dissolve source unavailable"));
    image.src = url;
  });
  return {
    image: image as CanvasImageSource,
    close: () => URL.revokeObjectURL(url),
  };
}

export async function createBackgroundDissolveTexture(
  source: Blob,
  subjectPixels: Uint8ClampedArray,
  subjectWidth: number,
  subjectHeight: number,
): Promise<BackgroundDissolveTexture> {
  const scale = Math.min(
    1,
    MAX_EFFECT_SIDE / Math.max(subjectWidth, subjectHeight),
  );
  const width = Math.max(1, Math.round(subjectWidth * scale));
  const height = Math.max(1, Math.round(subjectHeight * scale));
  const decoded = await decodeImage(source);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Dissolve canvas unavailable");
    context.drawImage(decoded.image, 0, 0, width, height);

    const sourceImage = context.getImageData(0, 0, width, height);
    const pixels = sourceImage.data;
    const order = new Uint8Array(width * height);
    const candidates: DissolveParticle[] = [];
    const seed = (subjectWidth * 31 + subjectHeight * 17) | 0;

    for (let y = 0; y < height; y += 1) {
      const sourceY = Math.min(
        subjectHeight - 1,
        Math.floor((y / height) * subjectHeight),
      );
      for (let x = 0; x < width; x += 1) {
        const sourceX = Math.min(
          subjectWidth - 1,
          Math.floor((x / width) * subjectWidth),
        );
        const index = y * width + x;
        const pixelIndex = index * 4;
        const subjectIndex = (sourceY * subjectWidth + sourceX) * 4;
        const subjectAlpha = subjectPixels[subjectIndex + 3] / 255;
        const backgroundAlpha = Math.round(
          pixels[pixelIndex + 3] * (1 - subjectAlpha),
        );
        pixels[pixelIndex + 3] = backgroundAlpha;

        const noise = noiseAt(x, y, seed);
        const sweep = (x / width) * 0.24 + (1 - y / height) * 0.12;
        order[index] = Math.round(
          Math.min(1, (noise & 255) / 255 * 0.64 + sweep) * 255,
        );

        if (
          backgroundAlpha > 44 &&
          (noise >>> 8) % 23 === 0 &&
          candidates.length < MAX_PARTICLES * 3
        ) {
          const centeredX = x / width - 0.5;
          const centeredY = y / height - 0.5;
          const directionLength =
            Math.hypot(centeredX, centeredY) || 1;
          const variation = ((noise >>> 16) & 255) / 255;
          candidates.push({
            x,
            y,
            red: pixels[pixelIndex],
            green: pixels[pixelIndex + 1],
            blue: pixels[pixelIndex + 2],
            alpha: backgroundAlpha / 255,
            size: 0.9 + variation * 1.8,
            driftX:
              (centeredX / directionLength) * (32 + variation * 44) +
              12 +
              (variation - 0.5) * 18,
            driftY:
              (centeredY / directionLength) * (24 + variation * 36) -
              10 +
              (0.5 - variation) * 16,
            delay: 0.06 + (order[index] / 255) * 0.48,
          });
        }
      }
    }

    canvas.width = 1;
    canvas.height = 1;

    const particleStep = Math.max(
      1,
      Math.ceil(candidates.length / MAX_PARTICLES),
    );
    return {
      width,
      height,
      pixels,
      particles: candidates.filter(
        (_, index) => index % particleStep === 0,
      ).slice(0, MAX_PARTICLES),
    };
  } finally {
    decoded.close();
  }
}

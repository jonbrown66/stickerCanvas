import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships a local and mobile-bounded background-removal path", async () => {
  const [packageJson, client, worker, canvas, notices, model, config, license] =
    await Promise.all([
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(new URL("../lib/background-removal.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../workers/background-removal.worker.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/SimpleStickerCanvas.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../public/models/isnet-general-use-onnx/onnx/model_quantized.onnx",
          import.meta.url,
        ),
      ),
      readFile(
        new URL(
          "../public/models/isnet-general-use-onnx/config.json",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../public/models/isnet-general-use-onnx/SOURCE.md",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);

  assert.match(packageJson, /"onnxruntime-web"/);
  assert.match(client, /maximumSide = 2048/);
  assert.match(client, /background-removal\.worker\.ts/);
  assert.match(worker, /model_quantized\.onnx/);
  assert.match(worker, /InferenceSession\.create/);
  assert.match(worker, /executionProviders:\s*\["wasm"\]/);
  assert.match(worker, /OffscreenCanvas/);
  assert.match(worker, /const MODEL_INPUT_SIZE = 320/);
  assert.match(worker, /cleanedAlpha \* sourceAlpha \* 255/);
  assert.match(canvas, /removeImageBackground/);
  assert.match(canvas, /createOutlinedCutout/);
  assert.match(notices, /IS-Net/);
  assert.match(notices, /Apache License 2\.0/);
  assert.equal(model.byteLength, 45_902_969);
  assert.equal(
    createHash("sha256").update(model).digest("hex"),
    "5039225b9a4ac3df55f185d24b7a92d640c86cc4747002d7f23351e394de03a6",
  );
  assert.equal(JSON.parse(config).model_type, "custom");
  assert.match(license, /Apache License/);
});

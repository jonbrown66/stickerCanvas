import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("decodes HEIC locally with a mobile-safe working size", async () => {
  const [packageJson, heic, canvas, notices] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../lib/heic.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/SimpleStickerCanvas.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8"),
  ]);

  assert.match(packageJson, /"heic-decode"/);
  assert.match(heic, /import\("heic-decode"\)/);
  assert.match(heic, /maximumSide = 2048/);
  assert.match(heic, /sourceCanvas\.width = 1/);
  assert.match(canvas, /isHeicFile\(file\)/);
  assert.match(canvas, /convertHeicToJpeg\(file\)/);
  assert.match(canvas, /accept="image\/\*,\.heic,\.heif"/);
  assert.match(notices, /heic-decode/);
  assert.match(notices, /ISC\s+License/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps canvas concerns split into focused modules", async () => {
  const [canvas, camera, item, storage, processing, styles, html] =
    await Promise.all([
      readFile(
        new URL("../app/SimpleStickerCanvas.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/CameraCapture.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/StickerCanvasItem.tsx", import.meta.url), "utf8"),
      readFile(new URL("../lib/sticker-storage.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../lib/sticker-image-processing.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../index.html", import.meta.url), "utf8"),
    ]);

  assert.match(canvas, /<CameraCapture/);
  assert.match(canvas, /<StickerCanvasItem/);
  assert.match(canvas, /saveStickerRecord\(sticker\)/);
  assert.match(canvas, /capture="environment"/);
  assert.match(camera, /getUserMedia/);
  assert.match(camera, /maximumSide = 2048/);
  assert.match(item, /memo\(StickerCanvasItemComponent\)/);
  assert.match(item, /onDownload=\{\(\) => onDownload\(sticker\)\}/);
  assert.match(item, /onCutout=\{onCutout \? \(\) => onCutout\(sticker\)/);
  assert.match(item, /transform: `translate3d\(/);
  assert.match(item, /holoFrameRef/);
  assert.match(item, /requestAnimationFrame\(tick\)/);
  assert.match(item, /const stiffness = 230/);
  assert.match(item, /const damping = 24/);
  assert.match(item, /--holo-rotate-x/);
  assert.match(item, /data-holo=\{Boolean\(sticker\.oilFilmEnabled\)\}/);
  assert.match(item, /className="simple-sticker-visual"/);
  assert.match(item, /--holo-pointer-x/);
  assert.match(item, /getBoundingClientRect\(\)/);
  assert.match(item, /dataset\.holoHover = "true"/);
  assert.match(item, /onPointerEnter=\{handleHoloPointerMove\}/);
  assert.doesNotMatch(item, /event\.target !== event\.currentTarget/);
  assert.match(item, /className="simple-sticker-holo-border"/);
  assert.match(item, /operator="out"/);
  assert.match(item, /className="simple-holo-border-glint"/);
  assert.match(storage, /indexedDB\.open/);
  assert.match(storage, /transactionDone/);
  assert.match(storage, /replaceStickerRecords/);
  assert.match(storage, /store\.clear\(\)/);
  assert.match(processing, /findAlphaBounds/);
  assert.match(processing, /fullCanvas\.width = 1/);
  assert.match(processing, /globalCompositeOperation = "source-in"/);
  assert.match(processing, /ensurePngBlob/);
  assert.doesNotMatch(processing, /shadowBlur/);
  assert.match(canvas, /restoreStickerSnapshot/);
  assert.match(canvas, /replaceStickerRecords/);
  assert.match(canvas, /processingRef\.current = true/);
  assert.match(canvas, /pointerSampleRef\.current = \{/);
  assert.match(canvas, /previewSticker\(gesture\.element, latest\)/);
  assert.match(canvas, /setNotice\("Cutout ready"\)/);
  assert.match(styles, /will-change: transform/);
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.simple-processing-spinner[\s\S]*?animation-iteration-count: infinite !important/,
  );
  assert.match(styles, /\.simple-sticker-canvas/);
  assert.match(styles, /\.simple-oil-spectrum[\s\S]*?mix-blend-mode: color/);
  assert.match(styles, /\.simple-oil-streak[\s\S]*?mix-blend-mode: screen/);
  assert.match(styles, /\.simple-sticker-holo-border/);
  assert.match(styles, /\.simple-oil-cursor-glow/);
  assert.match(styles, /data-holo-hover="true"/);
  assert.match(styles, /--holo-pointer-x: 50%/);
  assert.match(styles, /perspective\(920px\)/);
  assert.match(styles, /rotateX\(var\(--holo-rotate-x\)\)/);
  assert.match(styles, /translateZ\(10px\)/);
  assert.match(styles, /@keyframes oilCrystalTwinkle/);
  assert.doesNotMatch(styles, /mix-blend-mode: (?:color-dodge|hard-light)/);
  assert.doesNotMatch(styles, /\.gallery-|\.export-|\.controls-card/);
  assert.doesNotMatch(html, /vibeloft|DebugPanel|MobileDemoMode/);

  const importFlow = canvas.slice(
    canvas.indexOf("const processFile"),
    canvas.indexOf("const startStickerGesture"),
  );
  assert.doesNotMatch(importFlow, /removeImageBackground/);
  assert.match(importFlow, /isCutout: false/);
  assert.match(importFlow, /Photo added — use Cutout when ready/);
});

test("alpha-bound implementation rejects an empty mask and tracks visible edges", async () => {
  const source = await readFile(
    new URL("../lib/sticker-image-processing.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /return right < left \|\| bottom < top/);
  assert.match(source, /\{ left, top, right, bottom \}/);
  assert.match(source, /alphaThreshold = 10/);
});

test("export smooths and tightens the outline before restoring source alpha", async () => {
  const source = await readFile(
    new URL("../lib/sticker-image-processing.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /const scaledBlurRadius/);
  assert.match(source, /softenedContext\.filter = `blur\(/);
  assert.match(source, /\(outlinePixels\[p \+ 3\] \/ 255\) \* 24 - 11\.5/);
  assert.match(source, /oCtx\.putImageData\(outlineImage, 0, 0\)/);
  assert.match(source, /oCtx\.drawImage\(\s*img,/);
  assert.doesNotMatch(source, /if \(srcA > 0\.02\)/);
});

test("background dissolve uses a bounded Pixi shader and particle layer", async () => {
  const [canvas, effect, texture, packageJson] = await Promise.all([
    readFile(
      new URL("../app/SimpleStickerCanvas.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/BackgroundDissolveEffect.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../lib/background-dissolve.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(canvas, /createBackgroundDissolveTexture/);
  assert.match(canvas, /<BackgroundDissolveEffect/);
  assert.match(canvas, /\.catch\(\(\) => null\)/);
  assert.match(effect, /requestAnimationFrame\(render\)/);
  assert.match(effect, /prefers-reduced-motion: reduce/);
  assert.match(effect, /Filter\.from\(/);
  assert.match(effect, /new ParticleContainer\(/);
  assert.match(effect, /preference: "webgl"/);
  assert.match(effect, /data-renderer="pixi"/);
  assert.match(effect, /texture: true/);
  assert.match(effect, /context: true/);
  assert.match(effect, /data-background-dissolve/);
  assert.match(effect, /preloadBackgroundDissolveEffect/);
  assert.match(effect, /nextApp\.render\(\);\s+markReady\(\)/);
  assert.match(effect, /mix\(-0\.14, 1\.42, uProgress\)/);
  assert.match(
    effect,
    /requestAnimationFrame\(\(\) => \{\s+if \(!disposed\) finish\(\)/,
  );
  assert.doesNotMatch(effect, /setInterval|setState/);
  assert.match(canvas, /pendingCutoutRef/);
  assert.match(canvas, /onReady=\{commitPendingCutout\}/);
  assert.match(canvas, /await preloadImageUrl\(newUrl\)/);
  assert.match(
    canvas,
    /requestAnimationFrame\(\(\) => \{\s+window\.requestAnimationFrame/,
  );
  assert.match(texture, /const MAX_EFFECT_SIDE = 512/);
  assert.match(texture, /const MAX_PARTICLES = 420/);
  assert.match(texture, /candidates\.length < MAX_PARTICLES \* 3/);
  assert.match(
    texture,
    /pixels\[pixelIndex \+ 3\] = backgroundAlpha/,
  );
  assert.match(packageJson, /"pixi\.js": "\^8\.19\.0"/);
});

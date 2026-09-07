import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

async function readSource(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

async function loadHistoryModule() {
  const source = await readSource("../lib/canvas-history.ts");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
  );
}

async function loadCanvasExportModule() {
  return loadTypeScript("lib/canvas-export.ts");
}

test("canvas element types support text styling and five shape kinds without notes", async () => {
  const source = await readSource("../lib/canvas-types.ts");

  assert.match(source, /export type CanvasElementRecord\s*=[\s\S]*?\| StickerRecord[\s\S]*?\| CanvasTextElement[\s\S]*?\| CanvasShapeElement/);
  assert.match(source, /export type CanvasElement\s*=[\s\S]*?\| CanvasSticker[\s\S]*?\| CanvasTextElement[\s\S]*?\| CanvasShapeElement/);
  assert.doesNotMatch(source, /CanvasNoteElement/);
  for (const property of [
    "textOutlineColor",
    "textOutlineWidth",
    "holoEnabled",
    "backgroundColor",
    "borderColor",
    "borderWidth",
    "borderRadius",
  ]) {
    assert.match(source, new RegExp(`${property}: (string|number|boolean)`));
  }
  for (const shape of ["rectangle", "ellipse", "triangle", "diamond", "line"]) {
    assert.match(source, new RegExp(`"${shape}"`));
  }
  assert.match(source, /fillEnabled: boolean/);
  assert.match(source, /export type CanvasImageCrop/);
  assert.match(source, /crop\?: CanvasImageCrop/);
  for (const property of [
    "cornerRadius",
    "cornerRadiusEnabled",
    "shadowEnabled",
    "shadowBlur",
    "opacity",
  ]) {
    assert.match(source, new RegExp(`${property}\\?: (string|number|boolean)`));
  }
});

test("storage version 4 keeps legacy migration and adds canvas history storage", async () => {
  const source = await readSource("../lib/sticker-storage.ts");

  assert.match(source, /const DATABASE_VERSION = 4/);
  assert.match(source, /const ELEMENT_STORE = "elements"/);
  assert.match(source, /const CANVAS_PROJECT_STORE = "canvas-projects"/);
  assert.match(source, /const LEGACY_STICKER_STORE = "stickers"/);
  assert.match(source, /if \(raw\.type === "note"\)/);
  assert.match(source, /type: "text"/);
  assert.match(source, /raw\.textOutlineColor/);
  assert.match(source, /raw\.textOutlineWidth/);
  assert.match(source, /raw\.holoEnabled/);
  assert.match(source, /raw\.cornerRadius/);
  assert.match(source, /raw\.cornerRadiusEnabled/);
  assert.match(source, /raw\.shadowEnabled/);
  assert.match(source, /raw\.shadowBlur/);
  assert.match(source, /normalizeCanvasImageCrop\(raw\.crop\)/);
  assert.match(source, /raw\.opacity/);
  assert.match(source, /elementCursorRequest\.onsuccess/);
  assert.match(source, /cursor\.update\(normalizeRecord\(cursor\.value\)\)/);
  assert.match(source, /legacyStore\.openCursor\(\)/);
  assert.match(source, /elementStore\.put\(normalizeRecord\(cursor\.value\)\)/);
  assert.match(source, /cursor\.continue\(\)/);
});

test("canvas creates text on click, commits blurred editing, and draws shapes with a transparent fill default", async () => {
  const source = await readSource("../app/SimpleStickerCanvas.tsx");

  assert.match(source, /import \{ CanvasBottomToolbar \} from "\.\/CanvasBottomToolbar"/);
  assert.match(source, /import \{ CanvasElementItem \} from "\.\/CanvasElementItem"/);
  assert.doesNotMatch(source, /CanvasPropertiesToolbar/);
  assert.match(source, /const \[activeTool, setActiveTool\] = useState<CanvasTool>\("select"\)/);
  assert.match(source, /const createTextElement = useCallback\(/);
  assert.match(source, /activeTool === "text"[\s\S]*?createTextElement\(event\.clientX, event\.clientY\)/);
  assert.match(source, /const startShapeDrawing = useCallback\(/);
  assert.match(source, /const moveShapeDrawing = useCallback\(/);
  assert.match(source, /const finishShapeDrawing = useCallback\(/);
  assert.match(source, /isShapeTool\(activeTool\)[\s\S]*?startShapeDrawing\(event, activeTool\)/);
  assert.match(source, /fillEnabled: false/);
  assert.match(source, /textOutlineColor: "#ffffff"/);
  assert.match(source, /textOutlineWidth: 6 \/ currentView\.zoom/);
  assert.match(source, /holoEnabled: false/);
  assert.match(source, /data-active-tool=\{activeTool\}/);
  assert.match(source, /<CanvasBottomToolbar[\s\S]*?activeTool=\{activeTool\}/);
  assert.match(source, /<CanvasBottomToolbar[\s\S]*?placement="top"/);
  assert.match(source, /<CanvasElementItem[\s\S]*?element=\{sticker\}/);
  assert.match(source, /editingId[\s\S]*?closest\("textarea\[aria-label='Edit text'\]"\)/);
  assert.match(source, /document\.activeElement[\s\S]*?activeElement\.blur\(\)/);
});

test("element item commits blurred text and renders normalized SVG shapes", async () => {
  const source = await readSource("../app/CanvasElementItem.tsx");

  assert.match(source, /<textarea/);
  assert.match(source, /event\.key === "Enter" && \(event\.ctrlKey \|\| event\.metaKey\)/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /onBlur=\{\(event\) => commitText\(event\.currentTarget\.value\)\}/);
  assert.match(source, /selected && !editing && !drawing \? \(/);
  assert.doesNotMatch(source, /CanvasPropertiesToolbar/);
  assert.match(source, /opacity: element\.opacity \?\? 1/);
  assert.match(source, /<svg/);
  assert.match(source, /viewBox="0 0 100 100"/);
  assert.match(source, /element\.shape === "rectangle"/);
  assert.match(source, /element\.shape === "ellipse"/);
  assert.match(source, /element\.shape === "triangle"/);
  assert.match(source, /element\.shape === "diamond"/);
  assert.match(source, /<rect/);
  assert.match(source, /<ellipse/);
  assert.match(source, /<polygon/);
  assert.match(source, /<line/);
  for (const value of ["x={1}", "width={98}", "cx={50}", "points=\"50,1 99,99 1,99\"", "x2={99}"]) {
    assert.match(source, new RegExp(value.replace(/[{}]/g, "\\$&")));
  }
  assert.match(source, /element\.fillEnabled \? element\.fillColor : "none"/);
  assert.match(source, /WebkitTextStroke/);
  assert.match(source, /paintOrder: "stroke fill"/);
  assert.match(source, /canvas-text-holo/);
  assert.match(source, /--text-holo-rotate-x/);
  assert.match(source, /--text-holo-rotate-y/);
  assert.match(source, /className="canvas-text-surface"/);
  assert.match(source, /onPointerMove=\{handleHoloPointerMove\}/);
  assert.match(source, /className="canvas-text-content"[\s\S]*?\.\.\.textContentStyle/);
  assert.match(source, /data-canvas-element/);
});

test("bottom toolbar exposes icon-only primary entries and five icon-only shape choices", async () => {
  const source = await readSource("../app/CanvasBottomToolbar.tsx");
  const styles = await readSource("../app/globals.css");

  for (const label of ["Upload image", "Camera", "Text", "Shapes"]) {
    assert.match(source, new RegExp(`aria-label="${label}"`));
  }
  assert.doesNotMatch(source, /aria-label="Note"/);
  assert.match(source, /shapeMenuOpen \? \(/);
  for (const shape of ["rectangle", "ellipse", "triangle", "diamond", "line"]) {
    assert.match(source, new RegExp(`selectShape\\("${shape}"\\)`));
  }
  assert.match(source, /id="canvas-shape-menu"/);
  assert.match(source, /id="canvas-shape-menu"[\s\S]*?role="menu"/);
  assert.match(source, /<Icon name="image" \/>[\s\S]*?<span>Upload image<\/span>/);
  assert.match(source, /<Icon name="shapes" \/>[\s\S]*?<span>Shapes<\/span>/);
  assert.match(source, /aria-haspopup="dialog"/);
  assert.match(source, /aria-controls="canvas-background-menu"/);
  assert.match(source, /className="simple-toolbar-divider" aria-hidden="true"/);
  assert.doesNotMatch(source, /Download canvas/);
  assert.match(styles, /\.simple-floating-actions > button > span,\s*\.simple-shape-menu button > span[\s\S]*?clip: rect\(0, 0, 0, 0\)/);
  assert.match(styles, /\.canvas-background-menu\s*\{[\s\S]*?background:var\(--paper-raised, #fdfaf4\)/);
  assert.match(styles, /\.canvas-bg-colors-row > \.canvas-style-color\s*\{[\s\S]*?conic-gradient/);
});

test("selected elements share an Excalidraw-style icon palette", async () => {
  const source = await readSource("../app/CanvasInspector.tsx");
  const styles = await readSource("../app/globals.css");

  assert.match(source, /className="canvas-properties-panel"/);
  assert.match(source, /const \[activeFlyout, setActiveFlyout\] = useState<PanelFlyout>\(null\)/);
  for (const label of ["Font size", "Bold", "Duplicate", "Delete"]) {
    assert.match(source, new RegExp(`aria-label="${label}"|label="${label}"`));
  }
  assert.match(source, /label=\{`Text alignment: /);
  assert.match(source, /activeFlyout === "font-size"/);
  assert.match(source, /activeFlyout === "border-width"/);
  for (const label of [
    "Text color",
    "Text outline color",
    "Text outline width",
    "Border color",
    "Border width",
  ]) {
    assert.match(source, new RegExp(`aria-label="${label}"|title="${label}"|label="${label}"`));
  }
  assert.match(source, /Enable Holo/);
  assert.match(source, /Background color/);
  assert.match(source, /Fill color/);
  assert.match(source, /backgroundColor/);
  assert.match(source, /borderColor/);
  assert.match(source, /borderWidth/);
  assert.match(source, /textOutlineColor/);
  assert.match(source, /textOutlineWidth/);
  assert.match(source, /canvas-properties-section/);
  assert.match(source, /<details className="canvas-properties-advanced">[\s\S]*?<summary>More actions<\/summary>/);
  assert.match(source, /max=\{48\}/);
  assert.match(styles, /\.canvas-properties-panel[\s\S]*?width: min\(272px/);
  assert.match(styles, /\.canvas-properties-icon-button[\s\S]*?width: 40px/);
  assert.match(source, /fillEnabled/);
  assert.match(source, /fillColor/);
  assert.match(source, /strokeColor/);
  assert.match(source, /strokeWidth/);
});

test("history snapshots and restores text and every shape without Blob URLs", async () => {
  const history = await loadHistoryModule();
  const elements = [
    {
      id: "text-1", type: "text", text: "Hello", fontSize: 24,
      fontWeight: 600, color: "#111", backgroundColor: "transparent",
      borderColor: "#111", borderWidth: 0, borderRadius: 8, textAlign: "left",
      x: 1, y: 2, width: 200, height: 60, rotation: 0, zIndex: 1, createdAt: 1,
    },
    ...["rectangle", "ellipse", "triangle", "diamond", "line"].map((shape, index) => ({
      id: `shape-${shape}`, type: "shape", shape, fillColor: "#fff",
      fillEnabled: index % 2 === 0, strokeColor: "#000", strokeWidth: 2,
      x: index + 3, y: index + 4, width: 120, height: 80,
      rotation: index * 10, zIndex: index + 2, createdAt: index + 2,
    })),
  ];
  const originalCreateObjectURL = URL.createObjectURL;
  let createdUrls = 0;
  URL.createObjectURL = () => {
    createdUrls += 1;
    return "blob:unexpected";
  };

  try {
    const snapshot = history.snapshotCanvasElements(elements);
    const restored = history.restoreCanvasSnapshot(snapshot, elements);

    assert.deepEqual(snapshot, elements);
    assert.deepEqual(restored.elements, elements);
    assert.notEqual(snapshot[0], elements[0]);
    assert.notEqual(restored.elements[1], snapshot[1]);
    assert.deepEqual(restored.revokedUrls, []);
    assert.equal(createdUrls, 0);
  } finally {
    URL.createObjectURL = originalCreateObjectURL;
  }
});

test("canvas PNG export keeps the paper dot grid, rotated content margin, and z-order", async () => {
  const source = await readSource("../lib/canvas-export.ts");
  const canvasExport = await loadCanvasExportModule();

  assert.match(source, /const PAPER_COLOR = "#f6f1e7"/);
  assert.match(source, /const GRID_SIZE = 28/);
  assert.match(source, /const CONTENT_MARGIN = 52/);
  assert.match(source, /const MAX_EXPORT_EDGE = 4096/);
  assert.match(source, /const MAX_EXPORT_PIXELS = 16_000_000/);
  assert.match(source, /drawPaperBackground\(context, bounds, scale\)/);
  assert.match(source, /context\.fillStyle = PAPER_COLOR[\s\S]*?context\.fillRect\(0, 0, width, height\)/);
  assert.match(source, /for \(let x = firstX; x <= bounds\.right; x \+= GRID_SIZE\)[\s\S]*?context\.arc\(/);

  const rotatedShape = {
    id: "rotated-shape", type: "shape", shape: "rectangle", fillColor: "#fff",
    fillEnabled: true, strokeColor: "#111", strokeWidth: 4,
    x: 100, y: 200, width: 80, height: 40, rotation: 90, zIndex: 2, createdAt: 1,
  };
  const bounds = canvasExport.getCanvasExportBounds([rotatedShape]);
  assert.deepEqual(bounds, { left: 24, top: 104, right: 176, bottom: 296 });
  assert.throws(() => canvasExport.getCanvasExportBounds([]), /Canvas is empty/);

  const calls = [];
  const context = {
    beginPath() { calls.push(["beginPath"]); },
    arc(...args) { calls.push(["arc", ...args]); },
    fill() { calls.push(["fill"]); },
    fillRect(...args) { calls.push(["fillRect", ...args]); },
    save() { calls.push(["save"]); },
    restore() { calls.push(["restore"]); },
    translate(x, y) { calls.push(["translate", x, y]); },
    rotate(value) { calls.push(["rotate", value]); },
    rect() {}, ellipse() {}, moveTo() {}, lineTo() {}, closePath() {}, stroke() {},
    set fillStyle(value) { calls.push(["fillStyle", value]); },
    set strokeStyle(value) { calls.push(["strokeStyle", value]); },
    set lineWidth(value) { calls.push(["lineWidth", value]); },
    set lineCap(value) { calls.push(["lineCap", value]); },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob(callback, type) { calls.push(["toBlob", type]); callback(new Blob(["png"])); },
  };
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => canvas };
  const back = { ...rotatedShape, id: "back", x: 20, y: 20, rotation: 0, zIndex: 1 };
  const front = { ...rotatedShape, id: "front", x: 300, y: 20, rotation: 0, zIndex: 3 };
  try {
    const exported = await canvasExport.exportCanvasToPng([front, back]);
    const translates = calls.filter(([name]) => name === "translate");
    assert.equal(calls.some(([name, value]) => name === "fillStyle" && value === "#f6f1e7"), true);
    assert.equal(calls.some(([name]) => name === "arc"), true);
    assert.deepEqual(translates.slice(0, 4), [
      ["translate", 192, 152], ["translate", -80, -40],
      ["translate", 752, 152], ["translate", -80, -40],
    ]);
    assert.equal(calls.some(([name, type]) => name === "toBlob" && type === "image/png"), true);
    assert.equal(exported.blob.type, "");
    assert.equal(exported.width > 0 && exported.height > 0 && exported.scale > 0, true);
  } finally {
    globalThis.document = originalDocument;
  }
});

test("text sticker outlines are included in preview fields and PNG export", async () => {
  const [types, storage, item, inspector, styles, exportSource, canvasExport] =
    await Promise.all([
      readSource("../lib/canvas-types.ts"),
      readSource("../lib/sticker-storage.ts"),
      readSource("../app/CanvasElementItem.tsx"),
      readSource("../app/CanvasInspector.tsx"),
      readSource("../app/globals.css"),
      readSource("../lib/canvas-export.ts"),
      loadCanvasExportModule(),
    ]);

  assert.match(types, /textOutlineColor: string/);
  assert.match(types, /textOutlineWidth: number/);
  assert.match(types, /holoEnabled: boolean/);
  assert.match(storage, /raw\.textOutlineColor/);
  assert.match(storage, /raw\.textOutlineWidth/);
  assert.match(storage, /raw\.holoEnabled/);
  assert.match(item, /WebkitTextStroke: `\$\{textOutlineStrokeWidth\}px/);
  assert.match(item, /WebkitTextStroke: `\$\{textOutlineStrokeWidth\}px transparent`/);
  assert.match(item, /textOutlineEdgeBlur/);
  assert.match(item, /overflow: "visible"/);
  assert.match(item, /textShadow:/);
  assert.match(item, /opacity: element\.opacity \?\? 1/);
  assert.match(inspector, /aria-label="Text outline width"|label="Text outline width"/);
  assert.match(inspector, /Enable Holo/);
  assert.match(styles, /\.canvas-text-outline\s*\{\s*filter: none/);
  assert.match(styles, /text-rendering: geometricPrecision/);
  assert.match(styles, /-webkit-font-smoothing: antialiased/);
  assert.doesNotMatch(styles, /\.canvas-text-outline\s*\{\s*filter: blur/);
  assert.doesNotMatch(styles, /\.canvas-text-holo\s*\{[^}]*filter: blur/);
  assert.match(exportSource, /context\.strokeText\(wrapped, drawX/);
  assert.match(exportSource, /element\.textOutlineWidth \* scale/);
  assert.match(exportSource, /context\.lineJoin = "round"/);
  assert.match(exportSource, /context\.lineCap = "round"/);
  assert.match(exportSource, /context\.shadowBlur = Math\.max/);
  assert.match(exportSource, /context\.globalAlpha = Math\.min/);

  const calls = [];
  const context = {
    beginPath() {},
    arc() {},
    fill() {},
    fillRect() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    measureText(value) { return { width: value.length * 10 }; },
    createLinearGradient() {
      const stops = [];
      return {
        stops,
        addColorStop(offset, color) { stops.push([offset, color]); },
      };
    },
    fillText(...args) { calls.push(["fillText", ...args]); },
    strokeText(...args) { calls.push(["strokeText", ...args]); },
    set fillStyle(value) { calls.push(["fillStyle", value]); },
    set strokeStyle(value) { calls.push(["strokeStyle", value]); },
    set lineWidth(value) { calls.push(["lineWidth", value]); },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob(callback, type) {
      calls.push(["toBlob", type]);
      callback(new Blob(["png"]));
    },
  };
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => canvas };
  try {
    await canvasExport.exportCanvasToPng([
      {
        id: "text-outline",
        type: "text",
        text: "Hi",
        fontSize: 24,
        fontWeight: 600,
        color: "#29251f",
        textOutlineColor: "#ffffff",
        textOutlineWidth: 6,
        holoEnabled: true,
        backgroundColor: "transparent",
        borderColor: "#2d2923",
        borderWidth: 0,
        borderRadius: 8,
        textAlign: "left",
        x: 100,
        y: 100,
        width: 120,
        height: 60,
        rotation: 0,
        zIndex: 1,
        createdAt: 1,
      },
    ]);
    assert.equal(calls.some(([name]) => name === "strokeText"), true);
    assert.equal(
      calls.some(([name, value]) => name === "strokeStyle" && value === "#ffffff"),
      true,
    );
    assert.equal(
      calls.some(([name, value]) => name === "lineWidth" && value === 12),
      true,
    );
    assert.equal(
      calls.some(
        ([name, value]) =>
          name === "strokeStyle" && value && value.stops?.length === 6,
      ),
      true,
    );
    assert.equal(calls.some(([name]) => name === "fillText"), true);
  } finally {
    globalThis.document = originalDocument;
  }
});

test("canvas actions keep download independent from the editing toolbar", async () => {
  const canvas = await readSource("../app/SimpleStickerCanvas.tsx");
  const toolbar = await readSource("../app/CanvasBottomToolbar.tsx");
  const topbar = await readSource("../app/CanvasTopBar.tsx");
  const inspector = await readSource("../app/CanvasInspector.tsx");
  const zoom = await readSource("../app/CanvasZoomControls.tsx");
  const styles = await readSource("../app/globals.css");

  assert.match(canvas, /import \{ exportCanvasToPng \} from "@\/lib\/canvas-export"/);
  assert.match(canvas, /const \[isExporting, setIsExporting\] = useState\(false\)/);
  assert.match(canvas, /const exportCanvas = useCallback\(async \(\) => \{[\s\S]*?setIsExporting\(true\)[\s\S]*?await exportCanvasToPng\(stickersRef\.current\)[\s\S]*?finally \{[\s\S]*?setIsExporting\(false\)/);
  assert.match(canvas, /const downloadCanvas = useCallback\(\(\) => \{[\s\S]*?activeElement\.blur\(\)[\s\S]*?exportCanvas\(\)/);
  assert.match(canvas, /const canvasUiDisabled =/);
  assert.match(canvas, /<CanvasTopBar[\s\S]*?disabled=\{canvasUiDisabled\}/);
  assert.match(canvas, /<CanvasInspector[\s\S]*?element=\{selectedProperties\}/);
  assert.match(canvas, /<CanvasZoomControls[\s\S]*?onFitToContent=\{fitCanvasToContent\}/);
  assert.match(canvas, /isCreatingCanvas[\s\S]*?"Creating canvas…"/);
  assert.match(canvas, /switchCanvasProject\(archivedProject, nextProject\)/);
  assert.match(canvas, /openCanvasProject/);
  assert.match(canvas, /aria-label="Canvas history"/);
  assert.match(canvas, /className="simple-empty-state simple-empty-hint"/);
  assert.match(canvas, /Start Creating/);
  assert.match(canvas, /simple-canvas-history-backdrop[\s\S]*?setHistoryOpen\(false\)/);
  assert.match(canvas, /switchCanvasProject\(archivedProject, openedProject\)/);
  assert.doesNotMatch(toolbar, /onDownloadCanvas|Download canvas/);
  assert.match(topbar, /aria-label="Undo"/);
  assert.match(topbar, /aria-label="Redo"/);
  assert.match(topbar, /<Icon name="menu" \/>/);
  assert.doesNotMatch(topbar, /simple-canvas-title-block|simple-canvas-topbar-status/);
  assert.match(inspector, /onStyleChange/);
  assert.match(inspector, /onToggleCutout/);
  assert.match(inspector, /icon="scissors"/);
  assert.match(inspector, /icon="eraser"/);
  assert.equal((inspector.match(/icon="eraser"/g) ?? []).length, 1);
  assert.match(inspector, /onToggleCrop/);
  assert.doesNotMatch(inspector, /Image size|image-size|onTransformChange/);
  assert.match(inspector, /className="canvas-properties-panel"/);
  assert.match(inspector, /data-element-type=\{element\.type\}/);
  for (const heading of ["Corners", "Opacity", "Layers", "Actions"]) {
    assert.match(inspector, new RegExp(`>${heading}<`));
  }
  assert.match(inspector, /canvas-properties-icon-button/);
  assert.match(inspector, /aria-label="Opacity"/);
  assert.match(inspector, /"--range-progress"/);
  assert.match(inspector, /icon="corners-square"/);
  assert.match(inspector, /cornerRadiusEnabled/);
  assert.match(inspector, /shadowEnabled/);
  assert.match(inspector, /cornerRadius/);
  assert.match(inspector, /shadowBlur/);
  assert.doesNotMatch(inspector, /aspectLocked|Image rotation|canvas-inspector-lock|canvas-inspector-rotation/);
  assert.doesNotMatch(inspector, /className="[^"]*canvas-inspector[^"]*"/);
  assert.doesNotMatch(inspector, /canvas-image-properties-toolbar|canvas-element-properties-toolbar/);
  assert.match(zoom, /aria-label="Zoom out"/);
  assert.match(zoom, /aria-label="Zoom in"/);
  assert.match(styles, /\.simple-canvas-topbar/);
  assert.match(styles, /\.simple-canvas-menu\s*\{[\s\S]*?position: absolute/);
  assert.match(styles, /\.simple-canvas-menu\s*\{[\s\S]*?grid-template-columns: repeat\(3, 42px\)/);
  assert.match(styles, /\.simple-canvas-menu\s*\{[\s\S]*?top: calc\(100% \+ 10px\)/);
  assert.match(styles, /\.simple-canvas-menu button\s*\{[\s\S]*?border: 0/);
  assert.match(styles, /\.simple-left-toolbar/);
  assert.match(styles, /\.simple-canvas-zoom-controls/);
  assert.match(styles, /--sticker-radius: 16px/);
  assert.match(styles, /\.simple-sticker-visual[\s\S]*?border-radius: var\(--sticker-radius\)/);
  assert.match(styles, /\.simple-sticker-visual\s*\{[\s\S]*?overflow: visible/);
  assert.match(styles, /\.simple-sticker\[data-cropped="true"\][\s\S]*?overflow: hidden/);
  assert.match(styles, /\.canvas-properties-panel\s*\{[\s\S]*?width: min\(272px/);
  assert.match(styles, /\.canvas-properties-icon-button[\s\S]*?border-radius: 9px/);
  assert.match(styles, /\.canvas-properties-icon-button\[data-active="true"\][\s\S]*?background: var\(--accent\)/);
  assert.match(styles, /\.canvas-style-color\s*\{[\s\S]*?display: grid/);
  assert.match(styles, /\.canvas-style-color input\[type="color"\][\s\S]*?opacity: 0/);
  assert.match(styles, /\.canvas-style-color-dot\s*\{[\s\S]*?border-radius: 50%/);
  assert.match(styles, /var\(--range-progress, 0%\)/);
  assert.match(styles, /::-moz-range-progress/);
  assert.match(styles, /\.simple-sticker-crop-handle/);
  assert.match(styles, /\.simple-floating-actions > button\s*\{[\s\S]*?border-radius: 9px/);
  assert.match(styles, /\.simple-shape-menu button\s*\{[\s\S]*?border-radius: 9px/);
  assert.match(styles, /\.simple-left-toolbar \.simple-shape-menu\s*\{[\s\S]*?grid-template-columns: repeat\(5, 42px\)/);
  assert.match(styles, /\.simple-left-toolbar \.simple-shape-menu\s*\{[\s\S]*?top:calc\(100% \+ 40px\)[\s\S]*?bottom:auto/);
  assert.match(styles, /\.simple-canvas-history[\s\S]*?top: max\(66px/);
  assert.match(styles, /\/\* Keep the popover above its full-screen dismiss target \(z-index: 34\)\. \*\/[\s\S]*?z-index: 35/);
  assert.match(styles, /\.simple-canvas-history-backdrop[\s\S]*?inset: 0/);
  assert.match(styles, /\.simple-canvas-toolbar\[data-placement="top"\]/);
  assert.match(styles, /\.simple-toolbar-divider\s*\{[\s\S]*?background: var\(--ui-border\)/);
  assert.match(styles, /\.canvas-properties-advanced\s*>\s*summary[\s\S]*?list-style: none/);
  assert.match(styles, /\.canvas-properties-advanced\s*>\s*summary::after[\s\S]*?border-right: 1\.5px solid currentColor/);
  assert.doesNotMatch(styles, /\.canvas-properties-advanced\s*>\s*summary::after[\s\S]*?content: "⌄"/);
  assert.match(styles, /@keyframes canvas-properties-advanced-enter/);
  assert.match(styles, /\.simple-empty-state\s*\{[\s\S]*?pointer-events: none/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.simple-canvas-toolbar\[data-placement="top"\][\s\S]*?bottom: max\(12px/);
  assert.match(styles, /\.simple-floating-actions,[\s\S]*?background: var\(--ui-surface\)/);
  assert.match(styles, /\.simple-canvas-menu,[\s\S]*?backdrop-filter: none/);
});

test("canvas chrome adapts to compact, short, and landscape viewports", async () => {
  const canvas = await readSource("../app/SimpleStickerCanvas.tsx");
  const styles = await readSource("../app/globals.css");

  assert.match(canvas, /const isCompactViewport = viewport\.width <= 760/);
  assert.match(canvas, /const isLandscapeCompactViewport =/);
  assert.match(canvas, /hasPropertiesPanel/);
  assert.match(styles, /html,[\s\S]*?body[\s\S]*?height: 100%/);
  assert.match(styles, /#root[\s\S]*?height: 100%/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /@media \(max-width: 420px\)/);
  assert.match(styles, /@media \(min-width: 761px\) and \(max-height: 620px\)/);
  assert.match(styles, /@media \(max-width: 760px\) and \(orientation: landscape\)/);
  assert.match(canvas, /data-inspector-open=\{Boolean\(selectedProperties\)\}/);
  assert.match(styles, /data-inspector-open="true"/);
  assert.match(styles, /\.canvas-properties-panel/);
  assert.match(styles, /font-size: 16px/);
  assert.match(styles, /overscroll-behavior: contain/);
  assert.match(styles, /\.sticker-vertical-toolbar\[data-placement="top"\]/);
  assert.match(styles, /\.sticker-vertical-toolbar\[data-placement="bottom"\]/);
  assert.match(styles, /sticker-toolbar-horizontal-enter/);
});

test("canvas chrome uses a converged surface and active-state system", async () => {
  const styles = await readSource("../app/globals.css");

  assert.match(styles, /--ui-surface-subtle:/);
  assert.match(styles, /--ui-shadow-float:/);
  assert.match(styles, /\.simple-canvas-toolbar\s*>\s*button\[data-active="true"\][\s\S]*?background: var\(--ui-accent-soft\)/);
  assert.match(styles, /\.canvas-properties-icon-button\s*\{[\s\S]*?border: 1px solid var\(--ui-border\)/);
  assert.match(styles, /\.canvas-bg-style-item\s*\{[\s\S]*?background: var\(--ui-surface-subtle\)/);
  assert.match(styles, /\.sticker-vtoolbar-flyout\s*\{[\s\S]*?border-radius: var\(--radius-popover\)/);
});

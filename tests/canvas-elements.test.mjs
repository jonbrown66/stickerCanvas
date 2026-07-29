import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

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
  const [source, oilFilmSource] = await Promise.all([
    readSource("../lib/canvas-export.ts"),
    readSource("../lib/oil-film-render.ts"),
  ]);
  const compilerOptions = {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  };
  const oilFilmOutput = ts.transpileModule(oilFilmSource, {
    compilerOptions,
  }).outputText;
  const oilFilmUrl = `data:text/javascript;base64,${Buffer.from(oilFilmOutput).toString("base64")}`;
  const output = ts.transpileModule(
    source.replace('from "./oil-film-render"', `from "${oilFilmUrl}"`),
    {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    },
  ).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
  );
}

test("canvas element types support text styling and five shape kinds without notes", async () => {
  const source = await readSource("../lib/canvas-types.ts");

  assert.match(source, /export type CanvasElementRecord\s*=[\s\S]*?\| StickerRecord[\s\S]*?\| CanvasTextElement[\s\S]*?\| CanvasShapeElement/);
  assert.match(source, /export type CanvasElement\s*=[\s\S]*?\| CanvasSticker[\s\S]*?\| CanvasTextElement[\s\S]*?\| CanvasShapeElement/);
  assert.doesNotMatch(source, /CanvasNoteElement/);
  for (const property of ["backgroundColor", "borderColor", "borderWidth", "borderRadius"]) {
    assert.match(source, new RegExp(`${property}: (string|number)`));
  }
  for (const shape of ["rectangle", "ellipse", "triangle", "diamond", "line"]) {
    assert.match(source, new RegExp(`"${shape}"`));
  }
  assert.match(source, /fillEnabled: boolean/);
});

test("storage version 4 keeps legacy migration and adds canvas history storage", async () => {
  const source = await readSource("../lib/sticker-storage.ts");

  assert.match(source, /const DATABASE_VERSION = 4/);
  assert.match(source, /const ELEMENT_STORE = "elements"/);
  assert.match(source, /const CANVAS_PROJECT_STORE = "canvas-projects"/);
  assert.match(source, /const LEGACY_STICKER_STORE = "stickers"/);
  assert.match(source, /if \(raw\.type === "note"\)/);
  assert.match(source, /type: "text"/);
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
  assert.match(source, /data-active-tool=\{activeTool\}/);
  assert.match(source, /<CanvasBottomToolbar[\s\S]*?activeTool=\{activeTool\}/);
  assert.match(source, /<CanvasElementItem[\s\S]*?element=\{sticker\}/);
  assert.match(source, /editingId[\s\S]*?closest\("textarea\[aria-label='Edit text'\]"\)/);
  assert.match(source, /document\.activeElement[\s\S]*?activeElement\.blur\(\)/);
});

test("element item commits blurred text, owns the contextual toolbar, and renders normalized SVG shapes", async () => {
  const source = await readSource("../app/CanvasElementItem.tsx");

  assert.match(source, /<textarea/);
  assert.match(source, /event\.key === "Enter" && \(event\.ctrlKey \|\| event\.metaKey\)/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /onBlur=\{\(event\) => commitText\(event\.currentTarget\.value\)\}/);
  assert.match(source, /const \[toolbarPlacement, setToolbarPlacement\] = useState<"left" \| "right">/);
  assert.match(source, /window\.innerWidth - rect\.right < 210 \? "left" : "right"/);
  assert.match(source, /selected && !editing && !drawing \? \(/);
  assert.match(source, /<CanvasPropertiesToolbar[\s\S]*?placement=\{toolbarPlacement\}/);
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
  assert.match(source, /data-canvas-element/);
});

test("bottom toolbar exposes icon-only primary entries and five icon-only shape choices", async () => {
  const source = await readSource("../app/CanvasBottomToolbar.tsx");
  const styles = await readSource("../app/globals.css");

  for (const label of ["Upload", "Camera", "Text", "Shape"]) {
    assert.match(source, new RegExp(`aria-label="${label}"`));
  }
  assert.doesNotMatch(source, /aria-label="Note"/);
  assert.match(source, /shapeMenuOpen \? \(/);
  for (const shape of ["rectangle", "ellipse", "triangle", "diamond", "line"]) {
    assert.match(source, new RegExp(`onSelectTool\\("${shape}"\\)`));
  }
  assert.match(source, /id="canvas-shape-menu"/);
  assert.match(source, /<Icon name="image" \/>[\s\S]*?<span>Upload<\/span>/);
  assert.match(source, /<Icon name="shapes" \/>[\s\S]*?<span>Shape<\/span>/);
  assert.doesNotMatch(source, /Download canvas/);
  assert.match(styles, /\.simple-floating-actions button > span,\s*\.simple-shape-menu button > span[\s\S]*?clip: rect\(0, 0, 0, 0\)/);
});

test("properties toolbar exposes styling actions directly in the vertical toolbar", async () => {
  const source = await readSource("../app/CanvasPropertiesToolbar.tsx");

  assert.match(source, /placement = "right"/);
  assert.match(source, /data-placement=\{placement\}/);
  assert.doesNotMatch(source, /styleOpen|aria-label="Style"/);
  assert.match(source, /const \[activeFlyout, setActiveFlyout\] = useState<Flyout>\(null\)/);
  for (const label of ["Font size", "Bold", "Text alignment", "Delete"]) {
    assert.match(source, new RegExp(`aria-label="${label}"`));
  }
  assert.match(source, /activeFlyout === "font-size"/);
  assert.match(source, /activeFlyout === "border-width"/);
  assert.match(source, /className="sticker-vtoolbar-flyout canvas-property-flyout"/);
  for (const label of ["Text color", "Border color", "Border width"]) {
    assert.match(source, new RegExp(`aria-label="${label}"|title="${label}"|label="${label}"`));
  }
  assert.match(source, /label=\{isText \? "Background color" : "Fill color"\}/);
  assert.match(source, /backgroundColor/);
  assert.match(source, /borderColor/);
  assert.match(source, /borderWidth/);
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

test("canvas actions keep download independent from the editing toolbar", async () => {
  const canvas = await readSource("../app/SimpleStickerCanvas.tsx");
  const toolbar = await readSource("../app/CanvasBottomToolbar.tsx");
  const styles = await readSource("../app/globals.css");

  assert.match(canvas, /import \{ exportCanvasToPng \} from "@\/lib\/canvas-export"/);
  assert.match(canvas, /const \[isExporting, setIsExporting\] = useState\(false\)/);
  assert.match(canvas, /const exportCanvas = useCallback\(async \(\) => \{[\s\S]*?setIsExporting\(true\)[\s\S]*?await exportCanvasToPng\(stickersRef\.current\)[\s\S]*?finally \{[\s\S]*?setIsExporting\(false\)/);
  assert.match(canvas, /const downloadCanvas = useCallback\(\(\) => \{[\s\S]*?activeElement\.blur\(\)[\s\S]*?exportCanvas\(\)/);
  assert.match(canvas, /disabled=\{isImporting \|\| isExporting \|\| isCreatingCanvas \|\| Boolean\(processingStickerId\)\}/);
  assert.match(canvas, /isCreatingCanvas[\s\S]*?"Creating new canvas…"/);
  assert.match(canvas, /className="simple-canvas-actions"/);
  assert.match(canvas, /onClick=\{\(\) => void createNewCanvas\(\)\}[\s\S]*?aria-label="New canvas"/);
  assert.match(canvas, /onClick=\{downloadCanvas\}[\s\S]*?aria-label="Download canvas"/);
  assert.match(canvas, /saveCanvasProject\(nextProject\)/);
  assert.match(canvas, /openCanvasProject/);
  assert.match(canvas, /aria-label="Canvas history"/);
  assert.match(canvas, /simple-canvas-history-backdrop[\s\S]*?setHistoryOpen\(false\)/);
  assert.match(canvas, /<Icon name="history" \/>[\s\S]*?<Icon name="plus" \/>/);
  assert.match(canvas, /replaceStickerRecords\(defaults\)/);
  assert.doesNotMatch(toolbar, /onDownloadCanvas|Download canvas/);
  assert.match(styles, /\.simple-canvas-actions[\s\S]*?left: max\(22px/);
  assert.match(styles, /\.simple-canvas-history[\s\S]*?bottom: max\(80px/);
  assert.match(styles, /\.simple-canvas-history-backdrop[\s\S]*?inset: 0/);
  assert.match(styles, /\.simple-canvas-actions button \{[\s\S]*?width: 46px;[\s\S]*?height: 46px;/);
  assert.match(styles, /\.simple-canvas-actions button > span[\s\S]*?clip: rect\(0, 0, 0, 0\)/);
});

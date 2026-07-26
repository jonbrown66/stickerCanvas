function drawAngledLines(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  angle: number,
  spacing: number,
  lineWidth: number,
  color: string,
) {
  const diagonal = Math.hypot(width, height);
  context.save();
  context.translate(width / 2, height / 2);
  context.rotate((angle * Math.PI) / 180);
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  for (let offset = -diagonal; offset <= diagonal; offset += spacing) {
    context.beginPath();
    context.moveTo(-diagonal, offset);
    context.lineTo(diagonal, offset);
    context.stroke();
  }
  context.restore();
}

function fillRadialGlow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  color: string,
  alpha: number,
) {
  context.save();
  context.translate(x, y);
  context.scale(1, radiusY / Math.max(1, radiusX));
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radiusX);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.68, color);
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.globalAlpha *= alpha;
  context.fillStyle = gradient;
  context.fillRect(-radiusX, -radiusX, radiusX * 2, radiusX * 2);
  context.restore();
}

/**
 * Canvas equivalent of the preview's static oil-film base state. The caller
 * should draw the source alpha first; source-atop keeps every layer inside it.
 */
export function renderStaticOilFilm(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const longestSide = Math.max(width, height);
  context.save();
  context.globalCompositeOperation = "source-atop";

  // 1. Thin-film interference spectrum. This mirrors the low-opacity color
  // layer from the DOM preview so skin tones and source contrast remain intact.
  context.save();
  context.globalCompositeOperation = "color";
  context.globalAlpha = 0.09;
  fillRadialGlow(context, width * 0.21, height * 0.28, width * 0.42, height * 0.66, "#ffc25c", 0.88);
  fillRadialGlow(context, width * 0.76, height * 0.7, width * 0.46, height * 0.72, "#43dccb", 0.82);
  fillRadialGlow(context, width * 0.72, height * 0.18, width * 0.38, height * 0.58, "#cd7fff", 0.62);
  if ("createConicGradient" in context) {
    const spectrum = context.createConicGradient(
      (218 * Math.PI) / 180,
      width * 0.48,
      height * 0.52,
    );
    spectrum.addColorStop(0, "rgba(255,116,151,0.42)");
    spectrum.addColorStop(0.2, "rgba(255,217,116,0.48)");
    spectrum.addColorStop(0.4, "rgba(106,230,208,0.46)");
    spectrum.addColorStop(0.62, "rgba(124,171,255,0.42)");
    spectrum.addColorStop(0.82, "rgba(215,139,255,0.4)");
    spectrum.addColorStop(1, "rgba(255,116,151,0.42)");
    context.fillStyle = spectrum;
    context.fillRect(0, 0, width, height);
  }
  context.restore();

  // 2. Diffraction grating.
  context.save();
  context.globalCompositeOperation = "soft-light";
  context.globalAlpha = 0.08;
  drawAngledLines(context, width, height, 64, 5.5, 0.65, "rgba(255,255,255,0.2)");
  drawAngledLines(context, width, height, -26, 11, 0.45, "rgba(151,219,255,0.12)");
  context.restore();

  // 3. The narrow asymmetric specular streak.
  context.save();
  context.globalCompositeOperation = "screen";
  context.globalAlpha = 0.13;
  context.translate(width / 2, height / 2);
  context.rotate((116 * Math.PI) / 180);
  const streak = context.createLinearGradient(-longestSide, 0, longestSide, 0);
  streak.addColorStop(0, "rgba(255,255,255,0)");
  streak.addColorStop(0.42, "rgba(255,255,255,0)");
  streak.addColorStop(0.45, "rgba(255,177,222,0.06)");
  streak.addColorStop(0.476, "rgba(255,239,190,0.16)");
  streak.addColorStop(0.4935, "rgba(255,255,248,0.72)");
  streak.addColorStop(0.5, "rgba(255,255,255,0.92)");
  streak.addColorStop(0.511, "rgba(197,239,255,0.3)");
  streak.addColorStop(0.534, "rgba(145,200,255,0.08)");
  streak.addColorStop(0.57, "rgba(255,255,255,0)");
  context.fillStyle = streak;
  context.fillRect(-longestSide, -longestSide, longestSide * 2, longestSide * 2);
  context.restore();

  // 4. Curved laminate gloss plus a centered no-pointer glow.
  context.save();
  context.globalCompositeOperation = "soft-light";
  context.globalAlpha = 0.28;
  fillRadialGlow(context, width * 0.28, height * 0.12, width * 0.78, height * 0.52, "rgba(255,255,255,0.26)", 1);
  const gloss = context.createLinearGradient(0, 0, width, height);
  gloss.addColorStop(0, "rgba(255,255,255,0.08)");
  gloss.addColorStop(0.32, "rgba(255,255,255,0)");
  gloss.addColorStop(0.74, "rgba(255,255,255,0)");
  gloss.addColorStop(1, "rgba(255,255,255,0.05)");
  context.fillStyle = gloss;
  context.fillRect(0, 0, width, height);
  context.restore();

  context.save();
  context.globalCompositeOperation = "screen";
  context.globalAlpha = 0.06;
  const cursorGlow = context.createRadialGradient(
    width / 2,
    height / 2,
    0,
    width / 2,
    height / 2,
    longestSide * 0.29,
  );
  cursorGlow.addColorStop(0, "rgba(255,255,255,0.48)");
  cursorGlow.addColorStop(0.24, "rgba(255,245,195,0.18)");
  cursorGlow.addColorStop(0.46, "rgba(147,225,255,0.1)");
  cursorGlow.addColorStop(0.72, "rgba(147,225,255,0)");
  context.fillStyle = cursorGlow;
  context.fillRect(0, 0, width, height);
  context.restore();

  // 5. Deterministic micro-crystal reflections; no animation in an export.
  context.save();
  context.globalCompositeOperation = "screen";
  context.globalAlpha = 0.07;
  for (let x = 0; x < width; x += 23) {
    for (let y = 0; y < height; y += 29) {
      context.fillStyle = (x / 23 + y / 29) % 2 === 0 ? "#ffffff" : "#c3eeff";
      context.beginPath();
      context.arc(x + 2, y + 1, 0.7, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
  context.restore();
}

/**
 * The non-pointer state of the preview's iridescent outline. The caller draws
 * the outline alpha into the target canvas first; source-in confines the
 * spectrum and glint to that ring instead of tinting the picture rectangle.
 */
export function renderStaticHoloBorder(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  context.save();
  context.globalCompositeOperation = "source-in";
  context.globalAlpha = 0.72;
  const spectrum = context.createLinearGradient(0, height, width, 0);
  spectrum.addColorStop(0, "#ff83bb");
  spectrum.addColorStop(0.22, "#ffd783");
  spectrum.addColorStop(0.46, "#f7fff4");
  spectrum.addColorStop(0.68, "#77e6d2");
  spectrum.addColorStop(0.86, "#8cbcff");
  spectrum.addColorStop(1, "#d89cff");
  context.fillStyle = spectrum;
  context.fillRect(0, 0, width, height);

  context.globalCompositeOperation = "screen";
  context.globalAlpha = 0.34;
  const glint = context.createRadialGradient(
    width / 2,
    height / 2,
    0,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.28,
  );
  glint.addColorStop(0, "rgba(255,255,255,0.98)");
  glint.addColorStop(0.2, "rgba(255,247,214,0.82)");
  glint.addColorStop(0.46, "rgba(189,239,255,0.3)");
  glint.addColorStop(1, "rgba(189,239,255,0)");
  context.fillStyle = glint;
  context.fillRect(0, 0, width, height);
  context.restore();
}

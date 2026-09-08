export type AutoLayoutItem = {
  id: string;
  width: number;
  height: number;
  rotation: number;
  kind: "image" | "text" | "shape";
};

export type AutoLayoutPosition = { id: string; x: number; y: number; scale: number };
export type AutoLayoutResult = {
  positions: AutoLayoutPosition[];
  width: number;
  height: number;
};

type Block = AutoLayoutResult & { area: number };

// Every join measures actual bounds. Empty space is kept inside a group,
// rather than distributed into a viewport-sized grid.
function join(a: Block, b: Block, horizontal: boolean, gap: number): Block {
  const width = horizontal ? a.width + gap + b.width : Math.max(a.width, b.width);
  const height = horizontal ? Math.max(a.height, b.height) : a.height + gap + b.height;
  const move = (block: Block, x: number, y: number) =>
    block.positions.map((p) => ({ ...p, x: p.x + x, y: p.y + y }));
  return {
    width, height, area: a.area + b.area,
    positions: [
      ...move(a, horizontal ? -(b.width + gap) / 2 : 0,
        horizontal ? 0 : -(b.height + gap) / 2),
      ...move(b, horizontal ? (a.width + gap) / 2 : 0,
        horizontal ? 0 : (a.height + gap) / 2),
    ],
  };
}

function score(block: Block) {
  const emptySpace = block.width * block.height / block.area - 1;
  const aspect = Math.log(block.width / block.height / 1.35);
  return emptySpace + 0.8 * aspect * aspect;
}

// Preserve candidates of different proportions: a narrow text stack can be
// a much better fit next to a portrait than the locally most compact group.
function shortlist(candidates: Block[]): Block[] {
  const buckets = new Map<number, Block>();
  for (const candidate of candidates) {
    const bucket = Math.round(Math.log(candidate.width / candidate.height) * 6);
    const previous = buckets.get(bucket);
    if (!previous || score(candidate) < score(previous)) buckets.set(bucket, candidate);
  }
  return [...buckets.values()].sort((a, b) => score(a) - score(b)).slice(0, 12);
}

function search(blocks: Block[], gap: number): Block {
  const count = blocks.length;
  const full = (1 << count) - 1;
  const layouts = new Map<number, Block[]>();
  blocks.forEach((block, index) => layouts.set(1 << index, [block]));
  for (let mask = 1; mask <= full; mask += 1) {
    if (layouts.has(mask)) continue;
    const candidates: Block[] = [];
    const first = mask & -mask;
    for (let left = (mask - 1) & mask; left; left = (left - 1) & mask) {
      if (!(left & first)) continue;
      const right = mask ^ left;
      if (!right) continue;
      for (const a of layouts.get(left) ?? []) {
        for (const b of layouts.get(right) ?? []) {
          candidates.push(join(a, b, true, gap), join(a, b, false, gap));
        }
      }
    }
    layouts.set(mask, shortlist(candidates));
  }
  return layouts.get(full)![0];
}

/** Searches nested rows/columns without resizing or overlapping materials. */
export function getAutoLayoutResult(items: AutoLayoutItem[]): AutoLayoutResult {
  if (!items.length) return { positions: [], width: 0, height: 0 };
  const blocks: Block[] = items.map((item) => {
    const angle = item.rotation * Math.PI / 180;
    const width = Math.abs(Math.cos(angle)) * item.width +
      Math.abs(Math.sin(angle)) * item.height;
    const height = Math.abs(Math.sin(angle)) * item.width +
      Math.abs(Math.cos(angle)) * item.height;
    return {
      width, height, area: width * height,
      positions: [{ id: item.id, x: 0, y: 0, scale: 1 }],
    };
  });
  const shortEdges = blocks.map((b) => Math.min(b.width, b.height)).sort((a, b) => a - b);
  const gap = Math.max(12, Math.min(28, shortEdges[Math.floor(shortEdges.length / 2)] * 0.1));
  // Bound the subset search for large canvases. Groups still use the same
  // measured joins, so the fallback also guarantees separation.
  let groups = blocks;
  while (groups.length > 8) {
    const next: Block[] = [];
    for (let i = 0; i < groups.length; i += 6) {
      next.push(search(groups.slice(i, i + 6), gap));
    }
    groups = next;
  }
  const best = search(groups, gap);
  return { positions: best.positions, width: best.width, height: best.height };
}

export function getAutoLayoutPositions(items: AutoLayoutItem[]): AutoLayoutPosition[] {
  return getAutoLayoutResult(items).positions;
}

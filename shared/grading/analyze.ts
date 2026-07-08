// Rough card-condition analysis from a photo. Pure pixel math — no ML, no DOM.
// The caller supplies raw RGBA pixels (e.g. from a canvas getImageData); we
// find the card against a contrasting background, measure border centering,
// and look for whitening (worn print) on corners and edges. The output is an
// honest *estimate*: good enough for "roughly NM vs played", nowhere near a
// professional grade.

export interface PixelImage {
  data: Uint8ClampedArray; // RGBA, 4 bytes per pixel
  width: number;
  height: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number; // exclusive
  bottom: number; // exclusive
}

export type CardCondition = "NM" | "LP" | "MP" | "HP" | "DMG";

export const CONDITION_LABEL: Record<CardCondition, string> = {
  NM: "Near Mint",
  LP: "Lightly Played",
  MP: "Moderately Played",
  HP: "Heavily Played",
  DMG: "Damaged",
};

export interface CenteringResult {
  // Border widths in pixels per side (card edge → inner frame).
  left: number;
  right: number;
  top: number;
  bottom: number;
  // e.g. [55, 45] meaning the left border takes 55% of left+right.
  horizontalPct: [number, number];
  verticalPct: [number, number];
  // Worst deviation from 50/50 across both axes (0 = perfect, 50 = worst).
  deviation: number;
}

export interface WearResult {
  // Fraction (0-1) of whitened pixels per corner patch.
  topLeft: number;
  topRight: number;
  bottomLeft: number;
  bottomRight: number;
  // Fraction of whitened pixels along the edge strips.
  edges: number;
}

export interface GradeEstimate {
  score: number; // 1-10, one decimal
  gradeRange: [number, number]; // e.g. [7, 8]
  condition: CardCondition;
  notes: string[];
}

export interface CardAnalysis {
  bounds: Rect;
  centering: CenteringResult;
  wear: WearResult;
  grade: GradeEstimate;
}

// ---- pixel helpers ------------------------------------------------------

function lum(d: Uint8ClampedArray, i: number): number {
  return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
}

function px(img: PixelImage, x: number, y: number): number {
  return (y * img.width + x) * 4;
}

function colorDist(d: Uint8ClampedArray, i: number, rgb: [number, number, number]): number {
  return (
    Math.abs(d[i] - rgb[0]) + Math.abs(d[i + 1] - rgb[1]) + Math.abs(d[i + 2] - rgb[2])
  );
}

// Average color of a rectangular patch.
function patchColor(img: PixelImage, r: Rect): [number, number, number] {
  let cr = 0;
  let cg = 0;
  let cb = 0;
  let n = 0;
  for (let y = r.top; y < r.bottom; y++) {
    for (let x = r.left; x < r.right; x++) {
      const i = px(img, x, y);
      cr += img.data[i];
      cg += img.data[i + 1];
      cb += img.data[i + 2];
      n++;
    }
  }
  return n ? [cr / n, cg / n, cb / n] : [0, 0, 0];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// ---- card detection -----------------------------------------------------

// Finds the card as the dominant region that differs from the background.
// Background color is sampled from the image corners, so the card must be
// photographed on a plain, contrasting surface. Returns null when no
// plausible card-sized region is found.
export function detectCardBounds(img: PixelImage): Rect | null {
  const { width, height } = img;
  const cw = Math.max(2, Math.floor(width * 0.04));
  const ch = Math.max(2, Math.floor(height * 0.04));
  // Average the four image corners for the background reference.
  const corners: Rect[] = [
    { left: 0, top: 0, right: cw, bottom: ch },
    { left: width - cw, top: 0, right: width, bottom: ch },
    { left: 0, top: height - ch, right: cw, bottom: height },
    { left: width - cw, top: height - ch, right: width, bottom: height },
  ];
  const colors = corners.map((r) => patchColor(img, r));
  const bg: [number, number, number] = [
    median(colors.map((c) => c[0])),
    median(colors.map((c) => c[1])),
    median(colors.map((c) => c[2])),
  ];

  const THRESH = 120; // sum of |ΔR|+|ΔG|+|ΔB| to count as "not background"
  const rowHits = new Array<number>(height).fill(0);
  const colHits = new Array<number>(width).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (colorDist(img.data, px(img, x, y), bg) > THRESH) {
        rowHits[y]++;
        colHits[x]++;
      }
    }
  }

  const rowMin = width * 0.2;
  const colMin = height * 0.2;
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    if (rowHits[y] > rowMin) {
      if (top === -1) top = y;
      bottom = y + 1;
    }
  }
  let left = -1;
  let right = -1;
  for (let x = 0; x < width; x++) {
    if (colHits[x] > colMin) {
      if (left === -1) left = x;
      right = x + 1;
    }
  }
  if (top === -1 || left === -1) return null;
  // Must fill a reasonable share of the frame and look card-shaped-ish.
  const w = right - left;
  const h = bottom - top;
  if (w < width * 0.3 || h < height * 0.3) return null;
  return { left, top, right, bottom };
}

// ---- centering ----------------------------------------------------------

// Walks inward from each card edge along several scanlines and finds the
// strongest luminance transition — the border → inner-frame boundary. The
// median across scanlines is that side's border width.
export function measureCentering(img: PixelImage, bounds: Rect): CenteringResult {
  const w = bounds.right - bounds.left;
  const h = bounds.bottom - bounds.top;
  const fractions = [0.3, 0.4, 0.5, 0.6, 0.7];

  // Search for the transition between 1.5% and 18% of the dimension in from
  // the edge; borders outside that window aren't plausibly a card border.
  function findEdge(profile: number[]): number {
    const min = Math.max(2, Math.floor(profile.length * 0.015));
    const max = Math.floor(profile.length * 0.18);
    let bestI = min;
    let bestG = -1;
    for (let i = min; i < max; i++) {
      const g = Math.abs(profile[i + 2] - profile[i - 2]);
      if (g > bestG) {
        bestG = g;
        bestI = i;
      }
    }
    return bestI;
  }

  function horizProfile(y: number, fromLeft: boolean): number[] {
    const out: number[] = [];
    for (let k = 0; k < w; k++) {
      const x = fromLeft ? bounds.left + k : bounds.right - 1 - k;
      out.push(lum(img.data, px(img, x, y)));
    }
    return out;
  }
  function vertProfile(x: number, fromTop: boolean): number[] {
    const out: number[] = [];
    for (let k = 0; k < h; k++) {
      const y = fromTop ? bounds.top + k : bounds.bottom - 1 - k;
      out.push(lum(img.data, px(img, x, y)));
    }
    return out;
  }

  const lefts: number[] = [];
  const rights: number[] = [];
  const tops: number[] = [];
  const bottoms: number[] = [];
  for (const f of fractions) {
    const y = Math.floor(bounds.top + h * f);
    const x = Math.floor(bounds.left + w * f);
    lefts.push(findEdge(horizProfile(y, true)));
    rights.push(findEdge(horizProfile(y, false)));
    tops.push(findEdge(vertProfile(x, true)));
    bottoms.push(findEdge(vertProfile(x, false)));
  }

  const left = median(lefts);
  const right = median(rights);
  const top = median(tops);
  const bottom = median(bottoms);

  const pct = (a: number, b: number): [number, number] => {
    const total = a + b;
    if (total === 0) return [50, 50];
    const p = Math.round((a / total) * 100);
    return [p, 100 - p];
  };
  const horizontalPct = pct(left, right);
  const verticalPct = pct(top, bottom);
  const deviation = Math.max(
    Math.abs(horizontalPct[0] - 50),
    Math.abs(verticalPct[0] - 50)
  );
  return { left, right, top, bottom, horizontalPct, verticalPct, deviation };
}

// ---- wear (whitening) ---------------------------------------------------

// Whitening = worn card stock showing through the printed border: pixels much
// lighter than the border color and close to gray. We compare against the
// border color sampled at the edge midpoints (away from the corners).
export function measureWear(img: PixelImage, bounds: Rect): WearResult {
  const w = bounds.right - bounds.left;
  const h = bounds.bottom - bounds.top;
  const strip = Math.max(2, Math.floor(Math.min(w, h) * 0.02));
  const midX = Math.floor(bounds.left + w / 2);
  const midY = Math.floor(bounds.top + h / 2);
  const seg = Math.floor(Math.min(w, h) * 0.1);

  const borderRefs: Rect[] = [
    { left: midX - seg, top: bounds.top, right: midX + seg, bottom: bounds.top + strip },
    { left: midX - seg, top: bounds.bottom - strip, right: midX + seg, bottom: bounds.bottom },
    { left: bounds.left, top: midY - seg, right: bounds.left + strip, bottom: midY + seg },
    { left: bounds.right - strip, top: midY - seg, right: bounds.right, bottom: midY + seg },
  ];
  const borderLum = median(
    borderRefs.map((r) => {
      const c = patchColor(img, r);
      return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    })
  );

  function whitenedFraction(r: Rect): number {
    let hit = 0;
    let n = 0;
    for (let y = Math.max(bounds.top, r.top); y < Math.min(bounds.bottom, r.bottom); y++) {
      for (let x = Math.max(bounds.left, r.left); x < Math.min(bounds.right, r.right); x++) {
        const i = px(img, x, y);
        const l = lum(img.data, i);
        const spread =
          Math.max(img.data[i], img.data[i + 1], img.data[i + 2]) -
          Math.min(img.data[i], img.data[i + 1], img.data[i + 2]);
        // Much lighter than the border, and grayish (exposed card stock).
        if (l > borderLum + 70 && l > 150 && spread < 60) hit++;
        n++;
      }
    }
    return n ? hit / n : 0;
  }

  const patch = Math.max(4, Math.floor(Math.min(w, h) * 0.08));
  const topLeft = whitenedFraction({
    left: bounds.left,
    top: bounds.top,
    right: bounds.left + patch,
    bottom: bounds.top + patch,
  });
  const topRight = whitenedFraction({
    left: bounds.right - patch,
    top: bounds.top,
    right: bounds.right,
    bottom: bounds.top + patch,
  });
  const bottomLeft = whitenedFraction({
    left: bounds.left,
    top: bounds.bottom - patch,
    right: bounds.left + patch,
    bottom: bounds.bottom,
  });
  const bottomRight = whitenedFraction({
    left: bounds.right - patch,
    top: bounds.bottom - patch,
    right: bounds.right,
    bottom: bounds.bottom,
  });

  // Edge strips along the middle 60% of each side (corners excluded — they're
  // measured separately above).
  const inset = Math.floor(Math.min(w, h) * 0.2);
  const edgeStrips: Rect[] = [
    { left: bounds.left + inset, top: bounds.top, right: bounds.right - inset, bottom: bounds.top + strip },
    { left: bounds.left + inset, top: bounds.bottom - strip, right: bounds.right - inset, bottom: bounds.bottom },
    { left: bounds.left, top: bounds.top + inset, right: bounds.left + strip, bottom: bounds.bottom - inset },
    { left: bounds.right - strip, top: bounds.top + inset, right: bounds.right, bottom: bounds.bottom - inset },
  ];
  const edges =
    edgeStrips.map(whitenedFraction).reduce((a, b) => a + b, 0) / edgeStrips.length;

  return { topLeft, topRight, bottomLeft, bottomRight, edges };
}

// ---- grade mapping ------------------------------------------------------

export function estimateGrade(centering: CenteringResult, wear: WearResult): GradeEstimate {
  const notes: string[] = [];

  // Centering: up to ±5 from 50/50 is effectively perfect; beyond that it
  // costs up to ~2.5 points at 80/20 or worse.
  const centeringPenalty = Math.min(2.5, Math.max(0, centering.deviation - 5) * 0.08);
  if (centering.deviation > 10) {
    notes.push(
      `Centering off — ${centering.horizontalPct.join("/")} horizontal, ${centering.verticalPct.join("/")} vertical`
    );
  }

  // Corners: each worn corner costs up to 1.5; total corner damage caps at 4.
  const cornerFractions = [wear.topLeft, wear.topRight, wear.bottomLeft, wear.bottomRight];
  let cornerPenalty = 0;
  let wornCorners = 0;
  for (const f of cornerFractions) {
    if (f > 0.03) {
      cornerPenalty += Math.min(1.5, (f - 0.03) * 12);
      wornCorners++;
    }
  }
  cornerPenalty = Math.min(4, cornerPenalty);
  if (wornCorners > 0) {
    notes.push(`Whitening detected on ${wornCorners} corner${wornCorners === 1 ? "" : "s"}`);
  }

  // Edges: up to 2 points.
  const edgePenalty = wear.edges > 0.02 ? Math.min(2, (wear.edges - 0.02) * 25) : 0;
  if (wear.edges > 0.05) notes.push("Edge wear detected");

  const raw = 10 - centeringPenalty - cornerPenalty - edgePenalty;
  const score = Math.round(Math.min(10, Math.max(1, raw)) * 10) / 10;

  const lo = Math.max(1, Math.floor(score - 0.5));
  const hi = Math.min(10, Math.ceil(score + 0.5));
  const condition: CardCondition =
    score >= 9 ? "NM" : score >= 7 ? "LP" : score >= 5 ? "MP" : score >= 3 ? "HP" : "DMG";

  if (notes.length === 0) notes.push("No obvious wear found");
  return { score, gradeRange: [lo, hi], condition, notes };
}

// ---- entry point --------------------------------------------------------

export function analyzeCard(img: PixelImage): CardAnalysis | null {
  const bounds = detectCardBounds(img);
  if (!bounds) return null;
  const centering = measureCentering(img, bounds);
  const wear = measureWear(img, bounds);
  const grade = estimateGrade(centering, wear);
  return { bounds, centering, wear, grade };
}

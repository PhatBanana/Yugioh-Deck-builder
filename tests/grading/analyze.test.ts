import { describe, expect, it } from "vitest";
import {
  analyzeCard,
  detectCardBounds,
  estimateGrade,
  measureCentering,
  measureWear,
  type CenteringResult,
  type PixelImage,
  type WearResult,
} from "../../shared/grading/analyze";

// ---- synthetic image builder --------------------------------------------
// Draws a "card" (dark border + light inner frame) on a white background so
// the analyzer has realistic structure to find: background → card edge →
// border → inner-frame luminance transition.

interface FakeCardOpts {
  imgW?: number;
  imgH?: number;
  card?: { left: number; top: number; right: number; bottom: number };
  border?: { left: number; right: number; top: number; bottom: number };
  // Corners to paint near-white (simulated whitening), as a fraction of the
  // corner patch to whiten (0-1).
  whitenCorners?: Partial<
    Record<"topLeft" | "topRight" | "bottomLeft" | "bottomRight", number>
  >;
}

function makeCardImage(opts: FakeCardOpts = {}): PixelImage {
  const width = opts.imgW ?? 200;
  const height = opts.imgH ?? 280;
  const card = opts.card ?? { left: 20, top: 20, right: 180, bottom: 260 };
  const border = opts.border ?? { left: 12, right: 12, top: 12, bottom: 12 };
  const data = new Uint8ClampedArray(width * height * 4);

  const set = (x: number, y: number, r: number, g: number, b: number) => {
    const i = (y * width + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inCard = x >= card.left && x < card.right && y >= card.top && y < card.bottom;
      if (!inCard) {
        set(x, y, 250, 250, 250); // white table background
        continue;
      }
      const inInner =
        x >= card.left + border.left &&
        x < card.right - border.right &&
        y >= card.top + border.top &&
        y < card.bottom - border.bottom;
      // Dark brown border vs light tan inner frame (like a YGO card).
      if (inInner) set(x, y, 190, 170, 130);
      else set(x, y, 60, 45, 30);
    }
  }

  // Paint whitening into corner patches (~8% of the card's min dimension,
  // matching the analyzer's patch size).
  const cw = card.right - card.left;
  const ch = card.bottom - card.top;
  const patch = Math.max(4, Math.floor(Math.min(cw, ch) * 0.08));
  const corners = {
    topLeft: { x0: card.left, y0: card.top },
    topRight: { x0: card.right - patch, y0: card.top },
    bottomLeft: { x0: card.left, y0: card.bottom - patch },
    bottomRight: { x0: card.right - patch, y0: card.bottom - patch },
  } as const;
  for (const [name, frac] of Object.entries(opts.whitenCorners ?? {})) {
    const c = corners[name as keyof typeof corners];
    const rows = Math.floor(patch * Math.sqrt(frac!));
    const cols = Math.floor(patch * Math.sqrt(frac!));
    for (let dy = 0; dy < rows; dy++) {
      for (let dx = 0; dx < cols; dx++) {
        set(c.x0 + dx, c.y0 + dy, 235, 232, 228); // exposed card stock
      }
    }
  }

  return { data, width, height };
}

// ---- tests ---------------------------------------------------------------

describe("detectCardBounds", () => {
  it("finds the card region against a contrasting background", () => {
    const img = makeCardImage();
    const b = detectCardBounds(img);
    expect(b).not.toBeNull();
    expect(b!.left).toBeGreaterThanOrEqual(18);
    expect(b!.left).toBeLessThanOrEqual(22);
    expect(b!.top).toBeGreaterThanOrEqual(18);
    expect(b!.top).toBeLessThanOrEqual(22);
    expect(b!.right).toBeGreaterThanOrEqual(178);
    expect(b!.bottom).toBeGreaterThanOrEqual(258);
  });

  it("returns null for an empty background", () => {
    const width = 100;
    const height = 100;
    const data = new Uint8ClampedArray(width * height * 4).fill(250);
    expect(detectCardBounds({ data, width, height })).toBeNull();
  });

  it("returns null when the region is too small to be the card", () => {
    // A 10x10 speck in a 200x200 frame.
    const img = makeCardImage({
      imgW: 200,
      imgH: 200,
      card: { left: 95, top: 95, right: 105, bottom: 105 },
      border: { left: 2, right: 2, top: 2, bottom: 2 },
    });
    expect(detectCardBounds(img)).toBeNull();
  });
});

describe("measureCentering", () => {
  it("reports ~50/50 for an evenly centered card", () => {
    const img = makeCardImage();
    const b = detectCardBounds(img)!;
    const c = measureCentering(img, b);
    expect(c.deviation).toBeLessThanOrEqual(6);
  });

  it("detects off-center borders", () => {
    // Left border twice the right border: 20px vs 10px → ~67/33.
    const img = makeCardImage({ border: { left: 20, right: 10, top: 12, bottom: 12 } });
    const b = detectCardBounds(img)!;
    const c = measureCentering(img, b);
    expect(c.horizontalPct[0]).toBeGreaterThan(60);
    expect(c.deviation).toBeGreaterThan(10);
  });
});

describe("measureWear", () => {
  it("reports near-zero wear for a clean card", () => {
    const img = makeCardImage();
    const b = detectCardBounds(img)!;
    const w = measureWear(img, b);
    expect(w.topLeft).toBeLessThan(0.03);
    expect(w.bottomRight).toBeLessThan(0.03);
    expect(w.edges).toBeLessThan(0.03);
  });

  it("detects whitened corners", () => {
    const img = makeCardImage({ whitenCorners: { topLeft: 0.5, bottomRight: 0.3 } });
    const b = detectCardBounds(img)!;
    const w = measureWear(img, b);
    expect(w.topLeft).toBeGreaterThan(0.2);
    expect(w.bottomRight).toBeGreaterThan(0.1);
    expect(w.topRight).toBeLessThan(0.05);
  });
});

describe("estimateGrade", () => {
  const cleanCentering: CenteringResult = {
    left: 12,
    right: 12,
    top: 12,
    bottom: 12,
    horizontalPct: [50, 50],
    verticalPct: [50, 50],
    deviation: 0,
  };
  const cleanWear: WearResult = {
    topLeft: 0,
    topRight: 0,
    bottomLeft: 0,
    bottomRight: 0,
    edges: 0,
  };

  it("grades a clean card NM with a high score", () => {
    const g = estimateGrade(cleanCentering, cleanWear);
    expect(g.score).toBeGreaterThanOrEqual(9);
    expect(g.condition).toBe("NM");
  });

  it("worse wear always means an equal or lower score", () => {
    let prev = Infinity;
    for (const f of [0, 0.05, 0.15, 0.3, 0.6]) {
      const g = estimateGrade(cleanCentering, {
        ...cleanWear,
        topLeft: f,
        topRight: f,
        bottomLeft: f,
        bottomRight: f,
        edges: f,
      });
      expect(g.score).toBeLessThanOrEqual(prev);
      prev = g.score;
    }
  });

  it("heavy wear on all corners drops the condition below LP", () => {
    const g = estimateGrade(cleanCentering, {
      topLeft: 0.4,
      topRight: 0.4,
      bottomLeft: 0.4,
      bottomRight: 0.4,
      edges: 0.15,
    });
    expect(["MP", "HP", "DMG"]).toContain(g.condition);
    expect(g.notes.join(" ")).toMatch(/corner/i);
  });

  it("bad centering alone costs points but not below MP", () => {
    const g = estimateGrade(
      {
        ...cleanCentering,
        horizontalPct: [80, 20],
        verticalPct: [50, 50],
        deviation: 30,
      },
      cleanWear
    );
    expect(g.score).toBeLessThan(9);
    expect(g.score).toBeGreaterThanOrEqual(7);
    expect(g.notes.join(" ")).toMatch(/centering/i);
  });

  it("grade range brackets the score", () => {
    const g = estimateGrade(cleanCentering, { ...cleanWear, topLeft: 0.2 });
    expect(g.gradeRange[0]).toBeLessThanOrEqual(g.score);
    expect(g.gradeRange[1]).toBeGreaterThanOrEqual(g.score);
  });
});

describe("analyzeCard end-to-end", () => {
  it("clean synthetic card comes out NM-ish", () => {
    const a = analyzeCard(makeCardImage());
    expect(a).not.toBeNull();
    expect(a!.grade.score).toBeGreaterThanOrEqual(8);
  });

  it("whitened corners lower the end-to-end grade", () => {
    const clean = analyzeCard(makeCardImage())!;
    const worn = analyzeCard(
      makeCardImage({
        whitenCorners: { topLeft: 0.6, topRight: 0.6, bottomLeft: 0.6, bottomRight: 0.6 },
      })
    )!;
    expect(worn.grade.score).toBeLessThan(clean.grade.score);
  });

  it("returns null when no card is in frame", () => {
    const width = 120;
    const height = 120;
    const data = new Uint8ClampedArray(width * height * 4).fill(245);
    expect(analyzeCard({ data, width, height })).toBeNull();
  });
});

import type { Rect } from "../grading/analyze";

// Maps a detected card's bounding box to the frame-fraction regions the foil
// classifier samples (name plate, artwork box, whole card). Until now those
// regions were fixed fractions of the *screen*, which mostly measured the
// table behind the card; anchoring them to the card is what makes the
// specular readings mean anything.

export interface FractionRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface FoilRegions {
  name: FractionRect;
  art: FractionRect;
  whole: FractionRect;
}

// Card-relative layout constants (fractions of the card's own box). The name
// plate stops before the attribute icon in the top-right; the art box is the
// framed illustration on a standard layout.
const NAME = { x0: 0.06, y0: 0.045, x1: 0.8, y1: 0.115 };
const ART = { x0: 0.11, y0: 0.185, x1: 0.89, y1: 0.62 };
const INSET = 0.03; // "whole card" pulls in from the border glare

// A real card is portrait with aspect ≈ 59/86 ≈ 0.686; far outside that (or a
// tiny box) means the detector latched onto something else — reject and let
// the caller fall back.
const MIN_ASPECT = 0.5;
const MAX_ASPECT = 0.9;
const MIN_AREA_FRACTION = 0.12;

export function cardFoilRegions(
  bounds: Rect,
  frameW: number,
  frameH: number
): FoilRegions | null {
  const w = bounds.right - bounds.left;
  const h = bounds.bottom - bounds.top;
  if (w <= 0 || h <= 0 || frameW <= 0 || frameH <= 0) return null;
  const aspect = w / h;
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) return null;
  if ((w * h) / (frameW * frameH) < MIN_AREA_FRACTION) return null;

  // Card-relative fractions → frame fractions.
  const toFrame = (r: { x0: number; y0: number; x1: number; y1: number }): FractionRect => ({
    x0: (bounds.left + r.x0 * w) / frameW,
    y0: (bounds.top + r.y0 * h) / frameH,
    x1: (bounds.left + r.x1 * w) / frameW,
    y1: (bounds.top + r.y1 * h) / frameH,
  });

  return {
    name: toFrame(NAME),
    art: toFrame(ART),
    whole: toFrame({ x0: INSET, y0: INSET, x1: 1 - INSET, y1: 1 - INSET }),
  };
}

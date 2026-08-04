import { describe, expect, it } from "vitest";
import { cardFoilRegions } from "../../shared/scan/foilRegions";

// A well-framed card: 400x583 (aspect 0.686) centered in a 1000x1000 frame.
const CARD = { left: 300, top: 200, right: 700, bottom: 783 };

describe("cardFoilRegions", () => {
  it("anchors the regions to the card box, not the frame", () => {
    const r = cardFoilRegions(CARD, 1000, 1000)!;
    // The name band's vertical center sits near the card's top edge…
    const nameMidY = ((r.name.y0 + r.name.y1) / 2) * 1000;
    expect(nameMidY).toBeGreaterThan(CARD.top);
    expect(nameMidY).toBeLessThan(CARD.top + 0.15 * (CARD.bottom - CARD.top));
    // …and every region stays inside the card bounds.
    for (const reg of [r.name, r.art, r.whole]) {
      expect(reg.x0 * 1000).toBeGreaterThanOrEqual(CARD.left);
      expect(reg.x1 * 1000).toBeLessThanOrEqual(CARD.right);
      expect(reg.y0 * 1000).toBeGreaterThanOrEqual(CARD.top);
      expect(reg.y1 * 1000).toBeLessThanOrEqual(CARD.bottom);
      expect(reg.x1).toBeGreaterThan(reg.x0);
      expect(reg.y1).toBeGreaterThan(reg.y0);
    }
    // Name is above art.
    expect(r.name.y1).toBeLessThanOrEqual(r.art.y0);
  });

  it("rejects boxes that can't be a portrait card", () => {
    // Landscape (aspect > 0.9 … actually > 1).
    expect(cardFoilRegions({ left: 0, top: 0, right: 800, bottom: 400 }, 1000, 1000)).toBeNull();
    // Too skinny.
    expect(cardFoilRegions({ left: 0, top: 0, right: 200, bottom: 900 }, 1000, 1000)).toBeNull();
  });

  it("rejects tiny detections (background noise)", () => {
    expect(cardFoilRegions({ left: 0, top: 0, right: 90, bottom: 131 }, 1000, 1000)).toBeNull();
  });

  it("rejects degenerate inputs", () => {
    expect(cardFoilRegions({ left: 10, top: 10, right: 10, bottom: 100 }, 1000, 1000)).toBeNull();
    expect(cardFoilRegions(CARD, 0, 0)).toBeNull();
  });
});

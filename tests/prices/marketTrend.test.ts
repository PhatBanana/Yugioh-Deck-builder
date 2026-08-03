import { describe, expect, it } from "vitest";
import { parseMarketTrend } from "../../shared/prices/marketTrend";

describe("parseMarketTrend", () => {
  it("returns [] for the API's no-results error", () => {
    expect(parseMarketTrend({ error: "No results found for this card." })).toEqual([]);
    expect(parseMarketTrend(null)).toEqual([]);
    expect(parseMarketTrend({})).toEqual([]);
  });

  it("normalises points to dates, oldest first", () => {
    const jan1 = Date.UTC(2026, 0, 1);
    const feb1 = Date.UTC(2026, 1, 1);
    const out = parseMarketTrend({
      series: [
        {
          name: "Secret Rare 1st Edition",
          url: "https://tcg/x",
          // newest-first, as the API returns it
          data: [
            { x: feb1, y: 5.5 },
            { x: jan1, y: 4.0 },
          ],
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].printing).toBe("Secret Rare 1st Edition");
    expect(out[0].url).toBe("https://tcg/x");
    expect(out[0].points).toEqual([
      { date: "2026-01-01", priceUsd: 4.0 },
      { date: "2026-02-01", priceUsd: 5.5 },
    ]);
  });

  it("drops malformed and non-positive points, and empty series", () => {
    const out = parseMarketTrend({
      series: [
        { name: "A", data: [{ x: Date.UTC(2026, 0, 1), y: 0 }, { y: 3 }, { x: 1 }] },
        { name: "B", data: [{ x: Date.UTC(2026, 0, 2), y: 2 }] },
      ],
    });
    expect(out.map((s) => s.printing)).toEqual(["B"]); // A had no valid points
  });

  it("orders series by how much history they have", () => {
    const out = parseMarketTrend({
      series: [
        { name: "short", data: [{ x: Date.UTC(2026, 0, 1), y: 1 }] },
        {
          name: "long",
          data: [
            { x: Date.UTC(2026, 0, 1), y: 1 },
            { x: Date.UTC(2026, 0, 2), y: 2 },
          ],
        },
      ],
    });
    expect(out.map((s) => s.printing)).toEqual(["long", "short"]);
  });
});

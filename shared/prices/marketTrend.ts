// Parses YGOPRODeck's (undocumented) price-trend response — the same data its
// website's price graph uses. Each series is one printing (rarity + edition +
// set) with real market prices over time, so this gives history going back
// months, not just from when a card was first tracked locally.
//
// Response shape (Highcharts-style):
//   { series: [ { name, url, data: [ { x: epochMs, y: price }, … ] }, … ] }
// or { error: "No results found for this card." } when there's no trend data.

export interface MarketPoint {
  date: string; // YYYY-MM-DD
  priceUsd: number; // or EUR for the Cardmarket endpoint — caller knows which
}

export interface MarketSeries {
  printing: string; // e.g. "Prismatic Secret Rare 1st Edition (…)"
  url?: string;
  points: MarketPoint[]; // oldest first
}

interface RawSeries {
  name?: string;
  url?: string;
  data?: { x?: number; y?: number }[];
}

export function parseMarketTrend(json: unknown): MarketSeries[] {
  const series = (json as { series?: RawSeries[] })?.series;
  if (!Array.isArray(series)) return [];

  const out: MarketSeries[] = [];
  for (const s of series) {
    const points: MarketPoint[] = [];
    for (const p of s.data ?? []) {
      if (typeof p?.x === "number" && typeof p?.y === "number" && p.y > 0) {
        points.push({ date: new Date(p.x).toISOString().slice(0, 10), priceUsd: p.y });
      }
    }
    // The API returns newest-first; charts want oldest-first.
    points.sort((a, b) => a.date.localeCompare(b.date));
    if (points.length > 0) out.push({ printing: s.name ?? "", url: s.url, points });
  }
  // Most series (printings) first — richer history is usually the flagship one.
  return out.sort((a, b) => b.points.length - a.points.length);
}

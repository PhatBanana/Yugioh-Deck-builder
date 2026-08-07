// Pure analytics over a collection's recorded price history and owned value —
// the math behind "price alerts" (notable recent moves) and "collection
// insights" (where the value sits). Framework-free and unit-tested; the app
// feeds these functions data pulled from IndexedDB.

export interface PricePoint {
  date: string; // YYYY-MM-DD
  priceUsd: number;
}

export interface PriceMove {
  latest: number;
  baseline: number;
  absChange: number; // latest - baseline
  pctChange: number; // fraction, e.g. 0.2 = +20%
  latestDate: string;
  baselineDate: string;
  // True when the card's history doesn't reach the cutoff, so the "move" is
  // really "since tracking started" (baselineDate), not the full window. The
  // UI must label these honestly — a 2-day-old card is not a "1m" move.
  sinceStart: boolean;
}

// A card's price move relative to a cutoff date. The baseline is the most
// recent point at or before the cutoff; if the card has no history that far
// back, it falls back to the earliest point (best we can do for a card only
// tracked recently — flagged via `sinceStart`). `points` must be sorted
// oldest-first. Null when empty.
export function priceMove(points: PricePoint[], cutoffDate: string): PriceMove | null {
  if (points.length === 0) return null;
  const latest = points[points.length - 1];
  let baseline = points[0];
  for (const p of points) {
    if (p.date <= cutoffDate) baseline = p;
    else break;
  }
  const absChange = latest.priceUsd - baseline.priceUsd;
  const pctChange = baseline.priceUsd > 0 ? absChange / baseline.priceUsd : 0;
  return {
    latest: latest.priceUsd,
    baseline: baseline.priceUsd,
    absChange,
    pctChange,
    latestDate: latest.date,
    baselineDate: baseline.date,
    sinceStart: baseline.date > cutoffDate,
  };
}

export interface MoverInput {
  cardId: number;
  points: PricePoint[];
}

export interface Mover extends PriceMove {
  cardId: number;
}

// Cards whose price moved past both thresholds since the cutoff, most-moved
// first (by absolute %). `minPct` is a fraction (0.15 = 15%); `minAbs` is a
// dollar floor so a jump from $0.02 to $0.05 (150%!) doesn't spam the list.
export function topMovers(
  inputs: MoverInput[],
  cutoffDate: string,
  opts: { minPct?: number; minAbs?: number; limit?: number } = {}
): Mover[] {
  const { minPct = 0.15, minAbs = 0.5, limit = 50 } = opts;
  const movers: Mover[] = [];
  for (const it of inputs) {
    const m = priceMove(it.points, cutoffDate);
    if (!m || m.baselineDate === m.latestDate) continue;
    if (Math.abs(m.pctChange) >= minPct && Math.abs(m.absChange) >= minAbs) {
      movers.push({ cardId: it.cardId, ...m });
    }
  }
  movers.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));
  return movers.slice(0, limit);
}

export interface ValueGroup {
  key: string;
  value: number;
  count: number; // how many items fell in this group
}

// Totals a value across items grouped by a key (e.g. archetype), skipping
// items with no key, sorted by total value descending.
export function groupValue<T>(
  items: T[],
  keyFn: (t: T) => string | null | undefined,
  valueFn: (t: T) => number
): ValueGroup[] {
  const map = new Map<string, { value: number; count: number }>();
  for (const it of items) {
    const k = keyFn(it);
    if (!k) continue;
    const g = map.get(k) ?? { value: 0, count: 0 };
    g.value += valueFn(it);
    g.count += 1;
    map.set(k, g);
  }
  return [...map]
    .map(([key, g]) => ({ key, value: g.value, count: g.count }))
    .sort((a, b) => b.value - a.value);
}

// The top `n` items by a numeric field, descending.
export function topBy<T>(items: T[], valueFn: (t: T) => number, n: number): T[] {
  return items
    .slice()
    .sort((a, b) => valueFn(b) - valueFn(a))
    .slice(0, n);
}

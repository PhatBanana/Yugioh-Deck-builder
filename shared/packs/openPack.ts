// Pure pack-opening simulation: given a set's card pool (each card tagged with
// its rarity in that set), draw a booster pack. A classic Yu-Gi-Oh! pack is 9
// cards — 8 commons and 1 "foil" slot whose rarity is weighted toward the
// lower tiers. This is a fun approximation, not the exact per-set print odds.

export interface PoolCard {
  cardId: number;
  rarity: string;
}

export interface PackConfig {
  size?: number; // cards per pack (default 9)
  foilSlots?: number; // guaranteed rare-or-better slots (default 1)
}

export function isCommon(rarity: string): boolean {
  return rarity.trim().toLowerCase() === "common";
}

// Relative likelihood of a rarity turning up in the foil slot — plain Rare is
// by far the most common, and the fancy tiers are rare. Order matters: the
// specific tiers are checked before the generic "rare" catch-all.
export function foilWeight(rarity: string): number {
  const r = rarity.toLowerCase();
  if (r.includes("secret")) return 6;
  if (r.includes("ultimate") || r.includes("ghost") || r.includes("starlight") || r.includes("collector"))
    return 1;
  if (r.includes("ultra")) return 12;
  if (r.includes("super")) return 30;
  if (r.includes("rare")) return 100;
  return 20; // some other non-common foil
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

// Draws `n` items without replacement (no duplicate cards in one pack, like a
// real booster). Only if the pool is smaller than the ask do repeats appear.
function drawUnique<T>(arr: T[], n: number, rand: () => number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  while (out.length < n && pool.length > 0) {
    const i = Math.floor(rand() * pool.length);
    out.push(pool[i]);
    pool.splice(i, 1);
  }
  while (out.length < n && arr.length > 0) out.push(pick(arr, rand));
  return out;
}

function pickFoil(foils: PoolCard[], rand: () => number): PoolCard {
  const byRarity = new Map<string, PoolCard[]>();
  for (const c of foils) {
    const arr = byRarity.get(c.rarity) ?? [];
    arr.push(c);
    byRarity.set(c.rarity, arr);
  }
  const entries = [...byRarity.entries()];
  const weights = entries.map(([r]) => foilWeight(r));
  const total = weights.reduce((s, w) => s + w, 0);
  let x = rand() * total;
  for (let i = 0; i < entries.length; i++) {
    x -= weights[i];
    if (x <= 0) return pick(entries[i][1], rand);
  }
  return pick(entries[entries.length - 1][1], rand);
}

// Draws a pack from the pool. `rand` is injectable for deterministic tests.
export function openPack(
  pool: PoolCard[],
  rand: () => number = Math.random,
  cfg: PackConfig = {}
): PoolCard[] {
  const size = cfg.size ?? 9;
  const foilSlots = cfg.foilSlots ?? 1;
  if (pool.length === 0) return [];

  const commons = pool.filter((c) => isCommon(c.rarity));
  const foils = pool.filter((c) => !isCommon(c.rarity));
  const result: PoolCard[] = [];

  for (let i = 0; i < foilSlots; i++) {
    const src = foils.length > 0 ? foils : pool;
    result.push(foils.length > 0 ? pickFoil(src, rand) : pick(src, rand));
  }
  const commonSrc = commons.length > 0 ? commons : pool;
  result.push(...drawUnique(commonSrc, size - result.length, rand));

  return result;
}

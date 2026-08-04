import { foilWeight } from "../packs/openPack";

// Prior likelihood ranking for a set code's candidate rarities. When a code
// maps to several rarities and nothing else breaks the tie, the *statistically
// likely* answer is the low tier (most physical cards in circulation are the
// cheap printing), not the alphabetically first one. Weight = relative pull
// rate; ties break toward the cheaper printing (price tracks scarcity).

export interface RarityCandidate {
  code: string;
  rarity: string;
  priceUsd?: number | null;
}

// Pull-rate weight. Reuses the pack simulator's foil-slot weights for foils,
// but Commons sit above everything — they fill 8 of a pack's 9 slots, a
// distribution foilWeight (foil-slot-only) deliberately doesn't model.
function priorWeight(rarity: string): number {
  return /common/i.test(rarity) ? 400 : foilWeight(rarity);
}

// Most-likely first. Stable: equal-weight, equal-price candidates keep their
// input order.
export function rankByPrior<T extends { rarity: string; priceUsd?: number | null }>(
  candidates: T[]
): T[] {
  return candidates
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const dw = priorWeight(b.c.rarity) - priorWeight(a.c.rarity);
      if (dw !== 0) return dw;
      // Cheaper printing = more plentiful = likelier; unknown prices last.
      const ap = a.c.priceUsd ?? Number.POSITIVE_INFINITY;
      const bp = b.c.priceUsd ?? Number.POSITIVE_INFINITY;
      if (ap !== bp) return ap - bp;
      return a.i - b.i;
    })
    .map((x) => x.c);
}

export function pickByPrior<T extends { rarity: string; priceUsd?: number | null }>(
  candidates: T[]
): T | undefined {
  return rankByPrior(candidates)[0];
}

// This rarity's share of the total prior weight — "≈93% of pulls" hints for
// the picker UI. Returns a fraction in [0, 1].
export function pullShare(rarity: string, all: { rarity: string }[]): number {
  const total = all.reduce((s, c) => s + priorWeight(c.rarity), 0);
  return total > 0 ? priorWeight(rarity) / total : 0;
}

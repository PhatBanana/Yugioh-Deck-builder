// Valuing a card's owned copies by their individual printings.
//
// A card entry has a total quantity plus an optional per-printing breakdown
// (rarity/edition copies). Each attributed copy is worth its own printing's
// price; anything not attributed to a printing falls back to the generic card
// price. So three Dark Magicians — one Secret Rare, two Commons — are valued
// as one Secret Rare price plus two Common prices, not three generic prices.

export interface ValuedCopy {
  quantity: number;
  code?: string;
  rarity?: string;
}

// Value of one card's owned copies. `priceOf` returns the per-printing price
// for a (code, rarity), or null when the printing has no known price (then the
// generic price is used for those copies). Copy quantities are clamped so the
// breakdown can never value more copies than are actually owned.
export function valueEntry(
  totalQty: number,
  copies: ValuedCopy[] | undefined,
  genericPrice: number | null,
  priceOf: (code?: string, rarity?: string) => number | null
): number {
  const generic = genericPrice ?? 0;
  if (!copies || copies.length === 0) return totalQty * generic;

  let value = 0;
  let assigned = 0;
  for (const c of copies) {
    const q = Math.max(0, Math.min(c.quantity, totalQty - assigned));
    if (q === 0) continue;
    value += q * (priceOf(c.code, c.rarity) ?? generic);
    assigned += q;
  }
  // Copies with no printing attribution are valued at the generic price.
  value += Math.max(0, totalQty - assigned) * generic;
  return value;
}

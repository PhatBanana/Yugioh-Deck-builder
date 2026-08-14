import { canonSetCode, type PrintingRef } from "@shared/scan/setCode";
import { db, type MPrintingIndex } from "../db";

// The global rarity/foil index: a set-code -> rarity lookup covering the whole
// card database, built from the full card dump during a sync (the dump already
// carries every card's set list). It lets the scanner resolve a scanned set
// code to its rarity instantly and offline, instead of a per-card network call.

// Rebuilds the index from raw (cardId, set_code, set_rarity, price) rows pulled
// off the card dump. Deduped to one row per (canonical code + rarity). Returns
// the row count written.
export async function rebuildPrintingIndex(
  rows: { cardId: number; code: string; rarity: string; price: number | null }[]
): Promise<number> {
  const byKey = new Map<string, MPrintingIndex>();
  for (const r of rows) {
    if (!r.code || !r.rarity) continue;
    const codeCanon = canonSetCode(r.code);
    // Last write wins across regions of the same printing (same rarity).
    byKey.set(`${codeCanon}|${r.rarity}`, {
      codeCanon,
      code: r.code,
      rarity: r.rarity,
      cardId: r.cardId,
      priceUsd: r.price,
    });
  }
  const records = [...byKey.values()];
  await db.transaction("rw", db.printingIndex, async () => {
    await db.printingIndex.clear();
    await db.printingIndex.bulkPut(records);
  });
  return records.length;
}

// The rarities a scanned set code could be, from the local index (offline).
// Usually one; more than one means the card was printed at several rarities in
// that set, which the visual pass / prior ranking then disambiguates. Each
// candidate carries its per-printing price — a likelihood signal (cheap =
// plentiful) and shown in the rarity picker. Empty when the index isn't built
// yet or the code is unknown.
export async function lookupRaritiesByCode(
  setCode: string | null
): Promise<(PrintingRef & { priceUsd: number | null })[]> {
  if (!setCode) return [];
  const rows = await db.printingIndex.where("codeCanon").equals(canonSetCode(setCode)).toArray();
  return rows.map((r) => ({ code: r.code, rarity: r.rarity, priceUsd: r.priceUsd }));
}

// Per-printing price key. Needs both a set code and a rarity to be specific.
export function printingPriceKey(code?: string, rarity?: string): string | null {
  return code && rarity ? `${canonSetCode(code)}|${rarity}` : null;
}

// Bulk-loads the prices for a set of (code, rarity) printings from the index,
// in one query, keyed by printingPriceKey — so a whole collection's per-copy
// value can be priced without a query per copy.
export async function loadPrintingPrices(
  printings: { code?: string; rarity?: string }[]
): Promise<Map<string, number>> {
  const pks: [string, string][] = [];
  const seen = new Set<string>();
  for (const p of printings) {
    if (!p.code || !p.rarity) continue;
    const canon = canonSetCode(p.code);
    const key = `${canon}|${p.rarity}`;
    if (!seen.has(key)) {
      seen.add(key);
      pks.push([canon, p.rarity]);
    }
  }
  const map = new Map<string, number>();
  if (pks.length === 0) return map;
  for (const row of await db.printingIndex.bulkGet(pks)) {
    if (row?.priceUsd != null) map.set(`${row.codeCanon}|${row.rarity}`, row.priceUsd);
  }
  return map;
}

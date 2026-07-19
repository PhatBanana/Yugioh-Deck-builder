import { canonSetCode, type PrintingRef } from "@shared/scan/setCode";
import { db, getSyncMeta, setSyncMeta, type MPrintingIndex } from "../db";

// The global rarity/foil index: a set-code -> rarity lookup covering the whole
// card database, built from the full card dump during a sync (the dump already
// carries every card's set list). It lets the scanner resolve a scanned set
// code to its rarity instantly and offline, instead of a per-card network call.

// Rebuilds the index from raw (cardId, set_code, set_rarity) rows pulled off
// the card dump. Deduped to one row per (canonical code + rarity). Returns the
// row count written.
export async function rebuildPrintingIndex(
  rows: { cardId: number; code: string; rarity: string }[]
): Promise<number> {
  const byKey = new Map<string, MPrintingIndex>();
  for (const r of rows) {
    if (!r.code || !r.rarity) continue;
    const codeCanon = canonSetCode(r.code);
    // Last write wins across regions of the same printing (same rarity).
    byKey.set(`${codeCanon}|${r.rarity}`, { codeCanon, code: r.code, rarity: r.rarity, cardId: r.cardId });
  }
  const records = [...byKey.values()];
  await db.transaction("rw", db.printingIndex, async () => {
    await db.printingIndex.clear();
    await db.printingIndex.bulkPut(records);
  });
  await setSyncMeta("printing_index_count", String(records.length));
  return records.length;
}

export async function printingIndexReady(): Promise<boolean> {
  return (Number(await getSyncMeta("printing_index_count")) || 0) > 0;
}

// The rarities a scanned set code could be, from the local index (offline).
// Usually one; more than one means the card was printed at several rarities in
// that set, which the visual pass can then disambiguate. Empty when the index
// isn't built yet or the code is unknown.
export async function lookupRaritiesByCode(setCode: string | null): Promise<PrintingRef[]> {
  if (!setCode) return [];
  const rows = await db.printingIndex.where("codeCanon").equals(canonSetCode(setCode)).toArray();
  return rows.map((r) => ({ code: r.code, rarity: r.rarity }));
}

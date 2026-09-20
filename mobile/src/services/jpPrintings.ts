import { canonSetCode } from "@shared/scan/setCode";
import { db, type MPrintingIndex } from "../db";
import { fetchJpPrintings } from "./dataPacks";

// The Japanese (OCG) printing index, from the downloadable data pack.
//
// The card API the app syncs from carries TCG printings only, so an OCG set
// code read off a scan — "RC04-JP001" and the like — resolved to nothing and
// left the rarity unknown. This fills that in. It lives in its own table
// because `printingIndex` is cleared and rebuilt on every card sync; sharing
// one table would silently drop the pack on the next sync.

export async function installJpPrintings(): Promise<number> {
  const pack = await fetchJpPrintings();
  const rows: MPrintingIndex[] = [];
  const seen = new Set<string>();
  for (const [password, printings] of Object.entries(pack.printings ?? {})) {
    const cardId = Number(password);
    if (!Number.isFinite(cardId)) continue;
    for (const [code, rarityIdx] of printings) {
      const rarity = pack.rarities?.[rarityIdx];
      if (!code || !rarity) continue;
      const codeCanon = canonSetCode(code);
      // The table is keyed [codeCanon+rarity], so duplicates across cards
      // would overwrite rather than error — dedupe up front so the count we
      // report is the count actually stored.
      const key = `${codeCanon}|${rarity}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ codeCanon, code, rarity, cardId, priceUsd: null });
    }
  }
  if (rows.length < 10000) throw new Error("Printing pack looks incomplete — try again later");
  await db.transaction("rw", db.jpPrintings, async () => {
    await db.jpPrintings.clear();
    await db.jpPrintings.bulkPut(rows);
  });
  return rows.length;
}

export async function removeJpPrintings(): Promise<void> {
  await db.jpPrintings.clear();
}

export async function jpPrintingsCount(): Promise<number> {
  return db.jpPrintings.count();
}

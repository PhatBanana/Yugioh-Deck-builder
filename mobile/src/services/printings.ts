import { matchPrintingCandidates } from "@shared/scan/setCode";
import { reconcileRarity, type Agreement, type FoilClass } from "@shared/scan/rarityVision";
import { rankByPrior, type RarityCandidate } from "@shared/scan/rarityPrior";
import { isFresh } from "../lib/util";
import { db, type MCardSets } from "../db";
import { addPrintingCopy, patchCollectionEntry } from "./collection";
import { lookupRaritiesByCode } from "./rarity";
import { httpGetJson } from "./http";

// A card's printings (set code / name / rarity / set price), cached locally
// and fetched from the YGOPRODeck card API on first use. The bulk card sync
// strips set data to keep the local DB small, so this fills it in per card.

const REFRESH_AFTER_DAYS = 30;

interface ApiCardSets {
  data?: {
    card_sets?: {
      set_name?: string;
      set_code?: string;
      set_rarity?: string;
      set_price?: string;
    }[];
  }[];
}

export async function getCardPrintings(cardId: number): Promise<MCardSets["sets"]> {
  const cached = await db.cardSets.get(cardId);
  if (cached && (isFresh(cached.fetchedAt, REFRESH_AFTER_DAYS) || cached.sets.length > 0))
    return cached.sets;

  try {
    const json = await httpGetJson<ApiCardSets>(
      `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${cardId}`
    );
    const sets = (json.data?.[0]?.card_sets ?? [])
      .filter((s) => s.set_code)
      .map((s) => {
        const price = Number.parseFloat(s.set_price ?? "");
        return {
          code: s.set_code!,
          name: s.set_name ?? "",
          rarity: s.set_rarity ?? "",
          price: Number.isFinite(price) && price > 0 ? price : null,
        };
      });
    await db.cardSets.put({ cardId, fetchedAt: new Date().toISOString(), sets });
    return sets;
  } catch {
    // Offline / API failure: whatever we had cached (possibly nothing).
    return cached?.sets ?? [];
  }
}

// Sets (or clears) which printing the owned copies are. No-op when the card
// isn't in the collection — mirrors setCondition.
export async function setPrinting(
  cardId: number,
  printing: { code: string; rarity: string } | undefined
): Promise<void> {
  await patchCollectionEntry(cardId, { printing });
}

// What a scan managed to read off a card, resolved against its printings.
export interface ResolvedPrinting {
  code?: string; // the set code of the printing actually filed
  rarity?: string;
  edition?: string;
  agreement?: Agreement; // how the set code and the visual foil pass lined up
  foil?: FoilClass;
  // True when the filed rarity is a best guess among several the code allows.
  ambiguous?: boolean;
  // Every rarity the code could be (prior-ranked), for the picker UI.
  candidates?: RarityCandidate[];
}

// The rarities a scanned set code could be, prior-ranked (most likely first).
// Prefers the global offline index (built on sync); falls back to a per-card
// network fetch if the index isn't built yet. Both paths carry the printing's
// own price, a likelihood/display signal.
export async function raritiesForCode(cardId: number, setCode: string): Promise<RarityCandidate[]> {
  const indexed = await lookupRaritiesByCode(setCode);
  if (indexed.length > 0) return rankByPrior(indexed);
  const sets = await getCardPrintings(cardId);
  const matched = matchPrintingCandidates(setCode, sets);
  return rankByPrior(
    matched.map((m) => ({
      code: m.code,
      rarity: m.rarity,
      priceUsd: sets.find((s) => s.code === m.code && s.rarity === m.rarity)?.price ?? null,
    }))
  );
}

// Given a set code and/or edition read off a card while scanning — plus the
// optional visual foil class and any on-device model rarity — resolves the
// copy's printing and stamps it onto the collection entry. The set code leads;
// the model (if present) or the foil pass then confirms it, flags a conflict,
// or breaks a tie when a code maps to two rarities. Best-effort and only writes
// when the card is in the collection. Returns what it applied for the scan UI.
export async function applyScannedPrinting(
  cardId: number,
  setCode: string | null,
  edition: string | undefined,
  opts: { foil?: FoilClass; modelRarity?: string | null } = {}
): Promise<ResolvedPrinting> {
  let chosen: RarityCandidate | undefined;
  let agreement: Agreement | undefined;
  let candidates: RarityCandidate[] = [];

  if (setCode) {
    try {
      candidates = await raritiesForCode(cardId, setCode); // prior-ranked
      if (candidates.length > 0) {
        const rarities = candidates.map((c) => c.rarity);
        if (opts.modelRarity && rarities.includes(opts.modelRarity)) {
          chosen = candidates.find((c) => c.rarity === opts.modelRarity);
          agreement = "confirmed";
        } else if (opts.foil) {
          const verdict = reconcileRarity(rarities, opts.foil);
          agreement = verdict.agreement;
          if (verdict.rarity) chosen = candidates.find((c) => c.rarity === verdict.rarity);
        }
        // No visual help (or it abstained): a single distinct rarity is a sure
        // thing; several means file the statistically likely one as a marked
        // guess — never silently, and never "whatever sorted first".
        if (!chosen) {
          chosen = candidates[0];
          if (new Set(rarities).size > 1) agreement ??= "unknown";
        }
      }
    } catch {
      // Offline / lookup failure — keep whatever edition we read.
    }
  }

  const distinct = new Set(candidates.map((c) => c.rarity)).size;
  const ambiguous = distinct > 1 && agreement !== "confirmed";

  // Attribute this one scanned copy to its printing in the breakdown (the
  // commit already bumped the card's total quantity).
  if (chosen || edition) {
    await addPrintingCopy(
      cardId,
      { code: chosen?.code, rarity: chosen?.rarity, edition },
      1,
      ambiguous
    );
  }
  return {
    code: chosen?.code,
    rarity: chosen?.rarity,
    edition,
    agreement,
    foil: opts.foil,
    ambiguous: ambiguous || undefined,
    candidates: distinct > 1 ? candidates : undefined,
  };
}

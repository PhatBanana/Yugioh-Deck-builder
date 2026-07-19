import { isFresh } from "../lib/util";
import { db, type MCardSets } from "../db";
import { patchCollectionEntry } from "./collection";
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

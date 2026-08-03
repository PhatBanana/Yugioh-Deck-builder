import { openPack, type PoolCard } from "@shared/packs/openPack";
import { db } from "../db";
import { getSetCardIds } from "./sets";

// A card as it can appear in a pack of a given set: its rarity in that set plus
// display/value data.
export interface PackCard extends PoolCard {
  name: string;
  img: string | null;
  price: number | null;
}

// Builds a set's rarity pool offline from the printing index (the same data the
// scanner's rarity lookup uses), joined with card names/images. Each row is one
// (card, rarity-in-this-set) entry — a card printed at two rarities appears
// twice, which is what we want for pack odds.
export async function getSetPool(setName: string): Promise<PackCard[]> {
  const [set, contents] = await Promise.all([db.sets.get(setName), getSetCardIds(setName)]);
  if (!contents || contents.cardIds.length === 0) return [];

  // Without the set's code prefix there's no way to pick THIS set's printings —
  // an unfiltered pool would mix in every reprint of every card across all
  // sets (wrong rarities, wrong prices). Bail to the "no rarity data" state.
  if (!set?.code) return [];
  const prefix = `${set.code.toUpperCase()}-`;
  const rows = await db.printingIndex.where("cardId").anyOf(contents.cardIds).toArray();
  const inSet = rows.filter((r) => r.code.toUpperCase().startsWith(prefix));
  if (inSet.length === 0) return [];

  const ids = [...new Set(inSet.map((r) => r.cardId))];
  const cards = await db.cards.bulkGet(ids);
  const byId = new Map(ids.map((id, i) => [id, cards[i]]));

  return inSet.map((r) => {
    const c = byId.get(r.cardId);
    return {
      cardId: r.cardId,
      rarity: r.rarity,
      name: c?.name ?? `#${r.cardId}`,
      img: c?.img ?? null,
      price: r.priceUsd ?? c?.price ?? null,
    };
  });
}

// Opens one pack from a set pool. Thin wrapper so the UI needn't import the
// shared module directly; returns the full PackCard objects that were drawn.
export function drawPack(pool: PackCard[]): PackCard[] {
  return openPack(pool) as PackCard[];
}

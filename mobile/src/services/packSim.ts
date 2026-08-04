import { openPack, type PoolCard } from "@shared/packs/openPack";
import { profileForSetDate, type PackProfile } from "@shared/packs/profiles";
import { db } from "../db";
import { getSetCardIds } from "./sets";

// A card as it can appear in a pack of a given set: its rarity in that set plus
// display/value data.
export interface PackCard extends PoolCard {
  name: string;
  img: string | null;
  price: number | null;
}

// A set's simulated-pack setup: its card pool plus the era odds profile picked
// from the set's release date.
export interface SetPool {
  cards: PackCard[];
  profile: PackProfile;
}

// Builds a set's rarity pool offline from the printing index (the same data the
// scanner's rarity lookup uses), joined with card names/images. Each row is one
// (card, rarity-in-this-set) entry — a card printed at two rarities appears
// twice, which is what we want for pack odds.
export async function getSetPool(setName: string): Promise<SetPool> {
  const [set, contents] = await Promise.all([db.sets.get(setName), getSetCardIds(setName)]);
  const profile = profileForSetDate(set?.date);
  if (!contents || contents.cardIds.length === 0) return { cards: [], profile };

  // Without the set's code prefix there's no way to pick THIS set's printings —
  // an unfiltered pool would mix in every reprint of every card across all
  // sets (wrong rarities, wrong prices). Bail to the "no rarity data" state.
  if (!set?.code) return { cards: [], profile };
  const prefix = `${set.code.toUpperCase()}-`;
  const rows = await db.printingIndex.where("cardId").anyOf(contents.cardIds).toArray();
  const inSet = rows.filter((r) => r.code.toUpperCase().startsWith(prefix));
  if (inSet.length === 0) return { cards: [], profile };

  const ids = [...new Set(inSet.map((r) => r.cardId))];
  const cards = await db.cards.bulkGet(ids);
  const byId = new Map(ids.map((id, i) => [id, cards[i]]));

  const packCards = inSet.map((r) => {
    const c = byId.get(r.cardId);
    return {
      cardId: r.cardId,
      rarity: r.rarity,
      name: c?.name ?? `#${r.cardId}`,
      img: c?.img ?? null,
      price: r.priceUsd ?? c?.price ?? null,
    };
  });
  return { cards: packCards, profile };
}

// Opens one pack from a set pool with the set's era odds. Thin wrapper so the
// UI needn't import the shared module directly; returns the full PackCard
// objects that were drawn.
export function drawPack(pool: SetPool): PackCard[] {
  return openPack(pool.cards, Math.random, { profile: pool.profile }) as PackCard[];
}

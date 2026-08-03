import { db } from "../db";
import { recordPricePoints } from "./priceHistory";

export async function isWishlisted(cardId: number): Promise<boolean> {
  return (await db.wishlist.get(cardId)) != null;
}

export async function toggleWishlist(cardId: number): Promise<boolean> {
  if (await isWishlisted(cardId)) {
    await db.wishlist.delete(cardId);
    return false;
  }
  await db.wishlist.put({ cardId });
  // Wishlisted cards are price-tracked too — start their history now.
  recordPricePoints([cardId]).catch(() => {});
  return true;
}

export interface WishlistItem {
  cardId: number;
  name: string;
  img: string | null;
  price: number; // 0 when unknown
  owned: number;
}

// Wishlisted cards joined with their price/name/owned, for the budget planner.
export async function getWishlistItems(): Promise<WishlistItem[]> {
  const ids = (await db.wishlist.toArray()).map((w) => w.cardId);
  const [cards, coll] = await Promise.all([db.cards.bulkGet(ids), db.collection.bulkGet(ids)]);
  return ids.map((id, i) => ({
    cardId: id,
    name: cards[i]?.name ?? `#${id}`,
    img: cards[i]?.img ?? null,
    price: cards[i]?.price ?? 0,
    owned: coll[i]?.quantity ?? 0,
  }));
}

// Adds many cards to the wishlist, skipping ones already on it. Returns how
// many were newly added.
export async function addManyToWishlist(cardIds: number[]): Promise<number> {
  let added = 0;
  await db.transaction("rw", db.wishlist, async () => {
    for (const id of cardIds) {
      if (!(await db.wishlist.get(id))) {
        await db.wishlist.put({ cardId: id });
        added++;
      }
    }
  });
  if (added > 0) recordPricePoints(cardIds).catch(() => {});
  return added;
}

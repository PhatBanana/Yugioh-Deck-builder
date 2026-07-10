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

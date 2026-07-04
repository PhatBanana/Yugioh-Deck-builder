import { db } from "../db";

export async function isWishlisted(cardId: number): Promise<boolean> {
  return (await db.wishlist.get(cardId)) != null;
}

export async function toggleWishlist(cardId: number): Promise<boolean> {
  if (await isWishlisted(cardId)) {
    await db.wishlist.delete(cardId);
    return false;
  }
  await db.wishlist.put({ cardId });
  return true;
}

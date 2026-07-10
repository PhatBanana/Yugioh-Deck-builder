import { db, type MPricePoint } from "../db";

// Points older than this are pruned so the table can't grow unbounded
// (365 days × a few hundred tracked cards is still well under a megabyte).
const KEEP_DAYS = 365;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Records today's price for the given cards — one row per card per day, last
// write wins, so a card-DB sync later the same day refreshes the point.
// Cards with no known price are skipped.
export async function recordPricePoints(cardIds: number[]): Promise<void> {
  if (cardIds.length === 0) return;
  const date = today();
  const cards = await db.cards.bulkGet(cardIds);
  const points: MPricePoint[] = [];
  for (const c of cards) {
    if (c && c.price != null) points.push({ cardId: c.id, date, priceUsd: c.price });
  }
  if (points.length > 0) await db.priceHistory.bulkPut(points);
}

// Snapshots every tracked card (owned or wishlisted). Called on app launch and
// after a card-database sync — the only time local prices actually change —
// then prunes points past the retention window.
export async function recordPriceSnapshots(): Promise<void> {
  const [owned, wished] = await Promise.all([
    db.collection.toArray(),
    db.wishlist.toArray(),
  ]);
  const ids = new Set<number>();
  for (const e of owned) if (e.quantity > 0) ids.add(e.cardId);
  for (const e of wished) ids.add(e.cardId);
  await recordPricePoints([...ids]);

  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  // date isn't independently indexed (the PK is [cardId+date]); a full scan is
  // fine at this table's size.
  await db.priceHistory.filter((p) => p.date < cutoff).delete();
}

// A card's tracked price points, oldest first.
export async function getPriceHistory(cardId: number): Promise<MPricePoint[]> {
  return db.priceHistory.where("cardId").equals(cardId).sortBy("date");
}

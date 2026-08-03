import { DAY_MS, todayISO } from "../lib/util";
import { db, getSyncMeta, setSyncMeta, type MPricePoint } from "../db";

// Points older than this are pruned so the table can't grow unbounded. Every
// card gets a point per sync (not per day), and syncs are infrequent, so a
// year of history stays manageable.
const KEEP_DAYS = 365;

// Records today's price for the given cards — one row per card per day, last
// write wins, so a card-DB sync later the same day refreshes the point.
// Cards with no known price are skipped.
export async function recordPricePoints(cardIds: number[]): Promise<void> {
  if (cardIds.length === 0) return;
  const date = todayISO();
  const cards = await db.cards.bulkGet(cardIds);
  const points: MPricePoint[] = [];
  for (const c of cards) {
    if (c && c.price != null) points.push({ cardId: c.id, date, priceUsd: c.price });
  }
  if (points.length > 0) await db.priceHistory.bulkPut(points);
}

// Records today's price for *every* card that has one — called on a card
// sync (the only time prices change), so a card you add later already has
// history back to your first sync, not just from when you added it. Written
// in chunks to avoid one giant transaction. The yearly prune in
// recordPriceSnapshots keeps the table bounded.
export async function recordAllCardPrices(
  cards: { id: number; price: number | null }[]
): Promise<void> {
  const date = todayISO();
  const points: MPricePoint[] = [];
  for (const c of cards) {
    if (c.price != null) points.push({ cardId: c.id, date, priceUsd: c.price });
  }
  for (let i = 0; i < points.length; i += 2000) {
    await db.priceHistory.bulkPut(points.slice(i, i + 2000));
  }
}

// Snapshots every tracked card (owned or wishlisted), then prunes points past
// the retention window. Called on app launch (skipped when today's snapshot
// already ran — prices only change on sync) and after a card-database sync
// (force=true, since that's when prices actually change).
export async function recordPriceSnapshots(force = false): Promise<void> {
  if (!force && (await getSyncMeta("price_snapshot_date")) === todayISO()) return;

  const [owned, wished] = await Promise.all([
    db.collection.toArray(),
    db.wishlist.toArray(),
  ]);
  const ids = new Set<number>();
  for (const e of owned) if (e.quantity > 0) ids.add(e.cardId);
  for (const e of wished) ids.add(e.cardId);
  await recordPricePoints([...ids]);

  const cutoff = new Date(Date.now() - KEEP_DAYS * DAY_MS).toISOString().slice(0, 10);
  // `date` is indexed (v8), so this prunes via a range query rather than a
  // full scan — important now that a sync records every card's price.
  await db.priceHistory.where("date").below(cutoff).delete();
  await setSyncMeta("price_snapshot_date", todayISO());
}

// A card's tracked price points, oldest first.
export async function getPriceHistory(cardId: number): Promise<MPricePoint[]> {
  return db.priceHistory.where("cardId").equals(cardId).sortBy("date");
}

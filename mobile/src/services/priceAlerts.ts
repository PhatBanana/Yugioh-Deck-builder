import { topMovers, type Mover, type MoverInput } from "@shared/collection/insights";
import { DAY_MS } from "../lib/util";
import { db } from "../db";

// Notable recent price moves on the cards you care about (owned or wishlisted),
// from the recorded price history. "Notable" = past both a percentage and a
// dollar floor, so penny cards don't spam the list.

export interface PriceAlert extends Mover {
  name: string;
  img: string | null;
  owned: boolean;
  wishlisted: boolean;
}

export interface PriceAlertResult {
  windowDays: number;
  alerts: PriceAlert[];
}

export async function getPriceAlerts(windowDays = 30): Promise<PriceAlertResult> {
  const [owned, wished] = await Promise.all([db.collection.toArray(), db.wishlist.toArray()]);
  const ownedIds = new Set(owned.filter((e) => e.quantity > 0).map((e) => e.cardId));
  const wishIds = new Set(wished.map((w) => w.cardId));
  const ids = [...new Set([...ownedIds, ...wishIds])];
  if (ids.length === 0) return { windowDays, alerts: [] };

  // One indexed query for every tracked card's points, then group per card.
  const points = await db.priceHistory.where("cardId").anyOf(ids).toArray();
  const byCard = new Map<number, { date: string; priceUsd: number }[]>();
  for (const p of points) {
    const arr = byCard.get(p.cardId) ?? [];
    arr.push({ date: p.date, priceUsd: p.priceUsd });
    byCard.set(p.cardId, arr);
  }
  for (const arr of byCard.values()) arr.sort((a, b) => a.date.localeCompare(b.date));

  const inputs: MoverInput[] = ids.map((id) => ({ cardId: id, points: byCard.get(id) ?? [] }));
  const cutoff = new Date(Date.now() - windowDays * DAY_MS).toISOString().slice(0, 10);
  const movers = topMovers(inputs, cutoff, { minPct: 0.15, minAbs: 0.5 });

  const cards = await db.cards.bulkGet(movers.map((m) => m.cardId));
  const alerts: PriceAlert[] = movers.map((m, i) => ({
    ...m,
    name: cards[i]?.name ?? `#${m.cardId}`,
    img: cards[i]?.img ?? null,
    owned: ownedIds.has(m.cardId),
    wishlisted: wishIds.has(m.cardId),
  }));
  return { windowDays, alerts };
}

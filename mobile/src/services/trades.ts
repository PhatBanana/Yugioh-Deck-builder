import { db, type MTrade } from "../db";
import { addOwned } from "./collection";

// Trade log: what left the collection, what came in, valued at log time so
// the history keeps its numbers even as prices move.

export interface TradeSide {
  cardId: number;
  quantity: number;
}

async function valueOf(side: TradeSide[]): Promise<number> {
  const cards = await db.cards.bulkGet(side.map((s) => s.cardId));
  return side.reduce((sum, s, i) => sum + (cards[i]?.price ?? 0) * s.quantity, 0);
}

// Logs a trade and (by default) applies it to the collection: given cards
// decrement, received cards increment.
export async function logTrade(
  gave: TradeSide[],
  got: TradeSide[],
  options?: { note?: string; applyToCollection?: boolean }
): Promise<MTrade> {
  const trade: MTrade = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString(),
    gave,
    got,
    gaveValueUsd: await valueOf(gave),
    gotValueUsd: await valueOf(got),
    note: options?.note?.trim() || undefined,
  };
  await db.trades.put(trade);

  if (options?.applyToCollection !== false) {
    for (const s of gave) await addOwned(s.cardId, -s.quantity);
    for (const s of got) await addOwned(s.cardId, s.quantity);
  }
  return trade;
}

export async function listTrades(): Promise<MTrade[]> {
  const rows = await db.trades.toArray();
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

export async function deleteTrade(id: string): Promise<void> {
  await db.trades.delete(id);
}

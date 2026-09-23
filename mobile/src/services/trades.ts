import { uid } from "../lib/util";
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

// Tables a trade touches: addOwned records a price point on the way.
const TRADE_TABLES = () => [db.trades, db.collection, db.cards, db.priceHistory];

// Logs a trade and (by default) applies it to the collection: given cards
// decrement, received cards increment.
export async function logTrade(
  gave: TradeSide[],
  got: TradeSide[],
  options?: { note?: string; applyToCollection?: boolean }
): Promise<MTrade> {
  const trade: MTrade = {
    id: uid(),
    date: new Date().toISOString(),
    gave,
    got,
    gaveValueUsd: await valueOf(gave),
    gotValueUsd: await valueOf(got),
    note: options?.note?.trim() || undefined,
  };
  // One transaction for the trade row and every collection change — a failure
  // partway can't leave a recorded trade with only some cards moved. (cards +
  // priceHistory are in scope because addOwned records a price point.)
  await db.transaction("rw", TRADE_TABLES(), async () => {
    const applied: { cardId: number; delta: number }[] = [];
    if (options?.applyToCollection !== false) {
      for (const s of gave) applied.push(await move(s.cardId, -s.quantity));
      for (const s of got) applied.push(await move(s.cardId, s.quantity));
    }
    trade.applied = applied.filter((a) => a.delta !== 0);
    await db.trades.put(trade);
  });
  return trade;
}


// Moves a card's quantity and reports the change that actually happened —
// addOwned clamps to 0..99, so the requested delta isn't always the real one.
async function move(cardId: number, delta: number): Promise<{ cardId: number; delta: number }> {
  const before = (await db.collection.get(cardId))?.quantity ?? 0;
  const after = await addOwned(cardId, delta);
  return { cardId, delta: after - before };
}

export async function listTrades(): Promise<MTrade[]> {
  const rows = await db.trades.toArray();
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

// Removes a trade from the log. With `revert`, also undoes the collection
// changes it recorded, in reverse order — "undo" used to delete only the log
// row, leaving the traded cards moved. Trades logged before `applied` existed
// have nothing to reverse and are just removed.
export async function deleteTrade(id: string, options?: { revert?: boolean }): Promise<void> {
  await db.transaction("rw", TRADE_TABLES(), async () => {
    const trade = await db.trades.get(id);
    if (!trade) return;
    if (options?.revert && trade.applied) {
      for (const a of [...trade.applied].reverse()) await addOwned(a.cardId, -a.delta);
    }
    await db.trades.delete(id);
  });
}

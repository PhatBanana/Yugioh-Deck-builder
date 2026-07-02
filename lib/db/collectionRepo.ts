import { db } from "../db";

export interface CollectionEntry {
  cardId: number;
  quantity: number;
}

export function getCollection(): CollectionEntry[] {
  const rows = db
    .prepare("SELECT card_id as cardId, quantity FROM user_collection WHERE quantity > 0")
    .all() as unknown as CollectionEntry[];
  return rows;
}

export function getOwnedMap(): Record<number, number> {
  const map: Record<number, number> = {};
  for (const { cardId, quantity } of getCollection()) {
    map[cardId] = quantity;
  }
  return map;
}

export interface CollectionStats {
  uniqueCards: number;
  totalCopies: number;
  estimatedValueUsd: number;
}

export function getCollectionStats(): CollectionStats {
  const row = db
    .prepare(
      `SELECT COUNT(*) as uniqueCards,
              COALESCE(SUM(uc.quantity), 0) as totalCopies,
              COALESCE(SUM(uc.quantity * COALESCE(c.price_usd, 0)), 0) as estimatedValueUsd
       FROM user_collection uc
       JOIN cards c ON c.id = uc.card_id
       WHERE uc.quantity > 0`
    )
    .get() as unknown as CollectionStats;
  return row;
}

export interface CollectionExportEntry {
  cardId: number;
  name: string;
  quantity: number;
}

export function getCollectionForExport(): CollectionExportEntry[] {
  return db
    .prepare(
      `SELECT uc.card_id as cardId, c.name, uc.quantity
       FROM user_collection uc
       JOIN cards c ON c.id = uc.card_id
       WHERE uc.quantity > 0
       ORDER BY c.name ASC`
    )
    .all() as unknown as CollectionExportEntry[];
}

export type BulkImportMode = "add" | "set";

// Applies a bulk import in one transaction. "add" increments existing
// quantities (capped at 99); "set" overwrites them.
export function bulkUpsertOwnedQuantities(
  entries: CollectionEntry[],
  mode: BulkImportMode
): number {
  const now = new Date().toISOString();
  const stmt = db.prepare(
    mode === "add"
      ? `INSERT INTO user_collection (card_id, quantity, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(card_id) DO UPDATE SET
           quantity = MIN(99, user_collection.quantity + excluded.quantity),
           updated_at = excluded.updated_at`
      : `INSERT INTO user_collection (card_id, quantity, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(card_id) DO UPDATE SET
           quantity = excluded.quantity, updated_at = excluded.updated_at`
  );
  db.exec("BEGIN");
  try {
    for (const { cardId, quantity } of entries) {
      stmt.run(cardId, quantity, now);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return entries.length;
}

export function upsertOwnedQuantity(cardId: number, quantity: number): CollectionEntry {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error("quantity must be a non-negative integer");
  }
  const now = new Date().toISOString();
  if (quantity === 0) {
    db.prepare("DELETE FROM user_collection WHERE card_id = ?").run(cardId);
  } else {
    db.prepare(
      `INSERT INTO user_collection (card_id, quantity, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(card_id) DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at`
    ).run(cardId, quantity, now);
  }
  return { cardId, quantity };
}

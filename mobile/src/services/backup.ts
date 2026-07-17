import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { collectionToCsv } from "@shared/collection/csv";
import {
  db,
  type MCollectionEntry,
  type MDeck,
  type MPricePoint,
  type MValueSnapshot,
} from "../db";

// Full user-data backup as a single JSON document. The card database itself
// is excluded — it's re-downloadable — so backups stay small and portable.

export interface BackupFile {
  app: "ygo-deck-builder";
  version: 1;
  exportedAt: string;
  collection: MCollectionEntry[];
  wishlist: number[];
  decks: MDeck[];
  valueHistory: MValueSnapshot[];
  priceHistory: MPricePoint[];
}

// Gets a text file to the user: Android opens the system share sheet (user
// picks the destination — Files, Drive, …); the browser downloads normally.
// Returns false only on real failure (dismissing the share sheet is fine).
export async function exportTextFile(name: string, mime: string, content: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const file = await Filesystem.writeFile({
        path: name,
        data: content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({ title: name, url: file.uri, dialogTitle: `Save ${name} to…` });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      return /cancel/i.test(msg); // dismissed ≠ failed
    }
  }
  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

// Collection as a spreadsheet-friendly CSV (one row per owned card).
export async function createCollectionCsv(): Promise<string> {
  const entries = (await db.collection.toArray()).filter((e) => e.quantity > 0);
  const cards = await db.cards.bulkGet(entries.map((e) => e.cardId));
  const rows = entries.map((e, i) => ({
    name: cards[i]?.name ?? `#${e.cardId}`,
    quantity: e.quantity,
    condition: e.condition ?? null,
    printingCode: e.printing?.code ?? null,
    rarity: e.printing?.rarity ?? null,
    priceUsd: cards[i]?.price ?? null,
    tags: e.tags ?? null,
  }));
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return collectionToCsv(rows);
}

export async function createBackup(): Promise<BackupFile> {
  const [collection, wishlist, decks, valueHistory, priceHistory] = await Promise.all([
    db.collection.toArray(),
    db.wishlist.toArray(),
    db.decks.toArray(),
    db.valueHistory.toArray(),
    db.priceHistory.toArray(),
  ]);
  return {
    app: "ygo-deck-builder",
    version: 1,
    exportedAt: new Date().toISOString(),
    collection,
    wishlist: wishlist.map((w) => w.cardId),
    decks,
    valueHistory,
    priceHistory,
  };
}

export interface RestoreSummary {
  cards: number; // collection entries
  decks: number;
  wishlist: number;
}

// Parses and validates a pasted/loaded backup without applying it, so the UI
// can confirm what's about to be restored. Throws with a readable message.
export function parseBackup(json: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("That isn't valid JSON");
  }
  if (typeof raw !== "object" || raw == null || (raw as { app?: unknown }).app !== "ygo-deck-builder") {
    throw new Error("Not a YGO Deck Builder backup");
  }
  const b = raw as Partial<BackupFile>;
  return {
    app: "ygo-deck-builder",
    version: 1,
    exportedAt: typeof b.exportedAt === "string" ? b.exportedAt : "",
    collection: Array.isArray(b.collection)
      ? b.collection.filter((e) => typeof e?.cardId === "number" && typeof e?.quantity === "number")
      : [],
    wishlist: Array.isArray(b.wishlist) ? b.wishlist.filter((id) => typeof id === "number") : [],
    decks: Array.isArray(b.decks)
      ? b.decks.filter((d) => typeof d?.id === "string" && Array.isArray(d?.cards))
      : [],
    valueHistory: Array.isArray(b.valueHistory)
      ? b.valueHistory.filter((v) => typeof v?.date === "string")
      : [],
    priceHistory: Array.isArray(b.priceHistory)
      ? b.priceHistory.filter((p) => typeof p?.cardId === "number" && typeof p?.date === "string")
      : [],
  };
}

// Replaces collection/wishlist/decks with the backup's contents and merges
// the history tables (a restore should never erase newer recorded days).
export async function restoreBackup(backup: BackupFile): Promise<RestoreSummary> {
  await db.transaction(
    "rw",
    [db.collection, db.wishlist, db.decks, db.valueHistory, db.priceHistory],
    async () => {
      await db.collection.clear();
      await db.collection.bulkPut(backup.collection);
      await db.wishlist.clear();
      await db.wishlist.bulkPut(backup.wishlist.map((cardId) => ({ cardId })));
      await db.decks.clear();
      await db.decks.bulkPut(backup.decks);
      await db.valueHistory.bulkPut(backup.valueHistory);
      await db.priceHistory.bulkPut(backup.priceHistory);
    }
  );
  return {
    cards: backup.collection.length,
    decks: backup.decks.length,
    wishlist: backup.wishlist.length,
  };
}

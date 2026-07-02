import { fetchAllCards, fetchDbVersion } from "../ygoprodeck/client";
import { upsertCards, countCards } from "../db/cardsRepo";
import { getSyncMeta, setSyncMeta } from "../db/syncMetaRepo";

const CACHE_WINDOW_MS = 2 * 24 * 60 * 60 * 1000; // 2 days, per YGOPRODeck's own guidance

export interface CardSyncResult {
  skipped: boolean;
  reason?: string;
  cardsUpserted: number;
  databaseVersion: string | null;
}

export async function syncCards(opts: { force?: boolean } = {}): Promise<CardSyncResult> {
  const storedVersion = getSyncMeta("cards_db_version");
  const lastSyncedAt = getSyncMeta("cards_last_synced_at");

  const version = await fetchDbVersion();

  const withinCacheWindow =
    lastSyncedAt !== null && Date.now() - new Date(lastSyncedAt).getTime() < CACHE_WINDOW_MS;

  if (
    !opts.force &&
    storedVersion === version.database_version &&
    withinCacheWindow &&
    countCards() > 0
  ) {
    return {
      skipped: true,
      reason: "up_to_date",
      cardsUpserted: 0,
      databaseVersion: storedVersion,
    };
  }

  const { data } = await fetchAllCards();
  const cardsUpserted = upsertCards(data);

  setSyncMeta("cards_db_version", version.database_version);
  setSyncMeta("cards_last_synced_at", new Date().toISOString());

  return { skipped: false, cardsUpserted, databaseVersion: version.database_version };
}

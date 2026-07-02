import { countMetaDecks, clearStaticSnapshotDecks } from "../../db/metaDecksRepo";
import { getSyncMeta } from "../../db/syncMetaRepo";
import { scrapeMetaDecks } from "./scrape";
import { seedStaticSnapshot } from "./staticSnapshot";
import { storeScrapedDecks } from "./store";
import { validateScrapedDecks } from "./validate";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export interface MetaDeckSyncResult {
  source: "scrape" | "static_snapshot_fallback" | "already_running";
  deckCount: number;
}

// In-process lock so concurrent requests (or a manual sync during a
// background refresh) can't trigger parallel scrapes of the same site.
// Cached on `global` to survive Next.js dev-server module reloads.
declare global {
  var __ygohMetaDeckSync: Promise<MetaDeckSyncResult> | undefined;
}

// Fetches the live YGOPRODeck tournament meta decks page, validates the
// result, and stores it. Falls back to the bundled static snapshot if the
// scrape fails or the page structure has changed enough to fail validation.
export async function syncMetaDecks(): Promise<MetaDeckSyncResult> {
  if (global.__ygohMetaDeckSync) {
    // A sync is already in flight — share its result instead of starting another.
    return global.__ygohMetaDeckSync;
  }
  const run = (async (): Promise<MetaDeckSyncResult> => {
    try {
      const scraped = await scrapeMetaDecks();
      validateScrapedDecks(scraped);
      storeScrapedDecks(scraped);
      clearStaticSnapshotDecks();
      return { source: "scrape", deckCount: scraped.length };
    } catch (err) {
      console.warn("[meta-decks] scrape failed, falling back to static snapshot:", err);
      const { deckCount } = seedStaticSnapshot();
      return { source: "static_snapshot_fallback", deckCount };
    } finally {
      global.__ygohMetaDeckSync = undefined;
    }
  })();
  global.__ygohMetaDeckSync = run;
  return run;
}

// Ensures meta_decks is never empty for a fresh install — seeds the static
// snapshot synchronously if nothing has ever been loaded yet.
export function ensureMetaDecksSeeded(): void {
  if (countMetaDecks() === 0) {
    seedStaticSnapshot();
  }
}

// Fire-and-forget refresh: if the cached meta decks are more than 24h old,
// kick off a sync in the background without blocking the caller.
export function maybeRefreshMetaDecksInBackground(): void {
  const lastSyncedAt = getSyncMeta("meta_decks_last_synced_at");
  const isStale = !lastSyncedAt || Date.now() - new Date(lastSyncedAt).getTime() > STALE_AFTER_MS;
  if (isStale) {
    syncMetaDecks().catch((err) => console.warn("[meta-decks] background refresh failed:", err));
  }
}

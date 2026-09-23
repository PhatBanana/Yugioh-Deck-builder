import { useSyncExternalStore } from "react";
import { toast } from "../components/Toaster";
import { syncCards } from "../services/cardSync";
import { syncMetaDecks } from "../services/metaDecks";
import { refreshAlertCount } from "../services/priceAlerts";
import { invalidateCandidateCache } from "../services/scanner";

// The full card + meta-deck sync, with its progress held at module level.
//
// It used to live inside the Cards page, which then had to lend it to the
// backup sheet as props. With re-sync now in the app-wide Settings sheet
// (reachable from any tab), two places show the same run — the Welcome screen
// and Settings — so the progress has to be shared rather than owned by one.

let progress: string | null = null;
const listeners = new Set<() => void>();

function set(next: string | null) {
  progress = next;
  for (const l of listeners) l();
}

export async function runFullSync(): Promise<void> {
  if (progress) return; // one run at a time, whichever button started it
  set("Starting…");
  try {
    const cards = await syncCards(set);
    invalidateCandidateCache();
    refreshAlertCount().catch(() => {}); // prices changed — refresh the badge
    if (cards.rarityIndexFailed) {
      toast("Rarity index couldn't be built — scan rarities may be slow until the next sync", "error");
    }
    set("Updating meta decks…");
    const decks = await syncMetaDecks(set);
    toast(
      cards.skipped
        ? `Cards already current · ${decks.deckCount} meta decks (${decks.source})`
        : `Synced ${cards.cardCount.toLocaleString()} cards · ${decks.deckCount} meta decks`,
      "success"
    );
  } catch (err) {
    toast(`Sync failed: ${err instanceof Error ? err.message : err}`, "error");
  } finally {
    set(null);
  }
}

/** Current sync progress message, or null when no sync is running. */
export function useSyncProgress(): string | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => progress
  );
}

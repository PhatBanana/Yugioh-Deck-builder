import { NextResponse } from "next/server";
import { countCards } from "../../../lib/db/cardsRepo";
import { countMetaDecks } from "../../../lib/db/metaDecksRepo";
import { getSyncMeta } from "../../../lib/db/syncMetaRepo";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    cards: {
      count: countCards(),
      lastSyncedAt: getSyncMeta("cards_last_synced_at"),
      databaseVersion: getSyncMeta("cards_db_version"),
    },
    metaDecks: {
      count: countMetaDecks(),
      lastSyncedAt: getSyncMeta("meta_decks_last_synced_at"),
      source: getSyncMeta("meta_decks_last_source"),
    },
  });
}

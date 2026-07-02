import { NextResponse } from "next/server";
import { listMetaDeckSummaries } from "../../../lib/db/metaDecksRepo";
import { getSyncMeta } from "../../../lib/db/syncMetaRepo";
import { ensureMetaDecksSeeded } from "../../../lib/sync/metaDecks";

export const runtime = "nodejs";

export async function GET() {
  ensureMetaDecksSeeded();
  return NextResponse.json({
    decks: listMetaDeckSummaries(),
    lastSyncedAt: getSyncMeta("meta_decks_last_synced_at"),
    source: getSyncMeta("meta_decks_last_source"),
  });
}

import { NextResponse } from "next/server";
import { getOwnedMap } from "../../../lib/db/collectionRepo";
import { loadMetaDecksWithCards } from "../../../lib/db/metaDecksRepo";
import { getSyncMeta } from "../../../lib/db/syncMetaRepo";
import { ensureMetaDecksSeeded, maybeRefreshMetaDecksInBackground } from "../../../lib/sync/metaDecks";
import { recommendTopDecks } from "../../../lib/recommendation/recommend";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 5;
  const includeSide = searchParams.get("includeSide") === "true";

  ensureMetaDecksSeeded();
  maybeRefreshMetaDecksInBackground();

  const owned = getOwnedMap();
  const decks = loadMetaDecksWithCards();
  const recommendations = recommendTopDecks(decks, owned, { limit, includeSide });

  return NextResponse.json({
    recommendations,
    generatedAt: new Date().toISOString(),
    metaDecksSource: getSyncMeta("meta_decks_last_source"),
    metaDecksLastSyncedAt: getSyncMeta("meta_decks_last_synced_at"),
  });
}

import { NextResponse } from "next/server";
import { syncMetaDecks } from "../../../../lib/sync/metaDecks";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await syncMetaDecks();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Meta deck sync failed" },
      { status: 500 }
    );
  }
}

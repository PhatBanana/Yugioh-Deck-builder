import { NextResponse } from "next/server";
import { getCollectionStats } from "../../../../lib/db/collectionRepo";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getCollectionStats());
}

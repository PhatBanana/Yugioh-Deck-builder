import { NextResponse } from "next/server";
import { getCollectionForExport } from "../../../../lib/db/collectionRepo";

export const runtime = "nodejs";

// JSON backup download; re-importable via the Import page (or POST
// /api/collection/import), which accepts this exact shape.
export async function GET() {
  const body = {
    exportedAt: new Date().toISOString(),
    cards: getCollectionForExport(),
  };
  const date = body.exportedAt.slice(0, 10);
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="ygo-collection-${date}.json"`,
    },
  });
}

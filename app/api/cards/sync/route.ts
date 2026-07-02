import { NextResponse } from "next/server";
import { syncCards } from "../../../../lib/sync/cards";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";

  try {
    const result = await syncCards({ force });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Card sync failed" },
      { status: 500 }
    );
  }
}

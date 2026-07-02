import { NextResponse } from "next/server";
import { getDistinctFilterValues } from "../../../../lib/db/cardsRepo";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getDistinctFilterValues());
}

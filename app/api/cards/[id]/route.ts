import { NextResponse } from "next/server";
import { getCardById } from "../../../../lib/db/cardsRepo";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const card = getCardById(Number(id));
  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }
  return NextResponse.json(card);
}

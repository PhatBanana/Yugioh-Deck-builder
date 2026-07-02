import { NextResponse } from "next/server";
import { z } from "zod";
import { getCardById } from "../../../lib/db/cardsRepo";
import { getCollection, upsertOwnedQuantity } from "../../../lib/db/collectionRepo";

export const runtime = "nodejs";

const upsertSchema = z.object({
  cardId: z.number().int().positive(),
  quantity: z.number().int().min(0).max(99),
});

export async function GET() {
  return NextResponse.json({ collection: getCollection() });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (!getCardById(parsed.data.cardId)) {
    return NextResponse.json(
      { error: `Unknown card id ${parsed.data.cardId}` },
      { status: 400 }
    );
  }
  const result = upsertOwnedQuantity(parsed.data.cardId, parsed.data.quantity);
  return NextResponse.json(result);
}

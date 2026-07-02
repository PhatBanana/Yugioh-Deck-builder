import { NextResponse } from "next/server";
import { z } from "zod";
import { parseImportText } from "../../../../lib/collection/importParser";
import { resolveImportEntries } from "../../../../lib/collection/importResolve";
import { bulkUpsertOwnedQuantities } from "../../../../lib/db/collectionRepo";

export const runtime = "nodejs";

const importSchema = z.object({
  text: z.string().min(1).max(1_000_000),
  mode: z.enum(["add", "set"]).default("add"),
  apply: z.boolean().default(false),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const entries = parseImportText(parsed.data.text);
  if (entries.length === 0) {
    return NextResponse.json({ error: "No cards found in input" }, { status: 400 });
  }

  const { matched, unmatched } = await resolveImportEntries(entries);

  let applied = 0;
  if (parsed.data.apply && matched.length > 0) {
    applied = bulkUpsertOwnedQuantities(
      matched.map(({ cardId, quantity }) => ({ cardId, quantity })),
      parsed.data.mode
    );
  }

  return NextResponse.json({ matched, unmatched, applied, appliedMode: parsed.data.mode });
}

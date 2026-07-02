import { NextResponse } from "next/server";
import { searchCards, type CardSortKey } from "../../../lib/db/cardsRepo";

export const runtime = "nodejs";

const SORT_KEYS: CardSortKey[] = ["name", "atk", "def", "level", "price"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sortParam = searchParams.get("sort") as CardSortKey | null;

  const result = searchCards({
    q: searchParams.get("q") ?? undefined,
    type: searchParams.get("type") ?? undefined,
    race: searchParams.get("race") ?? undefined,
    attribute: searchParams.get("attribute") ?? undefined,
    archetype: searchParams.get("archetype") ?? undefined,
    ownedOnly: searchParams.get("ownedOnly") === "true",
    sort: sortParam && SORT_KEYS.includes(sortParam) ? sortParam : undefined,
    page: searchParams.get("page") ? Number(searchParams.get("page")) : undefined,
    pageSize: searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : undefined,
  });

  return NextResponse.json(result);
}

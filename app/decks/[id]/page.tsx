import Link from "next/link";
import { notFound } from "next/navigation";
import ShoppingListButtons from "../../../components/ShoppingListButtons";
import { getMetaDeckDetail, type MetaDeckDetailCard } from "../../../lib/db/metaDecksRepo";
import type { MissingCard } from "../../../lib/recommendation/types";

export const dynamic = "force-dynamic";

const SECTION_LABELS: Record<string, string> = {
  main: "Main Deck",
  extra: "Extra Deck",
  side: "Side Deck",
};

function toMissingCards(cards: MetaDeckDetailCard[]): MissingCard[] {
  return cards
    .filter((c) => c.ownedQuantity < c.neededQuantity)
    .map((c) => {
      const missingQuantity = c.neededQuantity - Math.min(c.ownedQuantity, c.neededQuantity);
      return {
        cardId: c.cardId,
        cardName: c.cardName,
        neededQuantity: c.neededQuantity,
        ownedQuantity: c.ownedQuantity,
        missingQuantity,
        isKeyCard: c.isKeyCard,
        section: c.section,
        priceUsd: c.priceUsd,
        missingCostUsd: c.priceUsd != null ? c.priceUsd * missingQuantity : null,
      };
    });
}

export default async function DeckDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const deck = getMetaDeckDetail(decodeURIComponent(id));
  if (!deck) notFound();

  const missing = toMissingCards(deck.cards);
  const missingCost = missing.reduce((sum, c) => sum + (c.missingCostUsd ?? 0), 0);
  const totalNeeded = deck.cards.reduce((sum, c) => sum + c.neededQuantity, 0);
  const totalOwned = deck.cards.reduce(
    (sum, c) => sum + Math.min(c.ownedQuantity, c.neededQuantity),
    0
  );

  const sections = (["main", "extra", "side"] as const)
    .map((section) => ({
      section,
      cards: deck.cards.filter((c) => c.section === section),
    }))
    .filter((s) => s.cards.length > 0);

  return (
    <div>
      <Link href="/recommendations" className="text-sm text-neutral-500 hover:text-white">
        ← Back to recommendations
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4 mt-2 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">{deck.name}</h1>
          <div className="text-sm text-neutral-400 mt-1">
            {deck.archetype && <span>{deck.archetype} · </span>}
            <span className="tabular-nums">
              {totalOwned}/{totalNeeded} cards owned
            </span>
            {missing.length > 0 && (
              <span className="text-amber-400/90"> · ≈ ${missingCost.toFixed(2)} to complete</span>
            )}
            {deck.source_url && (
              <>
                {" · "}
                <a
                  href={deck.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-white"
                >
                  source
                </a>
              </>
            )}
          </div>
        </div>
        <ShoppingListButtons cards={missing} deckName={deck.name} />
      </div>

      {sections.map(({ section, cards }) => (
        <section key={section} className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">
            {SECTION_LABELS[section]} (
            {cards.reduce((sum, c) => sum + c.neededQuantity, 0)} cards)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {cards.map((c) => {
              const complete = c.ownedQuantity >= c.neededQuantity;
              return (
                <div
                  key={c.cardId}
                  className={`rounded-lg border overflow-hidden bg-neutral-900 ${
                    complete ? "border-neutral-800" : "border-amber-700/60"
                  }`}
                >
                  <div className="aspect-[59/86] bg-neutral-800 relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/images/${c.cardId}?size=small`}
                      alt={c.cardName}
                      className={`w-full h-full object-cover ${complete ? "" : "opacity-50"}`}
                      loading="lazy"
                    />
                    {c.isKeyCard && (
                      <span className="absolute top-1 left-1 text-[9px] uppercase tracking-wide px-1 py-0.5 rounded bg-amber-900/90 text-amber-200">
                        Key
                      </span>
                    )}
                  </div>
                  <div className="p-1.5">
                    <div className="text-xs leading-snug line-clamp-2" title={c.cardName}>
                      {c.cardName}
                    </div>
                    <div className="flex items-center justify-between mt-1 text-xs tabular-nums">
                      <span className={complete ? "text-emerald-400" : "text-amber-400"}>
                        {c.ownedQuantity}/{c.neededQuantity}
                      </span>
                      <span className="text-neutral-500">
                        {c.priceUsd != null ? `$${c.priceUsd.toFixed(2)}` : ""}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

"use client";

import { useState } from "react";
import CardDetailModal from "./CardDetailModal";
import CardTile, { type CardWithOwnership } from "./CardTile";

export default function CardGrid({ cards }: { cards: CardWithOwnership[] }) {
  const [selected, setSelected] = useState<CardWithOwnership | null>(null);

  if (cards.length === 0) {
    return (
      <div className="text-center text-neutral-400 py-16">
        No cards match your search/filters.
      </div>
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {cards.map((card) => (
          <CardTile key={card.id} card={card} onSelect={setSelected} />
        ))}
      </div>
      {selected && <CardDetailModal card={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

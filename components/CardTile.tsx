"use client";

import type { Card } from "../lib/db/cardsRepo";
import QuantityStepper from "./QuantityStepper";

export interface CardWithOwnership extends Card {
  owned_quantity: number;
}

// TCG deck-building limits by banlist status.
export function stepperMax(banlistStatus: string | null): number {
  switch (banlistStatus) {
    case "Banned":
      return 0;
    case "Limited":
      return 1;
    case "Semi-Limited":
      return 2;
    default:
      return 3;
  }
}

export default function CardTile({
  card,
  onSelect,
}: {
  card: CardWithOwnership;
  onSelect?: (card: CardWithOwnership) => void;
}) {
  return (
    <div
      className="rounded-lg border border-neutral-800 bg-neutral-900 overflow-hidden flex flex-col cursor-pointer hover:border-neutral-600 transition-colors"
      onClick={() => onSelect?.(card)}
    >
      <div className="aspect-[59/86] bg-neutral-800">
        {card.image_url_small ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/images/${card.id}?size=small`}
            alt={card.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : null}
      </div>
      <div className="p-2 flex flex-col gap-1 flex-1">
        <div className="text-sm font-medium leading-snug line-clamp-2" title={card.name}>
          {card.name}
        </div>
        <div className="text-xs text-neutral-400 line-clamp-1 flex justify-between gap-2">
          <span className="truncate">{card.archetype ?? card.type}</span>
          {card.price_usd != null && (
            <span className="text-neutral-500 tabular-nums shrink-0">
              ${card.price_usd.toFixed(2)}
            </span>
          )}
        </div>
        <div className="mt-auto pt-2 flex items-center justify-between">
          {card.banlist_status ? (
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-900/60 text-red-200">
              {card.banlist_status}
            </span>
          ) : (
            <span />
          )}
          <QuantityStepper
            cardId={card.id}
            initialQuantity={card.owned_quantity}
            max={stepperMax(card.banlist_status)}
          />
        </div>
      </div>
    </div>
  );
}

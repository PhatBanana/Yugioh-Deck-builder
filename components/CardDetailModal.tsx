"use client";

import { useEffect } from "react";
import type { CardWithOwnership } from "./CardTile";
import QuantityStepper from "./QuantityStepper";
import { stepperMax } from "./CardTile";

interface CardSet {
  set_name: string;
  set_code: string;
  set_rarity: string;
  set_price: string;
}

function parseSets(json: string | null): CardSet[] {
  if (!json) return [];
  try {
    const sets = JSON.parse(json);
    return Array.isArray(sets) ? sets : [];
  } catch {
    return [];
  }
}

export default function CardDetailModal({
  card,
  onClose,
}: {
  card: CardWithOwnership;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sets = parseSets(card.card_sets_json);
  const stats: [string, string | number | null][] = [
    ["Type", card.type],
    ["Race", card.race],
    ["Attribute", card.attribute],
    ["Archetype", card.archetype],
    ["Level/Rank", card.level],
    ["Link Rating", card.linkval],
    ["Scale", card.scale],
    ["ATK", card.atk],
    ["DEF", card.def],
  ];

  return (
    <div
      className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-neutral-900 border border-neutral-700 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col sm:flex-row gap-5">
          <div className="shrink-0 mx-auto sm:mx-0 w-56">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/images/${card.id}?size=full`}
              alt={card.name}
              className="w-full rounded-lg"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-semibold leading-tight">{card.name}</h2>
              <button
                type="button"
                onClick={onClose}
                className="text-neutral-500 hover:text-white text-xl leading-none px-1"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="flex items-center gap-3 mt-2">
              {card.banlist_status && (
                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-900/60 text-red-200">
                  {card.banlist_status}
                </span>
              )}
              {card.price_usd != null && (
                <span className="text-sm text-amber-400/90 tabular-nums">
                  ${card.price_usd.toFixed(2)}
                </span>
              )}
              <span className="text-sm text-neutral-400">Owned:</span>
              <QuantityStepper
                cardId={card.id}
                initialQuantity={card.owned_quantity}
                max={stepperMax(card.banlist_status)}
              />
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 mt-4 text-sm">
              {stats
                .filter(([, v]) => v != null && v !== "")
                .map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2 border-b border-neutral-800/60 py-1">
                    <dt className="text-neutral-500">{label}</dt>
                    <dd className="text-neutral-200 text-right">{value}</dd>
                  </div>
                ))}
            </dl>

            {card.description && (
              <p className="mt-4 text-sm text-neutral-300 whitespace-pre-line leading-relaxed">
                {card.description}
              </p>
            )}

            {sets.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-neutral-400 mb-1.5">Printings</h3>
                <ul className="text-xs text-neutral-400 flex flex-col gap-1 max-h-40 overflow-y-auto pr-2">
                  {sets.map((s, i) => (
                    <li key={`${s.set_code}-${i}`} className="flex justify-between gap-3">
                      <span className="truncate">
                        {s.set_name} <span className="text-neutral-600">({s.set_code})</span>
                      </span>
                      <span className="shrink-0">
                        {s.set_rarity}
                        {Number(s.set_price) > 0 && (
                          <span className="text-neutral-500 tabular-nums"> · ${s.set_price}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

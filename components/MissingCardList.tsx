"use client";

import { useState } from "react";
import type { MissingCard } from "../lib/recommendation/types";

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

type SortMode = "importance" | "price";

export default function MissingCardList({ cards }: { cards: MissingCard[] }) {
  const [sortMode, setSortMode] = useState<SortMode>("importance");

  if (cards.length === 0) {
    return <div className="text-sm text-emerald-400">You have everything needed for this deck!</div>;
  }

  const sorted =
    sortMode === "importance"
      ? cards
      : [...cards].sort((a, b) => (b.missingCostUsd ?? -1) - (a.missingCostUsd ?? -1));

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-xs text-neutral-500">
        <span>Sort by:</span>
        {(["importance", "price"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setSortMode(mode)}
            className={`px-2 py-0.5 rounded ${
              sortMode === mode
                ? "bg-neutral-700 text-neutral-100"
                : "bg-neutral-800/60 hover:bg-neutral-800 text-neutral-400"
            }`}
          >
            {mode === "importance" ? "Importance" : "Price"}
          </button>
        ))}
      </div>
      <ul className="flex flex-col gap-1.5">
        {sorted.map((c) => (
          <li
            key={`${c.cardId}-${c.section}`}
            className="flex items-center justify-between text-sm gap-2"
          >
            <span className="flex items-center gap-2 min-w-0">
              {c.isKeyCard && (
                <span className="shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300">
                  Key
                </span>
              )}
              <span className="truncate">{c.cardName}</span>
              <span className="shrink-0 text-neutral-500 text-xs uppercase">{c.section}</span>
            </span>
            <span className="shrink-0 flex items-center gap-3 tabular-nums">
              <span className="text-neutral-500 text-xs w-16 text-right">
                {c.missingCostUsd != null ? formatUsd(c.missingCostUsd) : "—"}
              </span>
              <span className="text-neutral-400">
                {c.ownedQuantity}/{c.neededQuantity}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import type { DeckRecommendation } from "../lib/recommendation/types";
import MissingCardList from "./MissingCardList";
import ShoppingListButtons from "./ShoppingListButtons";

export default function DeckRecommendationCard({
  recommendation,
  rank,
}: {
  recommendation: DeckRecommendation;
  rank: number;
}) {
  const [expanded, setExpanded] = useState(rank === 1);
  const pct = Math.round(recommendation.completionScore * 100);
  const cost = recommendation.missingCostUsd;

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-neutral-500">#{rank}</div>
          <h3 className="text-lg font-semibold">
            <Link href={`/decks/${recommendation.deckId}`} className="hover:underline">
              {recommendation.deckName}
            </Link>
          </h3>
          {recommendation.archetype && (
            <div className="text-sm text-neutral-400">{recommendation.archetype}</div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-semibold tabular-nums">{pct}%</div>
          <div className="text-xs text-neutral-500 tabular-nums">
            {recommendation.totalCardsOwned}/{recommendation.totalCardsNeeded} owned
          </div>
          {recommendation.missingCards.length > 0 && (
            <div className="text-xs text-amber-400/90 tabular-nums mt-0.5">
              ≈ ${cost.toFixed(2)} to complete
              {recommendation.missingCostUnpricedCount > 0 && (
                <span
                  className="text-neutral-500"
                  title={`${recommendation.missingCostUnpricedCount} missing card(s) have no price data`}
                >
                  {" "}
                  +{recommendation.missingCostUnpricedCount} unpriced
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 h-2 rounded-full bg-neutral-800 overflow-hidden">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-sm text-neutral-300 hover:text-white"
          >
            {expanded ? "Hide" : "Show"} missing cards ({recommendation.missingCards.length})
          </button>
          <Link
            href={`/decks/${recommendation.deckId}`}
            className="text-sm text-neutral-500 hover:text-white"
          >
            View full deck →
          </Link>
        </div>
        <ShoppingListButtons
          cards={recommendation.missingCards}
          deckName={recommendation.deckName}
        />
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-neutral-800">
          <MissingCardList cards={recommendation.missingCards} />
        </div>
      )}
    </div>
  );
}

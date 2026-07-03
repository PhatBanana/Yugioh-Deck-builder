import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { DeckRecommendation, MissingCard } from "@shared/recommendation/types";
import { db } from "../db";
import { getRecommendations } from "../services/recommendations";
import { toast } from "../components/Toaster";

function copyShoppingList(rec: DeckRecommendation) {
  const text = rec.missingCards.map((c) => `${c.missingQuantity} ${c.cardName}`).join("\n");
  navigator.clipboard
    .writeText(text)
    .then(() => toast(`Copied ${rec.missingCards.length} missing cards`, "success"))
    .catch(() => toast("Couldn't access the clipboard", "error"));
}

function MissingRow({ c }: { c: MissingCard }) {
  return (
    <li className="flex items-center justify-between gap-2 text-sm py-0.5">
      <span className="flex items-center gap-1.5 min-w-0">
        {c.isKeyCard && (
          <span className="shrink-0 text-[9px] uppercase px-1 py-0.5 rounded bg-amber-900/60 text-amber-300">
            Key
          </span>
        )}
        <span className="truncate">{c.cardName}</span>
      </span>
      <span className="shrink-0 text-neutral-500 text-xs tabular-nums">
        {c.missingCostUsd != null ? `$${c.missingCostUsd.toFixed(2)} · ` : ""}
        {c.ownedQuantity}/{c.neededQuantity}
      </span>
    </li>
  );
}

function DeckCard({ rec, rank }: { rec: DeckRecommendation; rank: number }) {
  const [expanded, setExpanded] = useState(rank === 1);
  const pct = Math.round(rec.completionScore * 100);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-neutral-500">#{rank}</div>
          <h3 className="font-semibold leading-snug">{rec.deckName}</h3>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl font-semibold tabular-nums">{pct}%</div>
          <div className="text-[11px] text-neutral-500 tabular-nums">
            {rec.totalCardsOwned}/{rec.totalCardsNeeded}
          </div>
        </div>
      </div>

      <div className="mt-2.5 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>

      {rec.missingCards.length > 0 && (
        <div className="mt-1.5 text-xs text-amber-400/90 tabular-nums">
          ≈ ${rec.missingCostUsd.toFixed(2)} to complete
          {rec.missingCostUnpricedCount > 0 && (
            <span className="text-neutral-500"> +{rec.missingCostUnpricedCount} unpriced</span>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-sm text-neutral-300"
        >
          {expanded ? "Hide" : "Show"} missing ({rec.missingCards.length})
        </button>
        {rec.missingCards.length > 0 && (
          <button
            type="button"
            onClick={() => copyShoppingList(rec)}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-neutral-800 active:bg-neutral-700"
          >
            Copy list
          </button>
        )}
      </div>

      {expanded && (
        <ul className="mt-2 pt-2 border-t border-neutral-800 flex flex-col">
          {rec.missingCards.length === 0 ? (
            <li className="text-sm text-emerald-400">You can build this deck!</li>
          ) : (
            rec.missingCards.map((c) => <MissingRow key={`${c.cardId}-${c.section}`} c={c} />)
          )}
        </ul>
      )}
    </div>
  );
}

export default function RecommendationsPage() {
  const [recs, setRecs] = useState<DeckRecommendation[] | null>(null);
  const [includeSide, setIncludeSide] = useState(false);
  const cardCount = useLiveQuery(() => db.cards.count());
  const collectionSize = useLiveQuery(() => db.collection.count());
  const deckSource = useLiveQuery(
    async () => (await db.syncMeta.get("meta_decks_last_source"))?.value ?? null
  );

  useEffect(() => {
    let cancelled = false;
    getRecommendations({ includeSide })
      .then((r) => {
        if (!cancelled) setRecs(r);
      })
      .catch(() => {
        if (!cancelled) setRecs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [includeSide, collectionSize, cardCount]);

  if (!cardCount) {
    return (
      <div className="p-6 text-center text-neutral-400 text-sm">
        Sync the card database first (Cards tab) to see deck recommendations.
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          Top meta decks you're closest to building
          {deckSource === "static_snapshot" ? " (bundled snapshot)" : ""}
        </p>
        <label className="flex items-center gap-1.5 text-xs text-neutral-400 shrink-0">
          <input
            type="checkbox"
            checked={includeSide}
            onChange={(e) => setIncludeSide(e.target.checked)}
          />
          Side deck
        </label>
      </div>

      {recs === null && <div className="text-neutral-500 text-sm">Crunching…</div>}
      {recs?.length === 0 && (
        <div className="text-neutral-500 text-sm">
          No meta decks cached yet — run a sync from the Cards tab.
        </div>
      )}
      {recs?.map((rec, i) => (
        <DeckCard key={rec.deckId} rec={rec} rank={i + 1} />
      ))}
    </div>
  );
}

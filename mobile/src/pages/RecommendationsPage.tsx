import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { DeckRecommendation, MissingCard } from "@shared/recommendation/types";
import type { PurchaseSuggestion } from "@shared/recommendation/purchases";
import { db } from "../db";
import {
  getMetaDeckOwnership,
  getPurchaseSuggestions,
  getRecommendations,
} from "../services/recommendations";
import { saveMetaDeckAsDeck } from "../services/decks";
import WishlistButton from "../components/WishlistButton";
import { CardDetailById } from "../components/CardDetailModal";
import CardThumb from "../components/CardThumb";
import { toast } from "../components/Toaster";

const BUDGETS: { label: string; value: number | null }[] = [
  { label: "Any", value: null },
  { label: "≤ $25", value: 25 },
  { label: "≤ $50", value: 50 },
  { label: "≤ $100", value: 100 },
];

function copyShoppingList(rec: DeckRecommendation) {
  const text = rec.missingCards.map((c) => `${c.missingQuantity} ${c.cardName}`).join("\n");
  navigator.clipboard
    .writeText(text)
    .then(() => toast(`Copied ${rec.missingCards.length} missing cards`, "success"))
    .catch(() => toast("Couldn't access the clipboard", "error"));
}

function MissingRow({ c, onTap }: { c: MissingCard; onTap: (id: number) => void }) {
  return (
    <li className="flex items-center justify-between gap-2 text-sm py-0.5">
      <button
        type="button"
        onClick={() => onTap(c.cardId)}
        className="flex items-center gap-1.5 min-w-0 text-left"
      >
        {c.isKeyCard && (
          <span className="shrink-0 text-[9px] uppercase px-1 py-0.5 rounded bg-amber-900/60 text-amber-300">
            Key
          </span>
        )}
        <span className="truncate">{c.cardName}</span>
      </button>
      <span className="shrink-0 flex items-center gap-2">
        <span className="text-neutral-500 text-xs tabular-nums">
          {c.missingCostUsd != null ? `$${c.missingCostUsd.toFixed(2)} · ` : ""}
          {c.ownedQuantity}/{c.neededQuantity}
        </span>
        <WishlistButton cardId={c.cardId} />
      </span>
    </li>
  );
}

function PurchaseRow({ p }: { p: PurchaseSuggestion }) {
  const card = useLiveQuery(() => db.cards.get(p.cardId), [p.cardId]);
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <CardThumb img={card?.img} w="w-8" h="h-11" />
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-snug truncate">{p.cardName}</div>
        <div className="text-xs text-neutral-500">
          helps {p.decksHelped} deck{p.decksHelped === 1 ? "" : "s"}
          {p.priceUsd != null ? ` · $${p.priceUsd.toFixed(2)}` : ""}
        </div>
      </div>
      <WishlistButton cardId={p.cardId} className="text-xl" />
    </div>
  );
}

function DeckCard({
  rec,
  rank,
  onCardTap,
}: {
  rec: DeckRecommendation;
  rank: number;
  onCardTap: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(rank === 1);
  const pct = Math.round(rec.completionScore * 100);

  // Cards you already own for this deck (fetched only while expanded).
  const owned = useLiveQuery(
    async () =>
      expanded ? (await getMetaDeckOwnership(rec.deckId)).filter((c) => c.owned > 0) : null,
    [expanded, rec.deckId]
  );

  async function addToDecks() {
    const deck = await saveMetaDeckAsDeck(rec.deckId);
    toast(deck ? `Added “${deck.name}” to Decks` : "Couldn't add deck", deck ? "success" : "error");
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-neutral-500">#{rank}</div>
          <h3 className="font-semibold leading-snug">{rec.deckName}</h3>
          {(rec.era || rec.strategy) && (
            <div className="flex flex-wrap gap-1 mt-1">
              {rec.era && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300">
                  {rec.era}
                </span>
              )}
              {rec.strategy && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/60 text-indigo-200">
                  {rec.strategy}
                </span>
              )}
            </div>
          )}
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

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-sm text-neutral-300 shrink-0"
        >
          {expanded ? "Hide" : "Show"} cards
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={addToDecks}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-800/70 active:bg-emerald-700 text-emerald-100"
          >
            + Add to Decks
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
      </div>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-neutral-800 flex flex-col gap-2">
          {/* Cards you already own */}
          {owned && owned.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-emerald-400 mb-1">
                You own ({owned.length})
              </div>
              <ul className="flex flex-col">
                {owned.map((c) => (
                  <li
                    key={c.cardId}
                    className="flex items-center justify-between gap-2 text-sm py-0.5"
                  >
                    <button
                      type="button"
                      onClick={() => onCardTap(c.cardId)}
                      className="flex items-center gap-1.5 min-w-0 text-left"
                    >
                      <span className="text-emerald-500 shrink-0">✓</span>
                      <span className="truncate">{c.name}</span>
                    </button>
                    <span className="shrink-0 text-neutral-400 text-xs tabular-nums">
                      {Math.min(c.owned, c.needed)}/{c.needed}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Cards still missing */}
          <div>
            {rec.missingCards.length === 0 ? (
              <div className="text-sm text-emerald-400">You can build this deck!</div>
            ) : (
              <>
                <div className="text-xs font-semibold text-amber-400 mb-1">
                  Still need ({rec.missingCards.length})
                </div>
                <ul className="flex flex-col">
                  {rec.missingCards.map((c) => (
                    <MissingRow key={`${c.cardId}-${c.section}`} c={c} onTap={onCardTap} />
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RecommendationsPage() {
  const [recs, setRecs] = useState<DeckRecommendation[] | null>(null);
  const [purchases, setPurchases] = useState<PurchaseSuggestion[]>([]);
  const [includeSide, setIncludeSide] = useState(false);
  const [budget, setBudget] = useState<number | null>(null);
  const [buyNextOpen, setBuyNextOpen] = useState(false);
  const [era, setEra] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<string | null>(null);
  const [sort, setSort] = useState<"completion" | "cost" | "name">("completion");
  const [detailId, setDetailId] = useState<number | null>(null);

  const cardCount = useLiveQuery(() => db.cards.count());
  const collectionSize = useLiveQuery(() => db.collection.count());
  const deckSource = useLiveQuery(
    async () => (await db.syncMeta.get("meta_decks_last_source"))?.value ?? null
  );

  useEffect(() => {
    if (!cardCount) return; // nothing to recommend until the card DB is synced
    let cancelled = false;
    // Fetch all cached decks so era/strategy/budget filters have a full pool.
    getRecommendations({ includeSide, limit: 200 })
      .then((r) => !cancelled && setRecs(r))
      .catch(() => !cancelled && setRecs([]));
    getPurchaseSuggestions(8)
      .then((p) => !cancelled && setPurchases(p))
      .catch(() => !cancelled && setPurchases([]));
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

  const allRecs = recs ?? [];
  // Distinct eras / strategies present, for the filter dropdowns.
  const eras = [...new Set(allRecs.map((r) => r.era).filter((e): e is string => !!e))].sort();
  const strategies = [
    ...new Set(allRecs.map((r) => r.strategy).filter((s): s is string => !!s)),
  ].sort();

  const filtersActive = budget != null || era != null || strategy != null || sort !== "completion";

  const displayed = allRecs
    .filter((r) => budget == null || r.missingCostUsd <= budget)
    .filter((r) => era == null || r.era === era)
    .filter((r) => strategy == null || r.strategy === strategy)
    .sort((a, b) => {
      if (sort === "cost") return a.missingCostUsd - b.missingCostUsd;
      if (sort === "name") return a.deckName.localeCompare(b.deckName);
      return 0; // 'completion' — already sorted by the recommender
    })
    .slice(0, filtersActive ? 25 : 5);

  const selectClass =
    "flex-1 min-w-0 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 text-xs px-2 py-1.5";

  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          Meta decks ranked by how close you are
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

      {/* Era / strategy / sort */}
      <div className="flex gap-1.5">
        <select
          className={selectClass}
          value={era ?? ""}
          onChange={(e) => setEra(e.target.value || null)}
        >
          <option value="">All eras</option>
          {eras.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={strategy ?? ""}
          onChange={(e) => setStrategy(e.target.value || null)}
        >
          <option value="">All styles</option>
          {strategies.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
        >
          <option value="completion">Closest</option>
          <option value="cost">Cheapest</option>
          <option value="name">A–Z</option>
        </select>
      </div>

      {/* Budget filter */}
      <div className="flex gap-1.5">
        {BUDGETS.map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={() => setBudget(b.value)}
            className={`flex-1 py-1.5 rounded-lg text-xs ${
              budget === b.value
                ? "bg-neutral-700 text-white"
                : "bg-neutral-900 border border-neutral-800 text-neutral-400"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* What to buy next */}
      {purchases.length > 0 && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
          <button
            type="button"
            onClick={() => setBuyNextOpen((o) => !o)}
            className="w-full flex items-center justify-between text-sm font-medium"
          >
            <span>💡 Best cards to buy next</span>
            <span className="text-neutral-500 text-xs">{buyNextOpen ? "Hide" : "Show"}</span>
          </button>
          {buyNextOpen && (
            <div className="mt-2 pt-2 border-t border-neutral-800 divide-y divide-neutral-800/60">
              {purchases.map((p) => (
                <PurchaseRow key={p.cardId} p={p} />
              ))}
              <p className="text-[11px] text-neutral-600 pt-2">
                Ranked by how much meta-deck progress each unlocks. ♥ adds to your wishlist.
              </p>
            </div>
          )}
        </div>
      )}

      {recs === null && <div className="text-neutral-500 text-sm">Crunching…</div>}
      {recs !== null && displayed.length === 0 && (
        <div className="text-neutral-500 text-sm">
          {allRecs.length === 0
            ? "No meta decks cached yet — run a sync from the Cards tab."
            : "No decks match these filters. Try widening era, style, or budget."}
        </div>
      )}
      {displayed.map((rec, i) => (
        <DeckCard key={rec.deckId} rec={rec} rank={i + 1} onCardTap={setDetailId} />
      ))}

      {detailId != null && (
        <CardDetailById cardId={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}

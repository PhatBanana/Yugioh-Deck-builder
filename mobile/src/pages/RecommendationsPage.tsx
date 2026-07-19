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
import { strategyBlurb } from "@shared/metaDecks/strategy";
import { saveMetaDeckAsDeck } from "../services/decks";
import {
  importLiveDeck,
  searchLiveDecks,
  type LiveSearchOutcome,
} from "../services/deckSearch";
import { matchesQuery } from "@shared/search/textMatch";
import { formatUsd } from "../lib/util";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import WishlistButton from "../components/WishlistButton";
import { useCardDetail } from "../components/CardDetailModal";
import CardThumb from "../components/CardThumb";
import SyncFirstNotice from "../components/SyncFirstNotice";
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

function MissingRow({ c }: { c: MissingCard }) {
  const openCard = useCardDetail();
  return (
    <li className="flex items-center justify-between gap-2 text-sm py-0.5">
      <button
        type="button"
        onClick={() => openCard(c.cardId)}
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
          {c.missingCostUsd != null ? `${formatUsd(c.missingCostUsd)} · ` : ""}
          {c.ownedQuantity}/{c.neededQuantity}
        </span>
        <WishlistButton cardId={c.cardId} />
      </span>
    </li>
  );
}

function PurchaseRow({ p }: { p: PurchaseSuggestion }) {
  const card = useLiveQuery(() => db.cards.get(p.cardId), [p.cardId]);
  const openCard = useCardDetail();
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <button
        type="button"
        onClick={() => openCard(p.cardId)}
        className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
      >
        <CardThumb img={card?.img} w="w-8" h="h-11" />
        <div className="min-w-0 flex-1">
          <div className="text-sm leading-snug truncate">{p.cardName}</div>
          <div className="text-xs text-neutral-500">
            helps {p.decksHelped} deck{p.decksHelped === 1 ? "" : "s"}
            {p.priceUsd != null ? ` · ${formatUsd(p.priceUsd)}` : ""}
          </div>
        </div>
      </button>
      <WishlistButton cardId={p.cardId} className="text-xl" />
    </div>
  );
}

function DeckCard({ rec, rank }: { rec: DeckRecommendation; rank: number }) {
  const openCard = useCardDetail();
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
    <div className="panel p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-neutral-500">#{rank}</div>
          <h3 className="font-semibold leading-snug">{rec.deckName}</h3>
          {(rec.era || rec.strategy) && (
            <div className="flex flex-wrap gap-1 mt-1">
              {rec.era && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-raised border border-line text-neutral-300">
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
          <div
            className={`text-xl font-semibold tabular-nums ${
              pct >= 80 ? "bg-gradient-to-r from-amber-300 to-yellow-500 bg-clip-text text-transparent" : ""
            }`}
          >
            {pct}%
          </div>
          <div className="text-[11px] text-neutral-500 tabular-nums">
            {rec.totalCardsOwned}/{rec.totalCardsNeeded}
          </div>
        </div>
      </div>

      <div className="mt-2.5 h-1.5 rounded-full bg-raised overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {rec.missingCards.length > 0 && (
        <div className="mt-1.5 text-xs text-orange-400/90 tabular-nums">
          ≈ {formatUsd(rec.missingCostUsd)} to complete
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
            className="pressable text-xs px-2.5 py-1.5 rounded-lg bg-amber-400/15 active:bg-amber-400/25 text-amber-200 border border-amber-900/50"
          >
            + Add to Decks
          </button>
          {rec.missingCards.length > 0 && (
            <button
              type="button"
              onClick={() => copyShoppingList(rec)}
              className="btn-ghost text-xs px-2.5 py-1.5 rounded-lg"
            >
              Copy list
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-line flex flex-col gap-2">
          {/* How the deck expects to play out, naming its key cards. */}
          <p className="text-xs text-neutral-400 leading-relaxed">
            <span className="font-semibold text-neutral-300">How it plays: </span>
            {strategyBlurb(
              rec.strategy,
              [...(owned ?? []).filter((c) => c.isKeyCard).map((c) => c.name),
               ...rec.missingCards.filter((c) => c.isKeyCard).map((c) => c.cardName)]
            )}
          </p>

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
                      onClick={() => openCard(c.cardId)}
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
                <div className="text-xs font-semibold text-orange-400 mb-1">
                  Still need ({rec.missingCards.length})
                </div>
                <ul className="flex flex-col">
                  {rec.missingCards.map((c) => (
                    <MissingRow key={`${c.cardId}-${c.section}`} c={c} />
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

export default function RecommendationsPage({ onGoToCards }: { onGoToCards: () => void }) {
  const [recs, setRecs] = useState<DeckRecommendation[] | null>(null);
  const [purchases, setPurchases] = useState<PurchaseSuggestion[]>([]);
  const [includeSide, setIncludeSide] = useState(false);
  const [budget, setBudget] = useState<number | null>(null);
  const [buyNextOpen, setBuyNextOpen] = useState(false);
  const [era, setEra] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<string | null>(null);
  const [sort, setSort] = useState<"completion" | "cost" | "name">("completion");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [live, setLive] = useState<LiveSearchOutcome | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  // Bumped when an online deck is imported so the ranked list re-crunches.
  const [refreshKey, setRefreshKey] = useState(0);
  // "Show more decks" grows the visible cap; resets when the view changes.
  const [extraShown, setExtraShown] = useState(0);

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
  }, [includeSide, collectionSize, cardCount, refreshKey]);

  // Online results are for one query; typing a new one discards them.
  useEffect(() => setLive(null), [debouncedSearch]);

  // A new search/filter view starts back at the base number of decks.
  useEffect(() => setExtraShown(0), [debouncedSearch, budget, era, strategy, sort]);

  if (!cardCount) {
    return (
      <SyncFirstNotice
        reason="recommendations compare it against your collection."
        onGoToCards={onGoToCards}
      />
    );
  }

  const allRecs = recs ?? [];
  // Distinct eras / strategies present, for the filter dropdowns.
  const eras = [...new Set(allRecs.map((r) => r.era).filter((e): e is string => !!e))].sort();
  const strategies = [
    ...new Set(allRecs.map((r) => r.strategy).filter((s): s is string => !!s)),
  ].sort();

  const filtersActive = budget != null || era != null || strategy != null || sort !== "completion";
  const q = debouncedSearch.trim();

  // A search query looks across every cached deck; otherwise the tab shows
  // the usual top decks. Matching is token-based, so case and word order
  // don't matter ("branded despia" finds "Despia Branded").
  const matching = allRecs
    .filter((r) => matchesQuery(`${r.deckName} ${r.archetype ?? ""}`, q))
    .filter((r) => budget == null || r.missingCostUsd <= budget)
    .filter((r) => era == null || r.era === era)
    .filter((r) => strategy == null || r.strategy === strategy)
    .sort((a, b) => {
      if (sort === "cost") return a.missingCostUsd - b.missingCostUsd;
      if (sort === "name") return a.deckName.localeCompare(b.deckName);
      return 0; // 'completion' — already sorted by the recommender
    });
  const shownCap = (q ? 50 : filtersActive ? 25 : 5) + extraShown;
  const displayed = matching.slice(0, shownCap);
  const hasMore = matching.length > shownCap;

  async function runLiveSearch() {
    setLiveBusy(true);
    try {
      setLive(await searchLiveDecks(debouncedSearch.trim()));
    } catch {
      setLive({ results: [], errors: ["Online search failed"] });
    } finally {
      setLiveBusy(false);
    }
  }

  async function importLive(result: LiveSearchOutcome["results"][number]) {
    const deck = await importLiveDeck(result).catch(() => null);
    if (deck) {
      toast(`Added “${deck.name}” to your meta decks`, "success");
      setRefreshKey((k) => k + 1);
    } else {
      toast("Couldn't resolve that deck's cards against your card database", "error");
    }
  }

  const selectClass = "input-base flex-1 min-w-0 rounded-lg text-neutral-300 text-xs px-2 py-1.5";

  return (
    <div className="page p-4 flex flex-col gap-3">
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

      {/* Search all known meta decks — cached ones instantly, plus an
          explicit online lookup across the supported deck sources. */}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search meta decks (e.g. Dark Magician)…"
        className="input-base w-full px-4 py-2.5 text-sm"
      />

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
            className={`flex-1 py-1.5 rounded-lg text-xs border transition-colors duration-150 ${
              budget === b.value
                ? "bg-amber-400/15 border-amber-900/60 text-amber-200 font-medium"
                : "bg-surface border-line text-neutral-400"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* What to buy next */}
      {purchases.length > 0 && (
        <div className="panel p-3">
          <button
            type="button"
            onClick={() => setBuyNextOpen((o) => !o)}
            className="w-full flex items-center justify-between text-sm font-medium"
          >
            <span>💡 Best cards to buy next</span>
            <span className="text-neutral-500 text-xs">{buyNextOpen ? "Hide" : "Show"}</span>
          </button>
          {buyNextOpen && (
            <div className="mt-2 pt-2 border-t border-line divide-y divide-line/70">
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
            : q
              ? "No cached decks match — try the online search below."
              : "No decks match these filters. Try widening era, style, or budget."}
        </div>
      )}
      {displayed.map((rec, i) => (
        <DeckCard key={rec.deckId} rec={rec} rank={i + 1} />
      ))}

      {hasMore && (
        <button
          type="button"
          onClick={() => setExtraShown((n) => n + 10)}
          className="btn-ghost py-3 text-sm"
        >
          Show more decks ({matching.length - shownCap} more)
        </button>
      )}

      {/* Online lookup, offered whenever a search is active. */}
      {q.length >= 2 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={liveBusy}
            onClick={runLiveSearch}
            className="btn-ghost py-2.5 text-sm"
          >
            {liveBusy ? "Searching online…" : "🌐 Search online — YGOPRODeck · YugiohMeta"}
          </button>
          {live && (
            <>
              {live.results.map((r) => (
                <div key={r.key} className="panel flex items-center gap-3 px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm leading-snug truncate">{r.name}</div>
                    <div className="text-xs text-neutral-500">
                      {r.source}
                      {r.format ? ` · ${r.format}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void importLive(r)}
                    className="pressable shrink-0 text-xs px-2.5 py-1.5 rounded-lg bg-amber-400/15 active:bg-amber-400/25 text-amber-200 border border-amber-900/50"
                  >
                    ＋ Import
                  </button>
                </div>
              ))}
              {live.results.length === 0 && live.errors.length === 0 && (
                <p className="text-xs text-neutral-500 text-center py-1">
                  No online decks found for “{debouncedSearch.trim()}”.
                </p>
              )}
              {live.errors.map((e) => (
                <p key={e} className="text-xs text-neutral-600 text-center">
                  {e}
                </p>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

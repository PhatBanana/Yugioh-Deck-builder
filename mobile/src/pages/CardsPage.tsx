import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type MCard } from "../db";
import QuantityStepper, { stepperMax } from "../components/QuantityStepper";
import WishlistButton from "../components/WishlistButton";
import { toast } from "../components/Toaster";
import { syncCards } from "../services/cardSync";
import { syncMetaDecks } from "../services/metaDecks";
import { invalidateCandidateCache } from "../services/scanner";
import { getCollectionStats } from "../services/collection";

const PAGE = 50;

type View = "all" | "owned" | "wishlist";

const VIEWS: { id: View; label: string }[] = [
  { id: "all", label: "All" },
  { id: "owned", label: "Owned" },
  { id: "wishlist", label: "Wishlist" },
];

function CardRow({ card, owned }: { card: MCard; owned: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-2">
      {card.img ? (
        <img src={card.img} alt="" className="w-11 rounded" loading="lazy" />
      ) : (
        <div className="w-11 h-16 rounded bg-neutral-800" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-snug line-clamp-2">{card.name}</div>
        <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1.5">
          <span className="truncate">{card.archetype ?? card.type}</span>
          {card.banlist && (
            <span className="shrink-0 px-1 rounded bg-red-900/60 text-red-200 text-[10px] uppercase">
              {card.banlist}
            </span>
          )}
          {card.price != null && <span className="shrink-0">${card.price.toFixed(2)}</span>}
        </div>
      </div>
      <WishlistButton cardId={card.id} className="text-xl" />
      <QuantityStepper cardId={card.id} quantity={owned} max={stepperMax(card.banlist)} />
    </div>
  );
}

export default function CardsPage() {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("all");
  const [limit, setLimit] = useState(PAGE);
  const [syncing, setSyncing] = useState<string | null>(null);

  const cardCount = useLiveQuery(() => db.cards.count());
  const ownedMap = useLiveQuery(async () => {
    const map = new Map<number, number>();
    for (const e of await db.collection.toArray()) map.set(e.cardId, e.quantity);
    return map;
  });
  const stats = useLiveQuery(() => getCollectionStats(), [], null);

  const results = useLiveQuery(async () => {
    const q = query.trim().toLowerCase();
    let rows: MCard[];
    if (view === "owned") {
      const entries = (await db.collection.toArray()).filter((e) => e.quantity > 0);
      const cards = await db.cards.bulkGet(entries.map((e) => e.cardId));
      rows = cards.filter((c): c is MCard => !!c && (!q || c.nameLower.includes(q)));
      rows.sort((a, b) => a.name.localeCompare(b.name));
    } else if (view === "wishlist") {
      const ids = (await db.wishlist.toArray()).map((w) => w.cardId);
      const cards = await db.cards.bulkGet(ids);
      rows = cards.filter((c): c is MCard => !!c && (!q || c.nameLower.includes(q)));
      rows.sort((a, b) => a.name.localeCompare(b.name));
    } else if (q) {
      rows = await db.cards
        .filter((c) => c.nameLower.includes(q))
        .limit(limit + 1)
        .toArray();
      rows.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      rows = await db.cards.orderBy("nameLower").limit(limit + 1).toArray();
    }
    return rows;
  }, [query, view, limit]);

  async function runFullSync() {
    setSyncing("Starting…");
    try {
      const cards = await syncCards(setSyncing);
      invalidateCandidateCache();
      setSyncing("Updating meta decks…");
      const decks = await syncMetaDecks(setSyncing);
      toast(
        cards.skipped
          ? `Cards already current · ${decks.deckCount} meta decks (${decks.source})`
          : `Synced ${cards.cardCount.toLocaleString()} cards · ${decks.deckCount} meta decks`,
        "success"
      );
    } catch (err) {
      toast(`Sync failed: ${err instanceof Error ? err.message : err}`, "error");
    } finally {
      setSyncing(null);
    }
  }

  if (cardCount === 0) {
    return (
      <div className="p-6 flex flex-col items-center gap-4 text-center">
        <p className="text-neutral-300 mt-8">
          First run: download the Yu-Gi-Oh! card database (~50 MB, Wi-Fi recommended).
        </p>
        <button
          type="button"
          disabled={!!syncing}
          onClick={runFullSync}
          className="px-6 py-3.5 rounded-xl bg-emerald-700 active:bg-emerald-600 disabled:opacity-40 font-semibold"
        >
          {syncing ?? "Download card database"}
        </button>
      </div>
    );
  }

  const hasMore = view === "all" && (results?.length ?? 0) > limit;
  const visible = hasMore ? results!.slice(0, limit) : (results ?? []);

  return (
    <div className="p-4 flex flex-col gap-3">
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setLimit(PAGE);
        }}
        placeholder={`Search ${cardCount?.toLocaleString() ?? ""} cards…`}
        className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-sm"
      />
      <div className="flex rounded-xl bg-neutral-900 border border-neutral-800 p-0.5 text-sm">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            className={`flex-1 py-1.5 rounded-lg ${
              view === v.id ? "bg-neutral-700 text-white" : "text-neutral-400"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>
          {stats
            ? `${stats.totalCopies} cards (${stats.uniqueCards} unique)` +
              (stats.estimatedValueUsd > 0 ? ` · ≈$${stats.estimatedValueUsd.toFixed(0)}` : "")
            : ""}
        </span>
        <button type="button" disabled={!!syncing} onClick={runFullSync} className="underline">
          {syncing ?? "Re-sync data"}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {visible.map((card) => (
          <CardRow key={card.id} card={card} owned={ownedMap?.get(card.id) ?? 0} />
        ))}
        {visible.length === 0 && (
          <div className="text-center text-neutral-500 text-sm py-10">
            {view === "wishlist"
              ? "Your wishlist is empty. Tap ♡ on cards, or on the Meta tab's “buy next” list."
              : view === "owned"
                ? "No owned cards yet — scan or search to add some."
                : "No cards match."}
          </div>
        )}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE)}
          className="py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-sm"
        >
          Show more
        </button>
      )}
    </div>
  );
}

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type MCard } from "../db";
import QuantityStepper, { stepperMax } from "../components/QuantityStepper";
import WishlistButton from "../components/WishlistButton";
import { useCardDetail } from "../components/CardDetailModal";
import CardThumb from "../components/CardThumb";
import ValueSparkline from "../components/ValueSparkline";
import BackupSheet from "../components/BackupSheet";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
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

type TypeFilter = "" | "Monster" | "Spell" | "Trap";
type SortBy = "name" | "price" | "atk" | "level";

// Nulls sort last for the numeric sorts (descending).
const SORTERS: Record<SortBy, (a: MCard, b: MCard) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  price: (a, b) => (b.price ?? -1) - (a.price ?? -1),
  atk: (a, b) => (b.atk ?? -1) - (a.atk ?? -1),
  level: (a, b) => (b.level ?? -1) - (a.level ?? -1),
};

function CardRow({ card, owned }: { card: MCard; owned: number }) {
  const openCard = useCardDetail();
  return (
    <div className="flex items-center gap-3 panel p-2">
      {/* Tapping the image/name opens the card details; the controls stay separate. */}
      <button
        type="button"
        onClick={() => openCard(card.id)}
        className="flex items-center gap-3 min-w-0 flex-1 text-left"
      >
        <CardThumb img={card.img} w="w-11" h="h-16" />
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
      </button>
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
  const [backupOpen, setBackupOpen] = useState(false);
  const [cardType, setCardType] = useState<TypeFilter>("");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const debouncedQuery = useDebouncedValue(query, 250);

  const cardCount = useLiveQuery(() => db.cards.count());
  const ownedMap = useLiveQuery(async () => {
    const map = new Map<number, number>();
    for (const e of await db.collection.toArray()) map.set(e.cardId, e.quantity);
    return map;
  });
  const stats = useLiveQuery(() => getCollectionStats(), [], null);

  const results = useLiveQuery(async () => {
    const q = debouncedQuery.trim().toLowerCase();
    let rows: MCard[];
    if (view === "owned") {
      const entries = (await db.collection.toArray()).filter((e) => e.quantity > 0);
      const cards = await db.cards.bulkGet(entries.map((e) => e.cardId));
      rows = cards.filter((c): c is MCard => !!c && (!q || c.nameLower.includes(q)));
    } else if (view === "wishlist") {
      const ids = (await db.wishlist.toArray()).map((w) => w.cardId);
      const cards = await db.cards.bulkGet(ids);
      rows = cards.filter((c): c is MCard => !!c && (!q || c.nameLower.includes(q)));
    } else if (!q && !cardType && sortBy === "name") {
      // Fast path: the index is already in name order.
      return db.cards.orderBy("nameLower").limit(limit + 1).toArray();
    } else {
      // Filter/sort need the full pool (the slimmed table is small enough).
      rows = q
        ? await db.cards.filter((c) => c.nameLower.includes(q)).toArray()
        : await db.cards.toArray();
    }
    if (cardType) rows = rows.filter((c) => c.type.includes(cardType));
    rows.sort(SORTERS[sortBy]);
    return view === "all" ? rows.slice(0, limit + 1) : rows;
  }, [debouncedQuery, view, limit, cardType, sortBy]);

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
        <h2 className="text-lg font-semibold mt-6">Welcome 👋</h2>
        <p className="text-neutral-300 text-sm max-w-xs">
          Scan the cards you own with your camera, then see which top meta decks
          you can build and what you're missing.
        </p>
        <p className="text-neutral-500 text-xs max-w-xs">
          To start, download the Yu-Gi-Oh! card database — about 50 MB, so use
          Wi-Fi. This is a one-time step.
        </p>
        <button
          type="button"
          disabled={!!syncing}
          onClick={runFullSync}
          className="btn-primary px-6 py-3.5 mt-2"
        >
          {syncing ?? "Download card database"}
        </button>
        <button
          type="button"
          onClick={() => setBackupOpen(true)}
          className="text-xs text-neutral-500 underline"
        >
          Restore a backup
        </button>
        {backupOpen && <BackupSheet onClose={() => setBackupOpen(false)} />}
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
        className="input-base w-full px-4 py-2.5 text-sm"
      />
      <div className="seg text-sm">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            className={`seg-btn py-1.5 ${view === v.id ? "seg-on" : ""}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Type filter + sort order. */}
      <div className="flex gap-1.5">
        <select
          className="input-base flex-1 min-w-0 rounded-lg text-neutral-300 text-xs px-2 py-1.5"
          value={cardType}
          onChange={(e) => {
            setCardType(e.target.value as TypeFilter);
            setLimit(PAGE);
          }}
        >
          <option value="">All types</option>
          <option value="Monster">Monsters</option>
          <option value="Spell">Spells</option>
          <option value="Trap">Traps</option>
        </select>
        <select
          className="input-base flex-1 min-w-0 rounded-lg text-neutral-300 text-xs px-2 py-1.5"
          value={sortBy}
          onChange={(e) => {
            setSortBy(e.target.value as SortBy);
            setLimit(PAGE);
          }}
        >
          <option value="name">A–Z</option>
          <option value="price">Price ↓</option>
          <option value="atk">ATK ↓</option>
          <option value="level">Level ↓</option>
        </select>
      </div>

      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>
          {stats
            ? `${stats.totalCopies} cards (${stats.uniqueCards} unique)` +
              (stats.estimatedValueUsd > 0 ? ` · ≈$${stats.estimatedValueUsd.toFixed(0)}` : "")
            : ""}
        </span>
        <span className="flex gap-3">
          <button type="button" onClick={() => setBackupOpen(true)} className="underline">
            Backup
          </button>
          <button type="button" disabled={!!syncing} onClick={runFullSync} className="underline">
            {syncing ?? "Re-sync data"}
          </button>
        </span>
      </div>

      {view === "owned" && <ValueSparkline />}

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
          className="btn-ghost py-3 text-sm"
        >
          Show more
        </button>
      )}

      {backupOpen && <BackupSheet onClose={() => setBackupOpen(false)} />}
    </div>
  );
}

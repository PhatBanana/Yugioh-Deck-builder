import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getSyncMeta, setSyncMeta, type MCard, type PrintingCopy } from "../db";
import { backupIsStale, lastBackupAt } from "../services/backup";
import { rarityAbbrev } from "@shared/scan/setCode";
import { foilClass, topRarity } from "../lib/foil";
import { artSmallUrl } from "../lib/art";
import QuantityStepper, { stepperMax } from "../components/QuantityStepper";
import WishlistButton from "../components/WishlistButton";
import { useCardDetail } from "../components/CardDetailModal";
import CardThumb from "../components/CardThumb";
import ValueSparkline from "../components/ValueSparkline";
import BackupSheet from "../components/BackupSheet";
import InsightsSheet from "../components/InsightsSheet";
import PriceAlertsSheet from "../components/PriceAlertsSheet";
import WishlistBudgetSheet from "../components/WishlistBudgetSheet";
import BulkEditBar from "../components/BulkEditBar";
import { cachedAlertCount, refreshAlertCount } from "../services/priceAlerts";
import SetSheet from "../components/SetSheet";
import TradesSheet from "../components/TradesSheet";
import { ensureSetList, searchSets } from "../services/sets";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { toast } from "../components/Toaster";
import { syncCards } from "../services/cardSync";
import { syncMetaDecks } from "../services/metaDecks";
import { invalidateCandidateCache } from "../services/scanner";
import { searchCardIds } from "../services/cardSearch";
import { getCollectionStats, getValueDelta } from "../services/collection";
import { usePersistentState } from "../hooks/usePersistentState";
import { formatUsd } from "../lib/util";

const PAGE = 50;

type View = "all" | "owned" | "wishlist" | "sets";

const VIEWS: { id: View; label: string }[] = [
  { id: "all", label: "All" },
  { id: "owned", label: "Owned" },
  { id: "wishlist", label: "Wishlist" },
  { id: "sets", label: "Sets" },
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

// Grid-view cell: image with owned-count badge, tiny name caption.
function GridCell({
  card,
  owned,
  copies,
  img,
  selectable,
  selected,
  onToggleSelect,
}: {
  card: MCard;
  owned: number;
  copies?: PrintingCopy[];
  img?: string | null;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
}) {
  const openCard = useCardDetail();
  const foil = foilClass(topRarity(copies));
  const src = img ?? card.img;
  return (
    <button
      type="button"
      onClick={() => (selectable ? onToggleSelect?.(card.id) : openCard(card.id))}
      className={`pressable relative text-left ${selectable && !selected ? "opacity-60" : ""}`}
    >
      {src ? (
        <span className="relative block">
          <img src={src} alt={card.name} className="w-full rounded-md ring-1 ring-white/10" loading="lazy" />
          {foil && <span aria-hidden className={`foil ${foil}`} />}
        </span>
      ) : (
        <div className="w-full aspect-[59/86] rounded-md bg-raised ring-1 ring-white/5 flex items-end p-1">
          <span className="text-[10px] leading-tight text-neutral-400 line-clamp-3">{card.name}</span>
        </div>
      )}
      {owned > 0 && (
        <span className="pop-in absolute top-1 right-1 min-w-5 h-5 px-1 rounded-full bg-amber-400 text-black text-xs font-bold flex items-center justify-center">
          {owned}
        </span>
      )}
      {selectable && (
        <span
          className={`absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ring-2 ${
            selected ? "bg-amber-400 text-black ring-amber-400" : "bg-black/50 text-transparent ring-white/60"
          }`}
        >
          ✓
        </span>
      )}
      <span className="block text-[10px] leading-tight text-neutral-400 mt-1 line-clamp-1">
        {card.name}
      </span>
    </button>
  );
}

// Condenses the printing breakdown into "1 ScR · 2 C · 1 unset" for the row.
function raritySummary(copies: PrintingCopy[]): string {
  const byRarity = new Map<string, number>();
  for (const c of copies) {
    const key = c.rarity ? rarityAbbrev(c.rarity) : "unset";
    byRarity.set(key, (byRarity.get(key) ?? 0) + c.quantity);
  }
  return [...byRarity].map(([r, n]) => `${n} ${r}`).join(" · ");
}

function CardRow({
  card,
  owned,
  copies,
  img,
  selectable,
  selected,
  onToggleSelect,
}: {
  card: MCard;
  owned: number;
  copies?: PrintingCopy[];
  img?: string | null;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
}) {
  const openCard = useCardDetail();
  return (
    <div className={`flex items-center gap-3 panel p-2 ${selectable && selected ? "ring-1 ring-amber-400" : ""}`}>
      {selectable && (
        <span
          className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ring-2 ${
            selected ? "bg-amber-400 text-black ring-amber-400" : "text-transparent ring-white/40"
          }`}
        >
          ✓
        </span>
      )}
      {/* Tapping the image/name opens the card details; the controls stay separate. */}
      <button
        type="button"
        onClick={() => (selectable ? onToggleSelect?.(card.id) : openCard(card.id))}
        className="flex items-center gap-3 min-w-0 flex-1 text-left"
      >
        <CardThumb img={img ?? card.img} w="w-11" h="h-16" rarity={topRarity(copies)} />
        <div className="min-w-0 flex-1">
          <div className="text-sm leading-snug line-clamp-2">{card.name}</div>
          <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1.5">
            <span className="truncate">{card.archetype ?? card.type}</span>
            {card.banlist && (
              <span className="shrink-0 px-1 rounded bg-red-900/60 text-red-200 text-[10px] uppercase">
                {card.banlist}
              </span>
            )}
            {card.price != null && <span className="shrink-0">{formatUsd(card.price)}</span>}
          </div>
          {copies && copies.length > 0 && (
            <div className="text-[11px] text-amber-300/90 font-medium mt-0.5 tabular-nums truncate">
              {raritySummary(copies)}
            </div>
          )}
        </div>
      </button>
      {!selectable && (
        <>
          <WishlistButton cardId={card.id} className="text-xl" />
          <QuantityStepper cardId={card.id} quantity={owned} max={stepperMax(card.banlist)} />
        </>
      )}
    </div>
  );
}

export default function CardsPage() {
  const [query, setQuery] = useState("");
  // View, sort, layout and filters persist across launches so the tab reopens
  // the way you left it.
  const [view, setView] = usePersistentState<View>("ygo-cards-view", "all");
  const [limit, setLimit] = useState(PAGE);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [cardType, setCardType] = usePersistentState<TypeFilter>("ygo-cards-type", "");
  const [sortBy, setSortBy] = usePersistentState<SortBy>("ygo-cards-sort", "name");
  const [layout, setLayout] = usePersistentState<"list" | "grid">("ygo-cards-layout", "list");
  const [attr, setAttr] = usePersistentState("ygo-cards-attr", "");
  const [level, setLevel] = usePersistentState("ygo-cards-level", "");
  const [banStatus, setBanStatus] = usePersistentState("ygo-cards-ban", "");
  const [openSet, setOpenSet] = useState<string | null>(null);
  const [tradesOpen, setTradesOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [ambigFilter, setAmbigFilter] = useState(false);
  const [setCount, setSetCount] = useState<number | null>(null);
  const debouncedQuery = useDebouncedValue(query, 250);

  // Prime the set catalogue when the Sets view is first opened.
  useEffect(() => {
    if (view === "sets") ensureSetList().then(setSetCount);
  }, [view]);

  // Backup nudge: a collection worth keeping + no recent export = one gentle
  // toast with a shortcut to the Backup sheet. Throttled (3 days between
  // nudges) so it reminds without nagging. Exists because a database
  // corruption once forced a data wipe with nothing to restore from.
  useEffect(() => {
    (async () => {
      const copies = await db.collection.count();
      if (copies < 10) return; // nothing worth nagging about yet
      if (!backupIsStale(await lastBackupAt())) return;
      const lastNudge = Number(await getSyncMeta("backup_nudge_at")) || 0;
      if (Date.now() - lastNudge < 3 * 24 * 60 * 60 * 1000) return;
      await setSyncMeta("backup_nudge_at", String(Date.now()));
      toast("Your collection isn't backed up recently", "info", {
        label: "Back up",
        onClick: () => setBackupOpen(true),
      });
    })().catch(() => {});
    // Once per mount is the point — not on every dependency change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setResults = useLiveQuery(
    async () => (view === "sets" ? searchSets(debouncedQuery, limit + 1) : []),
    [view, debouncedQuery, setCount, limit],
    []
  );

  const cardCount = useLiveQuery(() => db.cards.count());
  // One pass over the collection for everything the page derives from it —
  // owned counts, printing breakdowns (rarity summaries + ambiguous count),
  // chosen artworks and binder names. Previously five separate live queries
  // each re-scanned the whole table on every single write.
  const coll = useLiveQuery(async () => {
    const ownedMap = new Map<number, number>();
    const copiesMap = new Map<number, PrintingCopy[]>();
    const artMap = new Map<number, number>();
    const tagSet = new Set<string>();
    let ambiguousCount = 0;
    for (const e of await db.collection.toArray()) {
      ownedMap.set(e.cardId, e.quantity);
      if (e.copies?.length) {
        copiesMap.set(e.cardId, e.copies);
        for (const c of e.copies) if (c.ambiguous) ambiguousCount += c.quantity;
      }
      if (e.artId != null) artMap.set(e.cardId, e.artId);
      for (const t of e.tags ?? []) tagSet.add(t);
    }
    return {
      ownedMap,
      copiesMap,
      artMap,
      tags: [...tagSet].sort((a, b) => a.localeCompare(b)),
      ambiguousCount,
    };
  });
  const ownedMap = coll?.ownedMap;
  const copiesMap = view === "owned" ? coll?.copiesMap : undefined;
  const artMap = view === "owned" ? coll?.artMap : undefined;
  const ambiguousCount = coll?.ambiguousCount ?? 0;
  const stats = useLiveQuery(() => getCollectionStats(), [], null);
  const valueDelta = useLiveQuery(
    () => (stats ? getValueDelta(stats.estimatedValueUsd) : Promise.resolve(null)),
    [stats?.estimatedValueUsd],
    null
  );
  // Alerts badge: reads the cached count (refreshed by the sheet / a sync)
  // instead of recomputing every card's price history on each write.
  const alertCount = useLiveQuery(() => cachedAlertCount(), [], 0);

  const toggleSelect = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };
  // Bulk-select is an Owned-view mode; leave it when the view changes.
  useEffect(() => {
    if (view !== "owned") exitSelect();
  }, [view]);
  // Changing filters/search hides rows — drop the selection so a bulk Remove
  // can't touch cards that are no longer on screen.
  useEffect(() => {
    exitSelect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagFilter, ambigFilter, debouncedQuery, cardType, attr, level, banStatus]);

  const results = useLiveQuery(async () => {
    const q = debouncedQuery.trim().toLowerCase();
    // In-memory name index (card names + installed language packs) — avoids
    // re-reading all ~13k records from IndexedDB per keystroke.
    const matchIds = q ? await searchCardIds(q) : null;
    const nameHit = (c: MCard) => !matchIds || matchIds.has(c.id);
    let rows: MCard[];
    if (view === "owned") {
      const entries = (await db.collection.toArray()).filter(
        (e) =>
          e.quantity > 0 &&
          (!tagFilter || (e.tags ?? []).includes(tagFilter)) &&
          (!ambigFilter || e.copies?.some((c) => c.ambiguous))
      );
      const cards = await db.cards.bulkGet(entries.map((e) => e.cardId));
      rows = cards.filter((c): c is MCard => !!c && nameHit(c));
    } else if (view === "wishlist") {
      const ids = (await db.wishlist.toArray()).map((w) => w.cardId);
      const cards = await db.cards.bulkGet(ids);
      rows = cards.filter((c): c is MCard => !!c && nameHit(c));
    } else if (!q && !cardType && !attr && !level && !banStatus && sortBy === "name") {
      // Fast path: the index is already in name order.
      return db.cards.orderBy("nameLower").limit(limit + 1).toArray();
    } else if (matchIds) {
      // Search: fetch only the matched rows instead of scanning the table.
      rows = (await db.cards.bulkGet([...matchIds])).filter((c): c is MCard => !!c);
    } else {
      // Filter/sort without a query need the full pool.
      rows = await db.cards.toArray();
    }
    if (cardType) rows = rows.filter((c) => c.type.includes(cardType));
    if (attr) rows = rows.filter((c) => c.attribute === attr);
    if (level) rows = rows.filter((c) => c.level === Number(level));
    if (banStatus) rows = rows.filter((c) => c.banlist === banStatus);
    rows.sort(SORTERS[sortBy]);
    // Every card view paginates — a 3,000-card collection otherwise renders
    // 3,000 rows (each with its own wishlist live query) in one go.
    return rows.slice(0, limit + 1);
  }, [debouncedQuery, view, limit, cardType, sortBy, tagFilter, ambigFilter, attr, level, banStatus]);

  // Binder chips shown on the Owned view — derived from the collection pass.
  const tags = coll?.tags ?? [];

  async function runFullSync() {
    setSyncing("Starting…");
    try {
      const cards = await syncCards(setSyncing);
      invalidateCandidateCache();
      refreshAlertCount().catch(() => {}); // prices changed — refresh the badge
      if (cards.rarityIndexFailed) {
        toast("Rarity index couldn't be built — scan rarities may be slow until the next sync", "error");
      }
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
      <div className="page p-6 flex flex-col items-center gap-4 text-center">
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
        {backupOpen && (
        <BackupSheet
          onClose={() => setBackupOpen(false)}
          syncing={syncing}
          onSync={runFullSync}
        />
      )}
      </div>
    );
  }

  const hasMore =
    (view === "sets" ? setResults.length : (results?.length ?? 0)) > limit;
  const visible = hasMore ? results!.slice(0, limit) : (results ?? []);

  return (
    <div className="page p-4 flex flex-col gap-3">
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setLimit(PAGE);
        }}
        placeholder={
          view === "sets"
            ? `Search ${setCount?.toLocaleString() ?? ""} sets…`
            : `Search ${cardCount?.toLocaleString() ?? ""} cards…`
        }
        className="input-base w-full px-4 py-2.5 text-sm"
      />
      <div className="seg text-sm">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => {
              setView(v.id);
              setLimit(PAGE);
            }}
            className={`seg-btn py-1.5 ${view === v.id ? "seg-on" : ""}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Type filter + sort order. */}
      {view !== "sets" && (
      <>
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
        <button
          type="button"
          onClick={() => setLayout((l) => (l === "list" ? "grid" : "list"))}
          className="btn-ghost px-3 py-1.5 rounded-lg text-sm shrink-0"
          aria-label={layout === "list" ? "Switch to grid view" : "Switch to list view"}
        >
          {layout === "list" ? "▦" : "☰"}
        </button>
      </div>

      {/* Advanced filters. */}
        <div className="flex gap-1.5">
          <select
            className="input-base flex-1 min-w-0 rounded-lg text-neutral-300 text-xs px-2 py-1.5"
            value={attr}
            onChange={(e) => {
              setAttr(e.target.value);
              setLimit(PAGE);
            }}
          >
            <option value="">Any attribute</option>
            {["DARK", "LIGHT", "EARTH", "WATER", "FIRE", "WIND", "DIVINE"].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            className="input-base flex-1 min-w-0 rounded-lg text-neutral-300 text-xs px-2 py-1.5"
            value={level}
            onChange={(e) => {
              setLevel(e.target.value);
              setLimit(PAGE);
            }}
          >
            <option value="">Any level</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((l) => (
              <option key={l} value={l}>
                Lv {l}
              </option>
            ))}
          </select>
          <select
            className="input-base flex-1 min-w-0 rounded-lg text-neutral-300 text-xs px-2 py-1.5"
            value={banStatus}
            onChange={(e) => {
              setBanStatus(e.target.value);
              setLimit(PAGE);
            }}
          >
            <option value="">Any status</option>
            <option value="Banned">Banned</option>
            <option value="Limited">Limited</option>
            <option value="Semi-Limited">Semi-Limited</option>
          </select>
        </div>
      </>
      )}

      {/* Collection hero on Owned; a compact line elsewhere. */}
      {view === "owned" && stats ? (
        <div className="panel relative overflow-hidden px-4 py-3">
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(120%_140%_at_85%_-30%,rgba(245,158,11,0.12),transparent_60%)]"
          />
          <div className="relative">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">
              Collection value
            </div>
            <div className="text-3xl font-bold tabular-nums bg-gradient-to-r from-amber-300 to-yellow-500 bg-clip-text text-transparent">
              ${stats.estimatedValueUsd.toFixed(0)}
            </div>
            <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1.5">
              <span>
                {stats.totalCopies} cards · {stats.uniqueCards} unique
              </span>
              {valueDelta != null && Math.abs(valueDelta) >= 0.01 && (
                <span
                  className={`tabular-nums font-medium ${
                    valueDelta >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {valueDelta >= 0 ? "▲" : "▼"} {formatUsd(Math.abs(valueDelta))} today
                </span>
              )}
            </div>
          </div>
          {/* One action row, one style — everything the collection offers.
              (Re-sync lives inside Backup, the app/data home.) */}
          <div className="relative mt-3 pt-3 border-t border-line/70 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setInsightsOpen(true)}
              className="btn-ghost py-2 text-xs"
            >
              📊 Insights
            </button>
            <button
              type="button"
              onClick={() => setAlertsOpen(true)}
              className="btn-ghost py-2 text-xs relative"
            >
              🔔 Alerts
              {alertCount > 0 && (
                <span className="pop-in absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-amber-400 text-black text-[11px] font-bold flex items-center justify-center">
                  {alertCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
              className={`btn-ghost py-2 text-xs ${selectMode ? "ring-1 ring-amber-400 text-amber-200" : ""}`}
            >
              {selectMode ? "× Cancel" : "☑ Select"}
            </button>
            <button
              type="button"
              onClick={() => setTradesOpen(true)}
              className="btn-ghost py-2 text-xs"
            >
              🤝 Trades
            </button>
            <button
              type="button"
              onClick={() => setBackupOpen(true)}
              className="btn-ghost py-2 text-xs"
            >
              💾 Backup{syncing ? "…" : ""}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 text-xs text-neutral-500">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="truncate">
              {stats
                ? `${stats.totalCopies} cards (${stats.uniqueCards} unique)` +
                  (stats.estimatedValueUsd > 0 ? ` · ≈$${stats.estimatedValueUsd.toFixed(0)}` : "")
                : ""}
            </span>
            {valueDelta != null && Math.abs(valueDelta) >= 0.01 && (
              <span
                className={`tabular-nums font-medium shrink-0 ${
                  valueDelta >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {valueDelta >= 0 ? "▲" : "▼"} {formatUsd(Math.abs(valueDelta))}
              </span>
            )}
          </span>
          <span className="flex gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setTradesOpen(true)}
              className="btn-ghost px-2.5 py-1.5 text-xs"
            >
              🤝 Trades
            </button>
            <button
              type="button"
              onClick={() => setBackupOpen(true)}
              className="btn-ghost px-2.5 py-1.5 text-xs"
            >
              💾 Backup
            </button>
          </span>
        </div>
      )}

      {/* Budget planner entry (wishlist view). */}
      {view === "wishlist" && (
        <button
          type="button"
          onClick={() => setBudgetOpen(true)}
          className="btn-ghost w-full py-2 text-xs"
        >
          💰 Budget planner
        </button>
      )}

      {/* Binder + rarity-confirmation filter chips (owned view). */}
      {view === "owned" && (tags.length > 0 || ambiguousCount > 0) && (
        <div className="flex gap-1.5 flex-wrap">
          {ambiguousCount > 0 && (
            <button
              type="button"
              onClick={() => setAmbigFilter((v) => !v)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                ambigFilter
                  ? "bg-amber-400/15 border-amber-900/60 text-amber-200 font-medium"
                  : "bg-surface border-line text-amber-300/90"
              }`}
            >
              ⚠ {ambiguousCount} rarit{ambiguousCount === 1 ? "y" : "ies"} to confirm
            </button>
          )}
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTagFilter((cur) => (cur === t ? null : t))}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                tagFilter === t
                  ? "bg-amber-400/15 border-amber-900/60 text-amber-200 font-medium"
                  : "bg-surface border-line text-neutral-400"
              }`}
            >
              📁 {t}
            </button>
          ))}
        </div>
      )}

      {view === "owned" && <ValueSparkline />}

      {/* Sets view: browse the set catalogue and open completion sheets. */}
      {view === "sets" && (
        <div className="flex flex-col gap-2">
          {setResults.slice(0, limit).map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setOpenSet(s.name)}
              className="pressable panel flex items-center justify-between px-3.5 py-3 text-left"
            >
              <span className="min-w-0">
                <span className="block text-sm leading-snug truncate">{s.name}</span>
                <span className="block text-xs text-neutral-500 mt-0.5">
                  {s.code ?? "—"} · {s.cardCount} cards{s.date ? ` · ${s.date}` : ""}
                </span>
              </span>
              <span className="text-neutral-600 shrink-0 ml-2">→</span>
            </button>
          ))}
          {setResults.length === 0 && (
            <div className="empty-state">
              {setCount === 0
                ? "Couldn't load the set list — check your connection and reopen this tab."
                : "No sets match."}
            </div>
          )}
        </div>
      )}

      {view !== "sets" && (
      <div className={layout === "grid" ? "grid grid-cols-3 gap-2" : "flex flex-col gap-2"}>
        {visible.map((card) =>
          layout === "grid" ? (
            <GridCell
              key={card.id}
              card={card}
              owned={ownedMap?.get(card.id) ?? 0}
              copies={copiesMap?.get(card.id)}
              img={artMap?.get(card.id) != null ? artSmallUrl(artMap.get(card.id)!) : undefined}
              selectable={selectMode}
              selected={selected.has(card.id)}
              onToggleSelect={toggleSelect}
            />
          ) : (
            <CardRow
              key={card.id}
              card={card}
              owned={ownedMap?.get(card.id) ?? 0}
              copies={copiesMap?.get(card.id)}
              img={artMap?.get(card.id) != null ? artSmallUrl(artMap.get(card.id)!) : undefined}
              selectable={selectMode}
              selected={selected.has(card.id)}
              onToggleSelect={toggleSelect}
            />
          )
        )}
        {visible.length === 0 && (
          <div className="col-span-3 empty-state">
            {view === "wishlist"
              ? "Your wishlist is empty. Tap ♡ on cards, or on the Meta tab's “buy next” list."
              : view === "owned"
                ? "No owned cards yet — scan or search to add some."
                : "No cards match."}
          </div>
        )}
      </div>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE)}
          className="btn-ghost py-3 text-sm"
        >
          Show more
        </button>
      )}

      {backupOpen && (
        <BackupSheet
          onClose={() => setBackupOpen(false)}
          syncing={syncing}
          onSync={runFullSync}
        />
      )}
      {tradesOpen && <TradesSheet onClose={() => setTradesOpen(false)} />}
      {insightsOpen && <InsightsSheet onClose={() => setInsightsOpen(false)} />}
      {alertsOpen && <PriceAlertsSheet onClose={() => setAlertsOpen(false)} />}
      {budgetOpen && <WishlistBudgetSheet onClose={() => setBudgetOpen(false)} />}
      {openSet && <SetSheet setName={openSet} onClose={() => setOpenSet(null)} />}
      {/* Hidden while any sheet is open — it sits above them (z-75 vs z-70). */}
      {selectMode &&
        !insightsOpen &&
        !alertsOpen &&
        !budgetOpen &&
        !backupOpen &&
        !tradesOpen &&
        !openSet && <BulkEditBar ids={[...selected]} onDone={exitSelect} />}
    </div>
  );
}

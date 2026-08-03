import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type MCard, type PrintingCopy } from "../db";
import { rarityAbbrev } from "@shared/scan/setCode";
import QuantityStepper, { stepperMax } from "../components/QuantityStepper";
import WishlistButton from "../components/WishlistButton";
import { useCardDetail } from "../components/CardDetailModal";
import CardThumb from "../components/CardThumb";
import ValueSparkline from "../components/ValueSparkline";
import BackupSheet from "../components/BackupSheet";
import SetSheet from "../components/SetSheet";
import TradesSheet from "../components/TradesSheet";
import { ensureSetList, searchSets } from "../services/sets";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { toast } from "../components/Toaster";
import { syncCards } from "../services/cardSync";
import { syncMetaDecks } from "../services/metaDecks";
import { invalidateCandidateCache } from "../services/scanner";
import { allTags, getCollectionStats, getValueDelta } from "../services/collection";
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
function GridCell({ card, owned }: { card: MCard; owned: number }) {
  const openCard = useCardDetail();
  return (
    <button type="button" onClick={() => openCard(card.id)} className="pressable relative text-left">
      {card.img ? (
        <img src={card.img} alt={card.name} className="w-full rounded-md ring-1 ring-white/10" loading="lazy" />
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

function CardRow({ card, owned, copies }: { card: MCard; owned: number; copies?: PrintingCopy[] }) {
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
            {card.price != null && <span className="shrink-0">{formatUsd(card.price)}</span>}
          </div>
          {copies && copies.length > 0 && (
            <div className="text-[11px] text-amber-300/90 font-medium mt-0.5 tabular-nums truncate">
              {raritySummary(copies)}
            </div>
          )}
        </div>
      </button>
      <WishlistButton cardId={card.id} className="text-xl" />
      <QuantityStepper cardId={card.id} quantity={owned} max={stepperMax(card.banlist)} />
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
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [setCount, setSetCount] = useState<number | null>(null);
  const debouncedQuery = useDebouncedValue(query, 250);

  // Prime the set catalogue when the Sets view is first opened.
  useEffect(() => {
    if (view === "sets") ensureSetList().then(setSetCount);
  }, [view]);

  const setResults = useLiveQuery(
    async () => (view === "sets" ? searchSets(debouncedQuery) : []),
    [view, debouncedQuery, setCount],
    []
  );

  const cardCount = useLiveQuery(() => db.cards.count());
  const ownedMap = useLiveQuery(async () => {
    const map = new Map<number, number>();
    for (const e of await db.collection.toArray()) map.set(e.cardId, e.quantity);
    return map;
  });
  const stats = useLiveQuery(() => getCollectionStats(), [], null);
  const valueDelta = useLiveQuery(() => getValueDelta(), [], null);
  // Printing breakdown per owned card, for the rarity summary on each row.
  const copiesMap = useLiveQuery(async () => {
    if (view !== "owned") return undefined;
    const m = new Map<number, PrintingCopy[]>();
    for (const e of await db.collection.toArray()) if (e.copies?.length) m.set(e.cardId, e.copies);
    return m;
  }, [view]);

  const results = useLiveQuery(async () => {
    const q = debouncedQuery.trim().toLowerCase();
    let rows: MCard[];
    if (view === "owned") {
      const entries = (await db.collection.toArray()).filter(
        (e) => e.quantity > 0 && (!tagFilter || (e.tags ?? []).includes(tagFilter))
      );
      const cards = await db.cards.bulkGet(entries.map((e) => e.cardId));
      rows = cards.filter((c): c is MCard => !!c && (!q || c.nameLower.includes(q)));
    } else if (view === "wishlist") {
      const ids = (await db.wishlist.toArray()).map((w) => w.cardId);
      const cards = await db.cards.bulkGet(ids);
      rows = cards.filter((c): c is MCard => !!c && (!q || c.nameLower.includes(q)));
    } else if (!q && !cardType && !attr && !level && !banStatus && sortBy === "name") {
      // Fast path: the index is already in name order.
      return db.cards.orderBy("nameLower").limit(limit + 1).toArray();
    } else {
      // Filter/sort need the full pool (the slimmed table is small enough).
      rows = q
        ? await db.cards.filter((c) => c.nameLower.includes(q)).toArray()
        : await db.cards.toArray();
    }
    if (cardType) rows = rows.filter((c) => c.type.includes(cardType));
    if (attr) rows = rows.filter((c) => c.attribute === attr);
    if (level) rows = rows.filter((c) => c.level === Number(level));
    if (banStatus) rows = rows.filter((c) => c.banlist === banStatus);
    rows.sort(SORTERS[sortBy]);
    return view === "all" ? rows.slice(0, limit + 1) : rows;
  }, [debouncedQuery, view, limit, cardType, sortBy, tagFilter, attr, level, banStatus]);

  // Binder chips shown on the Owned view — only queried there.
  const tags = useLiveQuery(() => (view === "owned" ? allTags() : []), [view], []);

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
        {backupOpen && <BackupSheet onClose={() => setBackupOpen(false)} />}
      </div>
    );
  }

  const hasMore = view === "all" && (results?.length ?? 0) > limit;
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
            onClick={() => setView(v.id)}
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
          <div className="relative flex items-end justify-between gap-3">
            <div>
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
            <div className="flex flex-col items-end gap-1 text-xs text-neutral-500">
              <button type="button" onClick={() => setTradesOpen(true)} className="underline">
                Trades
              </button>
              <button type="button" onClick={() => setBackupOpen(true)} className="underline">
                Backup
              </button>
              <button type="button" disabled={!!syncing} onClick={runFullSync} className="underline">
                {syncing ?? "Re-sync data"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>
            {stats
              ? `${stats.totalCopies} cards (${stats.uniqueCards} unique)` +
                (stats.estimatedValueUsd > 0 ? ` · ≈$${stats.estimatedValueUsd.toFixed(0)}` : "")
              : ""}
          </span>
          <span className="flex gap-3">
            <button type="button" onClick={() => setTradesOpen(true)} className="underline">
              Trades
            </button>
            <button type="button" onClick={() => setBackupOpen(true)} className="underline">
              Backup
            </button>
            <button type="button" disabled={!!syncing} onClick={runFullSync} className="underline">
              {syncing ?? "Re-sync data"}
            </button>
          </span>
        </div>
      )}

      {/* Binder filter chips (owned view, only when binders exist). */}
      {view === "owned" && tags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
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
          {setResults.map((s) => (
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
            <div className="text-center text-neutral-500 text-sm py-10">
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
            <GridCell key={card.id} card={card} owned={ownedMap?.get(card.id) ?? 0} />
          ) : (
            <CardRow
              key={card.id}
              card={card}
              owned={ownedMap?.get(card.id) ?? 0}
              copies={copiesMap?.get(card.id)}
            />
          )
        )}
        {visible.length === 0 && (
          <div className="col-span-3 text-center text-neutral-500 text-sm py-10">
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

      {backupOpen && <BackupSheet onClose={() => setBackupOpen(false)} />}
      {tradesOpen && <TradesSheet onClose={() => setTradesOpen(false)} />}
      {openSet && <SetSheet setName={openSet} onClose={() => setOpenSet(null)} />}
    </div>
  );
}

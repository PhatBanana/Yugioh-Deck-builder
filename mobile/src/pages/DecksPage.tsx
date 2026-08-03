import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { DeckSection } from "@shared/deck/types";
import { parseYdk } from "@shared/deck/ydk";
import { computeDeckStats } from "@shared/deck/stats";
import { formatUsd } from "../lib/util";
import { db, type MCard, type MDeck } from "../db";
import {
  createDeck,
  deckMissingCardIds,
  deleteDeck,
  deckToYdk,
  duplicateDeck,
  enrichDeck,
  getDeck,
  listDecks,
  renameDeck,
  restoreDeck,
  saveDeckFromYdk,
  setDeckCard,
  setDeckNotes,
  type BanlistFormat,
  type EnrichedDeck,
} from "../services/decks";
import { addManyToWishlist } from "../services/wishlist";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import CardThumb from "../components/CardThumb";
import { useCardDetail } from "../components/CardDetailModal";
import SyncFirstNotice from "../components/SyncFirstNotice";
import { useBackClose } from "../hooks/useBackClose";
import HandSimSheet from "../components/HandSimSheet";
import DeckOddsSheet from "../components/DeckOddsSheet";
import DuelToolsSheet from "../components/DuelToolsSheet";
import { toast } from "../components/Toaster";
import { confirmDialog } from "../components/Confirm";

const SECTION_LABEL: Record<DeckSection, string> = {
  main: "Main Deck",
  extra: "Extra Deck",
  side: "Side Deck",
};

const EXTRA_TYPES = /(Fusion|Synchro|XYZ|Xyz|Link)/;

function suggestSection(type: string): DeckSection {
  return EXTRA_TYPES.test(type) ? "extra" : "main";
}

// ---------- Deck list ----------

function DeckList({ onOpen }: { onOpen: (id: string) => void }) {
  const decks = useLiveQuery(() => listDecks(), [], []);
  const [duelOpen, setDuelOpen] = useState(false);

  async function newDeck() {
    const d = await createDeck("New Deck");
    onOpen(d.id);
  }

  function importYdk(file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      const cards = parseYdk(String(reader.result ?? ""));
      if (cards.length === 0) {
        toast("No cards found in that .ydk", "error");
        return;
      }
      const name = file.name.replace(/\.ydk$/i, "") || "Imported Deck";
      const d = await saveDeckFromYdk(name, cards);
      toast(`Imported ${name}`, "success");
      onOpen(d.id);
    };
    reader.readAsText(file);
  }

  return (
    <div className="page p-4 flex flex-col gap-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={newDeck}
          className="btn-primary flex-1 py-3"
        >
          + New deck
        </button>
        <label className="btn-ghost px-3 py-3 text-sm cursor-pointer flex items-center">
          Import .ydk
          <input
            type="file"
            accept=".ydk,.txt"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && importYdk(e.target.files[0])}
          />
        </label>
        <button
          type="button"
          onClick={() => setDuelOpen(true)}
          className="btn-ghost px-3 py-3 text-sm"
          aria-label="Duel tools"
        >
          🎲
        </button>
      </div>

      {duelOpen && <DuelToolsSheet onClose={() => setDuelOpen(false)} />}

      {decks.length === 0 && (
        <p className="text-sm text-neutral-500 text-center py-10">
          No decks yet. Create one, or import a .ydk from Master Duel / EDOPro / YGOPRODeck.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {decks.map((d) => (
          <DeckTile key={d.id} deck={d} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function DeckTile({ deck, onOpen }: { deck: MDeck; onOpen: (id: string) => void }) {
  const total = deck.cards
    .filter((c) => c.section === "main")
    .reduce((n, c) => n + c.quantity, 0);
  const coverId = deck.cards.find((c) => c.section === "main")?.cardId ?? deck.cards[0]?.cardId;
  const cover = useLiveQuery(
    () => (coverId != null ? db.cards.get(coverId) : undefined),
    [coverId]
  );

  async function duplicate() {
    const copy = await duplicateDeck(deck.id);
    if (copy) toast(`Duplicated "${deck.name}"`, "success");
  }

  async function wishlistMissing() {
    const missing = await deckMissingCardIds(deck.id);
    if (missing.length === 0) {
      toast("You already own everything in this deck", "info");
      return;
    }
    const added = await addManyToWishlist(missing);
    toast(
      added > 0
        ? `Added ${added} missing card${added === 1 ? "" : "s"} to your wishlist`
        : "Those are already on your wishlist",
      "success"
    );
  }

  const iconBtn =
    "pressable shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-raised active:bg-overlay text-neutral-300";

  return (
    <div className="panel flex items-center gap-2 p-2">
      <button
        type="button"
        onClick={() => onOpen(deck.id)}
        className="flex items-center gap-3 min-w-0 flex-1 text-left"
      >
        <CardThumb img={cover?.img} w="w-10" h="h-14" />
        <div className="min-w-0">
          <div className="font-medium truncate">{deck.name}</div>
          <div className="text-xs text-neutral-500">{total} main →</div>
        </div>
      </button>
      <button
        type="button"
        onClick={wishlistMissing}
        className={iconBtn}
        aria-label="Add missing cards to wishlist"
        title="Add missing cards to wishlist"
      >
        ♡+
      </button>
      <button
        type="button"
        onClick={duplicate}
        className={iconBtn}
        aria-label="Duplicate deck"
        title="Duplicate deck"
      >
        ⧉
      </button>
    </div>
  );
}

// ---------- Deck editor ----------

function AddCardSearch({
  deckId,
  target,
  enriched,
}: {
  deckId: string;
  target: DeckSection;
  enriched: EnrichedDeck | null;
}) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const results = useLiveQuery(async () => {
    const q = debouncedQuery.trim().toLowerCase();
    if (q.length < 2) return [] as MCard[];
    const rows = await db.cards.filter((c) => c.nameLower.includes(q)).limit(20).toArray();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [debouncedQuery], []);

  async function add(card: MCard) {
    const section = target;
    const existing = enriched?.deck.cards.find(
      (c) => c.cardId === card.id && c.section === section
    );
    await setDeckCard(deckId, card.id, section, (existing?.quantity ?? 0) + 1);
    toast(`Added ${card.name} to ${SECTION_LABEL[section]}`, "success");
  }

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Add a card to ${SECTION_LABEL[target]}…`}
        className="input-base w-full px-4 py-2.5 text-sm"
      />
      {results.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-2 max-h-64 overflow-y-auto">
          {results.map((c) => {
            const suggested = suggestSection(c.type);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => add(c)}
                className="pressable flex items-center gap-2 rounded-lg border border-line bg-raised p-1.5 text-left"
              >
                <CardThumb img={c.img} w="w-8" h="h-11" />
                <span className="text-sm flex-1 min-w-0 truncate">{c.name}</span>
                {suggested !== target && (
                  <span className="text-[10px] text-orange-400/80 shrink-0">usually {suggested}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DeckCardRow({
  deckId,
  c,
}: {
  deckId: string;
  c: EnrichedDeck["cards"][number];
}) {
  const short = c.owned < c.quantity;
  const openCard = useCardDetail();
  return (
    <div className="flex items-center gap-2 py-1">
      <button
        type="button"
        onClick={() => openCard(c.cardId)}
        className="flex items-center gap-2 min-w-0 flex-1 text-left"
      >
        <CardThumb img={c.img} w="w-8" h="h-11" />
        <div className="min-w-0 flex-1">
          <div className="text-sm leading-snug truncate">{c.name}</div>
          <div className={`text-xs ${short ? "text-orange-400" : "text-neutral-500"}`}>
            own {c.owned}/{c.quantity}
            {c.banlist ? ` · ${c.banlist}` : ""}
          </div>
        </div>
      </button>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setDeckCard(deckId, c.cardId, c.section, c.quantity - 1)}
          className="pressable w-7 h-7 rounded-md bg-raised active:bg-overlay"
        >
          −
        </button>
        <span className="w-4 text-center text-sm tabular-nums">{c.quantity}</span>
        <button
          type="button"
          onClick={() => setDeckCard(deckId, c.cardId, c.section, c.quantity + 1)}
          className="pressable w-7 h-7 rounded-md bg-raised active:bg-overlay"
        >
          +
        </button>
      </div>
    </div>
  );
}

// Free-text strategy notes (turn order, combo lines), saved on blur. Seeded
// automatically when the deck was copied from a meta deck.
function DeckNotes({ deckId, initial }: { deckId: string; initial: string }) {
  const [notes, setNotes] = useState(initial);
  const [open, setOpen] = useState(initial.length > 0);
  return (
    <div className="panel overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-raised text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-300">
          📝 How it plays
        </span>
        <span className="text-neutral-500 text-xs">{open ? "Hide" : notes ? "Show" : "Add"}</span>
      </button>
      {open && (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => void setDeckNotes(deckId, notes)}
          placeholder="Turn order, combo lines, what to search first…"
          className="w-full h-24 bg-transparent p-3 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none resize-y"
        />
      )}
    </div>
  );
}

function DeckEditor({ deckId, onBack }: { deckId: string; onBack: () => void }) {
  const [target, setTarget] = useState<DeckSection>("main");
  const [name, setName] = useState("");
  const [nameLoaded, setNameLoaded] = useState(false);
  const [testingHand, setTestingHand] = useState(false);
  const [showingOdds, setShowingOdds] = useState(false);
  const [format, setFormat] = useState<BanlistFormat>("tcg");
  // Hardware back returns to the deck list.
  useBackClose(onBack);

  const enriched = useLiveQuery(async () => {
    const d = await getDeck(deckId);
    return d ? await enrichDeck(d, format) : null;
  }, [deckId, format]);

  // Seed the name field once when the deck loads.
  useEffect(() => {
    if (enriched && !nameLoaded) {
      setName(enriched.deck.name);
      setNameLoaded(true);
    }
  }, [enriched, nameLoaded]);

  if (enriched === undefined) return <div className="p-4 text-neutral-500 text-sm">Loading…</div>;
  if (enriched === null) {
    return (
      <div className="p-4">
        <button type="button" onClick={onBack} className="text-sm text-neutral-400">
          ← Back
        </button>
        <p className="text-neutral-500 text-sm mt-4">Deck not found.</p>
      </div>
    );
  }

  const { validation } = enriched;

  async function exportYdk() {
    const deck = await getDeck(deckId);
    if (!deck) return;
    const blob = new Blob([deckToYdk(deck)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${enriched!.ydkName}.ydk`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Exported .ydk", "success");
  }

  async function removeDeck() {
    const snapshot = await getDeck(deckId);
    const ok = await confirmDialog({
      title: "Delete this deck?",
      message: enriched ? `"${enriched.deck.name}" will be removed.` : undefined,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await deleteDeck(deckId);
    toast(
      "Deck deleted",
      "info",
      snapshot ? { label: "Undo", onClick: () => void restoreDeck(snapshot) } : undefined
    );
    onBack();
  }

  const sections: DeckSection[] = ["main", "extra", "side"];

  return (
    <div className="page p-4 flex flex-col gap-3 pb-24">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="text-sm text-neutral-400 shrink-0">
          ←
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => renameDeck(deckId, name)}
          className="flex-1 bg-transparent font-semibold text-lg focus:outline-none border-b border-transparent focus:border-amber-800/60"
        />
      </div>

      {/* Which banlist to validate against. */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-500 shrink-0">Format</span>
        <div className="seg rounded-lg bg-raised p-0.5 text-xs flex-1">
          {(["tcg", "ocg", "goat"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              className={`seg-btn rounded-md py-1 ${format === f ? "seg-on" : ""}`}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {enriched.formatDataMissing && (
        <p className="text-[11px] text-orange-300 -mt-1">
          No {format.toUpperCase()} banlist data yet — re-sync cards on the Cards tab to load it.
        </p>
      )}

      {/* Validation summary */}
      <div
        className={`rounded-xl border px-3 py-2 text-xs ${
          validation.legal
            ? "bg-emerald-950/50 border-emerald-900/50 text-emerald-300"
            : "bg-orange-950/50 border-orange-900/50 text-orange-300"
        }`}
      >
        <div className="flex items-center gap-2 tabular-nums">
          <span>{validation.legal ? "✓ Legal" : "⚠ Not legal"}</span>
          <span className="text-neutral-400">
            Main {validation.mainCount} · Extra {validation.extraCount} · Side {validation.sideCount}
          </span>
        </div>
        {validation.errors.slice(0, 4).map((e, i) => (
          <div key={i} className="mt-0.5">
            {e}
          </div>
        ))}
      </div>

      {/* Composition + cost + how much of it you own, at a glance. */}
      {enriched.cards.length > 0 &&
        (() => {
          const s = computeDeckStats(enriched.cards);
          const uniqueOwned = enriched.cards.filter((c) => c.owned >= c.quantity).length;
          const missingCost = enriched.cards.reduce(
            (sum, c) => sum + Math.max(0, c.quantity - c.owned) * (c.price ?? 0),
            0
          );
          const complete = uniqueOwned === enriched.cards.length;
          return (
            <div className="flex flex-col gap-1 px-1">
              <div className="flex items-center justify-between text-xs text-neutral-400 tabular-nums">
                <span>
                  👹 {s.monsters} · ✨ {s.spells} · ⚡ {s.traps}
                </span>
                <span className="text-amber-400/90">
                  deck ≈ {formatUsd(s.priceUsd)}
                  {s.unpricedCount > 0 && (
                    <span className="text-neutral-600"> +{s.unpricedCount} unpriced</span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs tabular-nums">
                <span className={complete ? "text-emerald-400" : "text-neutral-400"}>
                  {complete ? "✓ You own every card" : `own ${uniqueOwned}/${enriched.cards.length} cards`}
                </span>
                {!complete && missingCost > 0 && (
                  <span className="text-orange-400/90">≈ {formatUsd(missingCost)} to finish</span>
                )}
              </div>
            </div>
          );
        })()}

      {/* Strategy notes — remounts when the deck record changes id. */}
      <DeckNotes key={deckId} deckId={deckId} initial={enriched.deck.notes ?? ""} />

      {/* Add cards — the search's placeholder names the target section;
          "＋ Add here" on a section header retargets it. */}
      <AddCardSearch deckId={deckId} target={target} enriched={enriched} />

      {/* Deck contents: every section always shows, each in its own panel
          with a divider header bar, so main/extra/side structure is obvious. */}
      {sections.map((s) => {
        const cards = enriched.cards.filter((c) => c.section === s);
        const count = cards.reduce((n, c) => n + c.quantity, 0);
        return (
          <section key={s} className="panel overflow-hidden">
            <header
              className={`flex items-center justify-between px-3 py-2 bg-raised ${
                cards.length > 0 ? "border-b border-line" : ""
              }`}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-300">
                {SECTION_LABEL[s]} <span className="text-neutral-500 font-normal">({count})</span>
              </h3>
              <button
                type="button"
                onClick={() => setTarget(s)}
                className={`text-[11px] px-2 py-1 -my-1 rounded-md transition-colors ${
                  target === s
                    ? "text-amber-300 bg-amber-400/10 font-medium"
                    : "text-neutral-500 active:text-neutral-300"
                }`}
              >
                {target === s ? "✓ Adding here" : "＋ Add here"}
              </button>
            </header>
            {cards.length > 0 && (
              <div className="divide-y divide-line/70 px-3">
                {cards.map((c) => (
                  <DeckCardRow key={`${c.cardId}-${c.section}`} deckId={deckId} c={c} />
                ))}
              </div>
            )}
          </section>
        );
      })}

      <div className="grid grid-cols-2 gap-2 mt-2">
        <button
          type="button"
          onClick={() => setTestingHand(true)}
          className="btn-ghost py-2.5 text-sm"
        >
          🎴 Test hand
        </button>
        <button
          type="button"
          onClick={() => setShowingOdds(true)}
          className="btn-ghost py-2.5 text-sm"
        >
          📊 Odds
        </button>
        <button
          type="button"
          onClick={exportYdk}
          className="btn-ghost py-2.5 text-sm"
        >
          Export .ydk
        </button>
        <button
          type="button"
          onClick={removeDeck}
          className="btn-danger py-2.5 text-sm"
        >
          Delete
        </button>
      </div>

      {testingHand && (
        <HandSimSheet cards={enriched.cards} onClose={() => setTestingHand(false)} />
      )}
      {showingOdds && (
        <DeckOddsSheet cards={enriched.cards} onClose={() => setShowingOdds(false)} />
      )}
    </div>
  );
}

export default function DecksPage({ onGoToCards }: { onGoToCards: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const cardCount = useLiveQuery(() => db.cards.count());

  if (!cardCount) {
    return <SyncFirstNotice reason="decks are built from it." onGoToCards={onGoToCards} />;
  }

  return openId ? (
    <DeckEditor deckId={openId} onBack={() => setOpenId(null)} />
  ) : (
    <DeckList onOpen={setOpenId} />
  );
}

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { DeckSection } from "@shared/deck/types";
import { parseYdk } from "@shared/deck/ydk";
import { db, type MCard } from "../db";
import {
  createDeck,
  deleteDeck,
  deckToYdk,
  enrichDeck,
  getDeck,
  listDecks,
  renameDeck,
  saveDeckFromYdk,
  setDeckCard,
  type EnrichedDeck,
} from "../services/decks";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { toast } from "../components/Toaster";

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
    <div className="p-4 flex flex-col gap-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={newDeck}
          className="flex-1 py-3 rounded-xl bg-emerald-700 active:bg-emerald-600 font-medium"
        >
          + New deck
        </button>
        <label className="px-3 py-3 rounded-xl bg-neutral-800 active:bg-neutral-700 text-sm cursor-pointer flex items-center">
          Import .ydk
          <input
            type="file"
            accept=".ydk,.txt"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && importYdk(e.target.files[0])}
          />
        </label>
      </div>

      {decks.length === 0 && (
        <p className="text-sm text-neutral-500 text-center py-10">
          No decks yet. Create one, or import a .ydk from Master Duel / EDOPro / YGOPRODeck.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {decks.map((d) => {
          const total = d.cards
            .filter((c) => c.section === "main")
            .reduce((n, c) => n + c.quantity, 0);
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onOpen(d.id)}
              className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-left"
            >
              <span className="font-medium">{d.name}</span>
              <span className="text-xs text-neutral-500">{total} main →</span>
            </button>
          );
        })}
      </div>
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
        className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-sm"
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
                className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-1.5 text-left"
              >
                {c.img ? (
                  <img src={c.img} alt="" className="w-8 rounded" loading="lazy" />
                ) : (
                  <div className="w-8 h-11 rounded bg-neutral-800" />
                )}
                <span className="text-sm flex-1 min-w-0 truncate">{c.name}</span>
                {suggested !== target && (
                  <span className="text-[10px] text-amber-400/80 shrink-0">usually {suggested}</span>
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
  return (
    <div className="flex items-center gap-2 py-1">
      {c.img ? (
        <img src={c.img} alt="" className="w-8 rounded" loading="lazy" />
      ) : (
        <div className="w-8 h-11 rounded bg-neutral-800" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-snug truncate">{c.name}</div>
        <div className={`text-xs ${short ? "text-amber-400" : "text-neutral-500"}`}>
          own {c.owned}/{c.quantity}
          {c.banlist ? ` · ${c.banlist}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setDeckCard(deckId, c.cardId, c.section, c.quantity - 1)}
          className="w-7 h-7 rounded bg-neutral-800 active:bg-neutral-700"
        >
          −
        </button>
        <span className="w-4 text-center text-sm tabular-nums">{c.quantity}</span>
        <button
          type="button"
          onClick={() => setDeckCard(deckId, c.cardId, c.section, c.quantity + 1)}
          className="w-7 h-7 rounded bg-neutral-800 active:bg-neutral-700"
        >
          +
        </button>
      </div>
    </div>
  );
}

function DeckEditor({ deckId, onBack }: { deckId: string; onBack: () => void }) {
  const [target, setTarget] = useState<DeckSection>("main");
  const [name, setName] = useState("");
  const [nameLoaded, setNameLoaded] = useState(false);

  const enriched = useLiveQuery(async () => {
    const d = await getDeck(deckId);
    return d ? await enrichDeck(d) : null;
  }, [deckId]);

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
    await deleteDeck(deckId);
    toast("Deck deleted", "info");
    onBack();
  }

  const sections: DeckSection[] = ["main", "extra", "side"];

  return (
    <div className="p-4 flex flex-col gap-3 pb-24">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="text-sm text-neutral-400 shrink-0">
          ←
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => renameDeck(deckId, name)}
          className="flex-1 bg-transparent font-semibold text-lg focus:outline-none border-b border-transparent focus:border-neutral-700"
        />
      </div>

      {/* Validation summary */}
      <div
        className={`rounded-lg px-3 py-2 text-xs ${
          validation.legal
            ? "bg-emerald-950/60 text-emerald-300"
            : "bg-amber-950/60 text-amber-300"
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

      {/* Add cards */}
      <div className="rounded-xl border border-neutral-800 p-3 flex flex-col gap-2">
        <div className="flex rounded-lg bg-neutral-900 border border-neutral-800 p-0.5 text-xs">
          {sections.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTarget(s)}
              className={`flex-1 py-1.5 rounded-md ${
                target === s ? "bg-neutral-700 text-white" : "text-neutral-400"
              }`}
            >
              {SECTION_LABEL[s]}
            </button>
          ))}
        </div>
        <AddCardSearch deckId={deckId} target={target} enriched={enriched} />
      </div>

      {/* Deck contents */}
      {sections.map((s) => {
        const cards = enriched.cards.filter((c) => c.section === s);
        if (cards.length === 0) return null;
        const count = cards.reduce((n, c) => n + c.quantity, 0);
        return (
          <div key={s}>
            <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-1 mt-1">
              {SECTION_LABEL[s]} ({count})
            </h3>
            <div className="divide-y divide-neutral-800/60">
              {cards.map((c) => (
                <DeckCardRow key={`${c.cardId}-${c.section}`} deckId={deckId} c={c} />
              ))}
            </div>
          </div>
        );
      })}

      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={exportYdk}
          className="flex-1 py-2.5 rounded-xl bg-neutral-800 active:bg-neutral-700 text-sm"
        >
          Export .ydk
        </button>
        <button
          type="button"
          onClick={removeDeck}
          className="px-4 py-2.5 rounded-xl bg-red-900/60 active:bg-red-900 text-red-200 text-sm"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export default function DecksPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const cardCount = useLiveQuery(() => db.cards.count());

  if (!cardCount) {
    return (
      <div className="p-6 text-center text-neutral-400 text-sm">
        Sync the card database first (Cards tab) to build decks.
      </div>
    );
  }

  return openId ? (
    <DeckEditor deckId={openId} onBack={() => setOpenId(null)} />
  ) : (
    <DeckList onOpen={setOpenId} />
  );
}

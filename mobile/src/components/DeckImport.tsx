import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { setOwnedMany } from "../services/collection";
import {
  getArchetypeCards,
  getMetaDeckCards,
  searchImportSources,
  type ImportCard,
  type ImportSourceResult,
} from "../services/deckImport";
import QuantityStepper, { stepperMax } from "./QuantityStepper";
import CardThumb from "./CardThumb";
import { useCardDetail } from "./CardDetailModal";
import { toast } from "./Toaster";

interface Selected {
  kind: "archetype" | "deck";
  key: string; // archetype name or deck id
  title: string;
}

export default function DeckImport() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ImportSourceResult>({ metaDecks: [], archetypes: [] });
  const [selected, setSelected] = useState<Selected | null>(null);
  const [cards, setCards] = useState<ImportCard[] | null>(null);
  const [loading, setLoading] = useState(false);
  const openCard = useCardDetail();

  const ownedMap = useLiveQuery(async () => {
    const map = new Map<number, number>();
    for (const e of await db.collection.toArray()) map.set(e.cardId, e.quantity);
    return map;
  });

  useEffect(() => {
    const t = setTimeout(async () => {
      setResults(await searchImportSources(query));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function open(sel: Selected) {
    setSelected(sel);
    setCards(null);
    setLoading(true);
    try {
      const list =
        sel.kind === "archetype"
          ? await getArchetypeCards(sel.key)
          : await getMetaDeckCards(sel.key);
      setCards(list);
    } finally {
      setLoading(false);
    }
  }

  async function bulkSet(qtyOf: (c: ImportCard) => number) {
    if (!cards) return;
    const entries = cards.map((c) => ({
      cardId: c.cardId,
      quantity: Math.min(stepperMax(c.banlist), qtyOf(c)),
    }));
    await setOwnedMany(entries);
    toast(`Updated ${entries.length} cards`, "success");
  }

  // ---- Card list for a chosen deck / archetype ----
  if (selected) {
    return (
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setCards(null);
          }}
          className="self-start text-sm text-neutral-400"
        >
          ← Back to search
        </button>
        <div>
          <h2 className="font-semibold">{selected.title}</h2>
          <p className="text-xs text-neutral-500">
            {selected.kind === "archetype"
              ? "All cards in this archetype. Set how many of each you own."
              : "This deck's cards. Set how many you own."}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => bulkSet((c) => c.suggestedQty)}
            className="pressable flex-1 py-2 rounded-lg bg-emerald-500/15 active:bg-emerald-500/25 text-emerald-200 border border-emerald-900/50 text-sm"
          >
            Own all {selected.kind === "deck" ? "(deck counts)" : "(×3)"}
          </button>
          <button
            type="button"
            onClick={() => bulkSet(() => 0)}
            className="btn-ghost px-3 py-2 rounded-lg text-sm"
          >
            Clear
          </button>
        </div>

        {loading && <div className="text-neutral-500 text-sm">Loading cards…</div>}
        <div className="flex flex-col gap-2">
          {cards?.map((c) => (
            <div
              key={c.cardId}
              className="flex items-center gap-3 panel p-2"
            >
              <button
                type="button"
                onClick={() => openCard(c.cardId)}
                className="flex items-center gap-3 min-w-0 flex-1 text-left"
              >
                <CardThumb img={c.img} w="w-10" h="h-14" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm leading-snug line-clamp-2">{c.name}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    {selected.kind === "deck" ? `deck runs ${c.suggestedQty}` : ""}
                    {c.price != null ? `${selected.kind === "deck" ? " · " : ""}$${c.price.toFixed(2)}` : ""}
                  </div>
                </div>
              </button>
              <QuantityStepper
                cardId={c.cardId}
                quantity={ownedMap?.get(c.cardId) ?? 0}
                max={stepperMax(c.banlist)}
              />
            </div>
          ))}
          {cards?.length === 0 && (
            <div className="text-neutral-500 text-sm">No cards found for this selection.</div>
          )}
        </div>
      </div>
    );
  }

  // ---- Search view ----
  const nothing =
    query.trim().length >= 2 &&
    results.metaDecks.length === 0 &&
    results.archetypes.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-neutral-500">
        Search a deck or archetype (e.g. <code>Dark Magician</code>) and import its cards into your
        collection.
      </p>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search decks & archetypes…"
        className="input-base w-full px-4 py-3 text-sm"
      />

      {results.metaDecks.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-1.5">Meta decks</h3>
          <div className="flex flex-col gap-2">
            {results.metaDecks.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => open({ kind: "deck", key: d.id, title: d.name })}
                className="pressable flex items-center justify-between panel px-3.5 py-3 text-left"
              >
                <span className="text-sm">{d.name}</span>
                <span className="text-xs text-neutral-500">{d.cardCount} cards →</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {results.archetypes.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-1.5">Archetypes</h3>
          <div className="flex flex-col gap-2">
            {results.archetypes.map((a) => (
              <button
                key={a.name}
                type="button"
                onClick={() => open({ kind: "archetype", key: a.name, title: a.name })}
                className="pressable flex items-center justify-between panel px-3.5 py-3 text-left"
              >
                <span className="text-sm">{a.name}</span>
                <span className="text-xs text-neutral-500">{a.cardCount} cards →</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {nothing && (
        <div className="text-neutral-500 text-sm text-center py-6">
          No decks or archetypes match “{query}”.
        </div>
      )}
    </div>
  );
}

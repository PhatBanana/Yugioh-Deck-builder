import { useMemo, useState } from "react";
import { chanceToDraw, chanceToOpenAny } from "@shared/deck/probability";
import type { EnrichedDeckCard } from "../services/decks";
import CardThumb from "./CardThumb";
import { useBackClose } from "../hooks/useBackClose";

// Advanced deck analytics: exact opening-hand odds (hypergeometric) for every
// main-deck card, plus a "consistency" reading — tap the cards you consider
// starters and see how often you open at least one of them (and how often you
// brick with none).
export default function DeckOddsSheet({
  cards,
  onClose,
}: {
  cards: EnrichedDeckCard[];
  onClose: () => void;
}) {
  useBackClose(onClose);
  const [handSize, setHandSize] = useState(5);
  const [starters, setStarters] = useState<Set<number>>(new Set());

  const main = useMemo(
    () =>
      cards
        .filter((c) => c.section === "main")
        .slice()
        .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name)),
    [cards]
  );
  const deckSize = useMemo(() => main.reduce((n, c) => n + c.quantity, 0), [main]);

  const starterCopies = useMemo(
    () => main.filter((c) => starters.has(c.cardId)).reduce((n, c) => n + c.quantity, 0),
    [main, starters]
  );
  const consistency = chanceToOpenAny(deckSize, starterCopies, handSize);

  const toggleStarter = (id: number) =>
    setStarters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

  return (
    <div className="sheet-backdrop z-[70] flex items-end justify-center" onClick={onClose}>
      <div
        className="sheet w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl p-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">📊 Deck odds</h2>
          <button type="button" onClick={onClose} className="text-neutral-400 text-2xl leading-none px-1" aria-label="Close">
            ×
          </button>
        </div>

        {deckSize < 1 ? (
          <p className="text-sm text-neutral-400 py-6 text-center">
            Add main-deck cards to see opening-hand odds.
          </p>
        ) : (
          <>
            <p className="text-xs text-neutral-500 mb-3">
              Exact odds from a {deckSize}-card main deck. Tap cards to mark them
              as <span className="text-amber-300">starters</span> — the bar shows
              how often you open at least one.
            </p>

            {/* Going first / second toggle. */}
            <div className="seg text-xs mb-3">
              {[5, 6].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHandSize(h)}
                  className={`seg-btn py-1.5 ${handSize === h ? "seg-on" : ""}`}
                >
                  {h === 5 ? "5 cards (1st)" : "6 cards (2nd)"}
                </button>
              ))}
            </div>

            {/* Consistency summary — only meaningful once starters are picked. */}
            <div className="panel p-3 mb-3">
              {starterCopies === 0 ? (
                <p className="text-xs text-neutral-500 text-center">
                  Tap your starters below to measure consistency.
                </p>
              ) : (
                <div className="flex items-center justify-around text-center tabular-nums">
                  <div>
                    <div className="text-2xl font-semibold text-emerald-400">{pct(consistency)}</div>
                    <div className="text-[11px] text-neutral-500">open a starter</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold text-red-400/90">{pct(1 - consistency)}</div>
                    <div className="text-[11px] text-neutral-500">brick (none)</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold text-amber-300">{starterCopies}</div>
                    <div className="text-[11px] text-neutral-500">starter copies</div>
                  </div>
                </div>
              )}
            </div>

            {/* Per-card open odds. */}
            <div className="divide-y divide-line/70">
              {main.map((c) => {
                const isStarter = starters.has(c.cardId);
                const open = chanceToDraw(deckSize, c.quantity, handSize, 1);
                return (
                  <button
                    key={c.cardId}
                    type="button"
                    onClick={() => toggleStarter(c.cardId)}
                    className="flex items-center gap-2.5 w-full text-left py-1.5"
                  >
                    <CardThumb img={c.img} w="w-7" h="h-10" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate flex items-center gap-1">
                        {isStarter && <span className="text-amber-300">★</span>}
                        <span className={isStarter ? "text-amber-100" : ""}>{c.name}</span>
                      </div>
                      <div className="text-[11px] text-neutral-500 tabular-nums">×{c.quantity}</div>
                    </div>
                    <div className="text-right tabular-nums shrink-0">
                      <div className="text-sm text-neutral-200">{pct(open)}</div>
                      <div className="text-[10px] text-neutral-600">to open</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

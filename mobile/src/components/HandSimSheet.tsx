import { useCallback, useMemo, useState } from "react";
import { buildPile, drawHand } from "@shared/deck/handSim";
import type { EnrichedDeckCard } from "../services/decks";
import CardThumb from "./CardThumb";
import { useBackClose } from "../hooks/useBackClose";

// Opening-hand simulator for a deck's main deck: draw 5, redraw, or draw a
// 6th to mimic going second.
export default function HandSimSheet({
  cards,
  onClose,
}: {
  cards: EnrichedDeckCard[];
  onClose: () => void;
}) {
  useBackClose(onClose);
  const main = useMemo(() => cards.filter((c) => c.section === "main"), [cards]);
  const byId = useMemo(() => new Map(main.map((c) => [c.cardId, c])), [main]);
  const pile = useMemo(() => buildPile(main), [main]);

  const [hand, setHand] = useState<number[]>(() => drawHand(pile, 5));
  const [draws, setDraws] = useState(1);

  const redraw = useCallback(() => {
    setHand(drawHand(pile, 5));
    setDraws((d) => d + 1);
  }, [pile]);

  const drawSixth = useCallback(() => {
    setHand((prev) => {
      if (prev.length >= 6) return prev;
      // Remove the current hand from the pile, then draw 1 more.
      const rest = [...pile];
      for (const id of prev) {
        const i = rest.indexOf(id);
        if (i !== -1) rest.splice(i, 1);
      }
      return [...prev, ...drawHand(rest, 1)];
    });
  }, [pile]);

  return (
    <div className="sheet-backdrop z-[70] flex items-end justify-center" onClick={onClose}>
      <div
        className="sheet w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl p-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">Test hand</h2>
          <button type="button" onClick={onClose} className="text-neutral-400 text-2xl leading-none px-1" aria-label="Close">
            ×
          </button>
        </div>
        <p className="text-xs text-neutral-500 mb-3">
          Drawn from your {pile.length}-card main deck · draw #{draws}
        </p>

        {pile.length < 5 ? (
          <p className="text-sm text-neutral-400 py-6 text-center">
            Add at least 5 main-deck cards to test hands.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-5 gap-1.5">
              {hand.map((id, i) => {
                const card = byId.get(id);
                return (
                  <div key={`${id}-${i}`} className="flex flex-col items-center gap-1">
                    <CardThumb img={card?.img} w="w-full" h="h-20" />
                    <span className="text-[9px] leading-tight text-neutral-400 text-center line-clamp-2">
                      {card?.name ?? `#${id}`}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={redraw} className="btn-primary flex-1 py-2.5 text-sm">
                🎴 Draw again
              </button>
              <button
                type="button"
                onClick={drawSixth}
                disabled={hand.length >= 6 || pile.length < 6}
                className="btn-ghost px-4 py-2.5 text-sm"
              >
                +1 (going 2nd)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

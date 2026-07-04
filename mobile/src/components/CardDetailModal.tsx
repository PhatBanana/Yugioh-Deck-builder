import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { MCard } from "../db";
import { db } from "../db";
import QuantityStepper, { stepperMax } from "./QuantityStepper";
import WishlistButton from "./WishlistButton";

// A labelled stat, rendered only when the value is present.
function Stat({ label, value }: { label: string; value: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-3 border-b border-neutral-800/60 py-1 text-sm">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-neutral-200 text-right">{value}</dd>
    </div>
  );
}

// Opens the detail modal for a card id (fetches the record). Renders nothing
// until the card is loaded. Handy for lists that only have card ids.
export function CardDetailById({ cardId, onClose }: { cardId: number; onClose: () => void }) {
  const card = useLiveQuery(() => db.cards.get(cardId), [cardId]);
  return card ? <CardDetailModal card={card} onClose={onClose} /> : null;
}

export default function CardDetailModal({
  card,
  onClose,
}: {
  card: MCard;
  onClose: () => void;
}) {
  const owned = useLiveQuery(
    async () => (await db.collection.get(card.id))?.quantity ?? 0,
    [card.id],
    0
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-neutral-900 border border-neutral-800 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="text-lg font-semibold leading-tight">{card.name}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 text-2xl leading-none px-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex gap-4">
          {card.img ? (
            <img src={card.img} alt={card.name} className="w-32 rounded-lg shrink-0" />
          ) : (
            <div className="w-32 h-44 rounded-lg bg-neutral-800 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {card.banlist && (
                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-900/60 text-red-200">
                  {card.banlist}
                </span>
              )}
              {card.price != null && (
                <span className="text-sm text-amber-400/90 tabular-nums">
                  ${card.price.toFixed(2)}
                </span>
              )}
            </div>
            <dl>
              <Stat label="Type" value={card.type} />
              <Stat label="Attribute" value={card.attribute} />
              <Stat label="Race" value={card.race} />
              <Stat label="Archetype" value={card.archetype} />
              <Stat label="Level/Rank" value={card.level} />
              <Stat label="ATK" value={card.atk} />
              <Stat label="DEF" value={card.def} />
            </dl>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 mt-3">
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <span>Owned</span>
            <QuantityStepper cardId={card.id} quantity={owned} max={stepperMax(card.banlist)} />
          </div>
          <WishlistButton cardId={card.id} className="text-2xl" />
        </div>

        {card.desc && (
          <p className="mt-3 pt-3 border-t border-neutral-800 text-sm text-neutral-300 whitespace-pre-line leading-relaxed">
            {card.desc}
          </p>
        )}
      </div>
    </div>
  );
}

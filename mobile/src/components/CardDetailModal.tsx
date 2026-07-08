import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CONDITION_LABEL, type CardCondition } from "@shared/grading/analyze";
import type { MCard } from "../db";
import { db } from "../db";
import { getCardUsage, type DeckUsageEntry } from "../services/decks";
import { setCondition } from "../services/collection";
import QuantityStepper, { stepperMax } from "./QuantityStepper";
import WishlistButton from "./WishlistButton";
import GradeCardSheet from "./GradeCardSheet";
import { toast } from "./Toaster";

const CONDITIONS: CardCondition[] = ["NM", "LP", "MP", "HP", "DMG"];

// Condition chips + camera grading, shown once the card is owned.
function ConditionRow({ cardId, condition }: { cardId: number; condition?: CardCondition }) {
  const [grading, setGrading] = useState(false);
  return (
    <div className="mt-3 pt-3 border-t border-neutral-800">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-neutral-400">
          Condition{condition ? ` — ${CONDITION_LABEL[condition]}` : ""}
        </span>
        <button
          type="button"
          onClick={() => setGrading(true)}
          className="text-xs text-emerald-400 active:text-emerald-300"
        >
          📷 Grade with camera
        </button>
      </div>
      <div className="flex gap-1.5">
        {CONDITIONS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => void setCondition(cardId, condition === c ? undefined : c)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${
              condition === c
                ? "bg-emerald-700 text-white"
                : "bg-neutral-800 text-neutral-400 active:bg-neutral-700"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      {grading && (
        <GradeCardSheet
          onClose={() => setGrading(false)}
          onSaveCondition={(c) => {
            void setCondition(cardId, c);
            toast(`Condition saved: ${CONDITION_LABEL[c]}`, "success");
          }}
        />
      )}
    </div>
  );
}

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

function deckNames(list: DeckUsageEntry[]): string {
  const shown = list.slice(0, 6).map((d) => d.name);
  const more = list.length - shown.length;
  return shown.join(", ") + (more > 0 ? `, +${more} more` : "");
}

// Which meta decks and which of the user's decks run this card.
function DeckUsage({ cardId }: { cardId: number }) {
  const usage = useLiveQuery(() => getCardUsage(cardId), [cardId]);
  if (!usage || (usage.meta.length === 0 && usage.mine.length === 0)) return null;
  return (
    <div className="mt-3 pt-3 border-t border-neutral-800 text-sm">
      <div className="text-xs font-semibold text-neutral-400 mb-1">Used in decks</div>
      {usage.meta.length > 0 && (
        <p className="text-neutral-300">
          <span className="font-medium text-neutral-100">{usage.meta.length}</span> meta deck
          {usage.meta.length === 1 ? "" : "s"}
          <span className="text-neutral-500"> — {deckNames(usage.meta)}</span>
        </p>
      )}
      {usage.mine.length > 0 && (
        <p className="text-emerald-300 mt-0.5">
          In {usage.mine.length} of your deck{usage.mine.length === 1 ? "" : "s"}
          <span className="text-neutral-500"> — {deckNames(usage.mine)}</span>
        </p>
      )}
    </div>
  );
}

export default function CardDetailModal({
  card,
  onClose,
}: {
  card: MCard;
  onClose: () => void;
}) {
  const entry = useLiveQuery(() => db.collection.get(card.id), [card.id]);
  const owned = entry?.quantity ?? 0;

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

        {owned > 0 && <ConditionRow cardId={card.id} condition={entry?.condition} />}

        <DeckUsage cardId={card.id} />

        {card.desc && (
          <p className="mt-3 pt-3 border-t border-neutral-800 text-sm text-neutral-300 whitespace-pre-line leading-relaxed">
            {card.desc}
          </p>
        )}
      </div>
    </div>
  );
}

// Opens the detail modal for a card id (fetches the record). Renders nothing
// until the card is loaded.
export function CardDetailById({ cardId, onClose }: { cardId: number; onClose: () => void }) {
  const card = useLiveQuery(() => db.cards.get(cardId), [cardId]);
  return card ? <CardDetailModal card={card} onClose={onClose} /> : null;
}

// App-wide provider: any component can call useCardDetail()(cardId) to open the
// card detail sheet, without threading state through the page tree.
const CardDetailContext = createContext<(cardId: number) => void>(() => {});

export function useCardDetail() {
  return useContext(CardDetailContext);
}

export function CardDetailProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<number | null>(null);
  return (
    <CardDetailContext.Provider value={setId}>
      {children}
      {id != null && <CardDetailById cardId={id} onClose={() => setId(null)} />}
    </CardDetailContext.Provider>
  );
}

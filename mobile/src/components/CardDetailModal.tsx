import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CONDITION_LABEL, type CardCondition } from "@shared/grading/analyze";
import type { MCard, MCardSets, MCollectionEntry } from "../db";
import { db } from "../db";
import { getCardUsage, type DeckUsageEntry } from "../services/decks";
import { setCondition } from "../services/collection";
import { getCardPrintings, setPrinting } from "../services/printings";
import QuantityStepper, { stepperMax } from "./QuantityStepper";
import WishlistButton from "./WishlistButton";
import PriceSparkline from "./PriceSparkline";
import { useBackClose } from "../hooks/useBackClose";
import GradeCardSheet from "./GradeCardSheet";
import { toast } from "./Toaster";

const CONDITIONS: CardCondition[] = ["NM", "LP", "MP", "HP", "DMG"];

// Condition chips + camera grading, shown once the card is owned.
function ConditionRow({ cardId, condition }: { cardId: number; condition?: CardCondition }) {
  const [grading, setGrading] = useState(false);
  return (
    <div className="mt-3 pt-3 border-t border-line">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-neutral-400">
          Condition{condition ? ` — ${CONDITION_LABEL[condition]}` : ""}
        </span>
        <button
          type="button"
          onClick={() => setGrading(true)}
          className="text-xs text-amber-400 active:text-amber-300"
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
            className={`pressable flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              condition === c
                ? "bg-amber-400/20 border-amber-800/60 text-amber-200"
                : "bg-raised border-line text-neutral-400 active:bg-overlay"
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

// Which printing (set + rarity) the owned copies are, chosen from the card's
// known sets — fetched on demand and cached, since the bulk sync strips them.
function PrintingRow({ cardId, entry }: { cardId: number; entry?: MCollectionEntry }) {
  const [sets, setSets] = useState<MCardSets["sets"] | null>(null);
  useEffect(() => {
    let cancelled = false;
    getCardPrintings(cardId).then((s) => !cancelled && setSets(s));
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  const value = entry?.printing ? `${entry.printing.code}|${entry.printing.rarity}` : "";
  const selected = sets?.find((s) => `${s.code}|${s.rarity}` === value);

  if (sets === null)
    return <p className="mt-3 text-xs text-neutral-600">Loading printings…</p>;
  if (sets.length === 0)
    return (
      <p className="mt-3 text-xs text-neutral-600">
        No printing data available{navigator.onLine ? "" : " (offline)"}.
      </p>
    );

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-neutral-400">Printing</span>
        {selected?.price != null && (
          <span className="text-xs text-amber-400/90 tabular-nums">
            this printing ≈ ${selected.price.toFixed(2)}
          </span>
        )}
      </div>
      <select
        className="input-base w-full rounded-lg px-3 py-2 text-sm"
        value={value}
        onChange={(e) => {
          const next = sets.find((s) => `${s.code}|${s.rarity}` === e.target.value);
          void setPrinting(cardId, next ? { code: next.code, rarity: next.rarity } : undefined);
        }}
      >
        <option value="">Printing not set</option>
        {sets.map((s) => (
          <option key={`${s.code}|${s.rarity}`} value={`${s.code}|${s.rarity}`}>
            {s.code} · {s.rarity}
            {s.price != null ? ` · $${s.price.toFixed(2)}` : ""}
          </option>
        ))}
      </select>
      {selected?.name && <p className="text-[11px] text-neutral-600 mt-1">{selected.name}</p>}
    </div>
  );
}

// Fullscreen card art, opened by tapping the card image in the detail sheet.
// The card DB only stores thumbnail URLs, but YGOPRODeck serves the full-size
// scan at a predictable URL per card id; fall back to the thumb if it 404s.
function CardArtViewer({ card, onClose }: { card: MCard; onClose: () => void }) {
  const [src, setSrc] = useState(`https://images.ygoprodeck.com/images/cards/${card.id}.jpg`);
  useBackClose(onClose);
  return (
    <div
      className="fixed inset-0 z-[90] bg-black/95 flex items-center justify-center p-3"
      onClick={(e) => {
        // Don't let the close-tap bubble to the detail sheet's backdrop.
        e.stopPropagation();
        onClose();
      }}
      role="button"
      aria-label="Close card art"
    >
      <img
        src={src}
        alt={card.name}
        className="max-w-full max-h-full rounded-xl"
        onError={() => card.img && src !== card.img && setSrc(card.img)}
      />
      <span className="absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] text-xs text-neutral-500">
        Tap anywhere to close
      </span>
    </div>
  );
}

// A labelled stat, rendered only when the value is present.
function Stat({ label, value }: { label: string; value: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-3 border-b border-line/70 py-1 text-sm">
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
    <div className="mt-3 pt-3 border-t border-line text-sm">
      <div className="text-xs font-semibold text-neutral-400 mb-1">Used in decks</div>
      {usage.meta.length > 0 && (
        <p className="text-neutral-300">
          <span className="font-medium text-neutral-100">{usage.meta.length}</span> meta deck
          {usage.meta.length === 1 ? "" : "s"}
          <span className="text-neutral-500"> — {deckNames(usage.meta)}</span>
        </p>
      )}
      {usage.mine.length > 0 && (
        <p className="text-amber-300 mt-0.5">
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
  const [artOpen, setArtOpen] = useState(false);
  useBackClose(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop z-[70] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="sheet w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl p-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle sm:hidden" />
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
            <button
              type="button"
              onClick={() => setArtOpen(true)}
              className="shrink-0 self-start"
              aria-label="Show full card art"
            >
              <img src={card.img} alt={card.name} className="w-32 rounded-lg ring-1 ring-white/10" />
            </button>
          ) : (
            <div className="w-32 h-44 rounded-lg bg-raised ring-1 ring-white/5 shrink-0" />
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
        {owned > 0 && <PrintingRow cardId={card.id} entry={entry} />}

        <PriceSparkline cardId={card.id} />

        <DeckUsage cardId={card.id} />

        {card.desc && (
          <p className="mt-3 pt-3 border-t border-line text-sm text-neutral-300 whitespace-pre-line leading-relaxed">
            {card.desc}
          </p>
        )}
      </div>

      {artOpen && <CardArtViewer card={card} onClose={() => setArtOpen(false)} />}
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

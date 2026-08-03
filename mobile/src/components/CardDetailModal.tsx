import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CONDITION_LABEL, type CardCondition } from "@shared/grading/analyze";
import type { MCard, MCardSets, MCollectionEntry } from "../db";
import { db } from "../db";
import { formatUsd } from "../lib/util";
import { foilClass, topRarity } from "../lib/foil";
import { getCardUsage, type DeckUsageEntry } from "../services/decks";
import { adjustPrintingCopy, allTags, setCondition, setTags } from "../services/collection";
import { getCardPrintings } from "../services/printings";
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

// The per-printing breakdown of the owned copies: each rarity/edition you own
// as its own line, valued at that printing's own price. Copies are added by
// scanning (which reads the set code) or here, by picking from the card's known
// sets — fetched on demand and cached, since the bulk sync strips them.
function PrintingRow({ cardId, entry }: { cardId: number; entry?: MCollectionEntry }) {
  const [sets, setSets] = useState<MCardSets["sets"] | null>(null);
  const [adding, setAdding] = useState(false);
  const [addEdition, setAddEdition] = useState("");
  useEffect(() => {
    let cancelled = false;
    getCardPrintings(cardId).then((s) => !cancelled && setSets(s));
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  const owned = entry?.quantity ?? 0;
  const copies = entry?.copies ?? [];
  const assigned = copies.reduce((n, c) => n + c.quantity, 0);
  const unassigned = Math.max(0, owned - assigned);
  const priceFor = (code?: string, rarity?: string) =>
    sets?.find((s) => s.code === code && s.rarity === rarity)?.price ?? null;

  if (owned === 0)
    return (
      <p className="mt-3 text-xs text-neutral-600">
        Add this card to your collection to track its printings and rarity.
      </p>
    );

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-neutral-400">Printings</span>
        {sets && sets.length > 0 && (
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            className="text-xs text-amber-300 active:text-amber-200 px-1"
          >
            {adding ? "Cancel" : "＋ Add printing"}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {copies.map((c, i) => {
          const each = priceFor(c.code, c.rarity);
          return (
            <div key={i} className="flex items-center gap-2 panel px-2.5 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">
                  {c.rarity ?? "Unknown rarity"}
                  {c.edition ? ` · ${c.edition}` : ""}
                </div>
                <div className="text-[11px] text-neutral-500 tabular-nums">
                  {c.code ?? "no set code"}
                  {each != null ? ` · ${formatUsd(each)} ea` : ""}
                </div>
              </div>
              <CopyStepper
                qty={c.quantity}
                onStep={(d) =>
                  void adjustPrintingCopy(
                    cardId,
                    { code: c.code, rarity: c.rarity, edition: c.edition },
                    d
                  )
                }
              />
            </div>
          );
        })}

        {unassigned > 0 && (
          <div className="flex items-center justify-between panel px-2.5 py-1.5 text-sm text-neutral-400">
            <span>{unassigned}× printing not set</span>
            <span className="text-[11px] text-neutral-600">generic price</span>
          </div>
        )}
      </div>

      {adding && sets && (
        <div className="mt-2 panel p-2.5">
          <div className="seg text-[11px] mb-2">
            {EDITIONS.map((ed) => (
              <button
                key={ed.label}
                type="button"
                onClick={() => setAddEdition((v) => (v === ed.value ? "" : ed.value))}
                className={`seg-btn px-2 py-1 ${addEdition === ed.value ? "seg-on" : ""}`}
              >
                {ed.label}
              </button>
            ))}
          </div>
          <select
            className="input-base w-full rounded-lg px-3 py-2 text-sm"
            defaultValue=""
            onChange={(e) => {
              const s = sets.find((x) => `${x.code}|${x.rarity}` === e.target.value);
              if (!s) return;
              void adjustPrintingCopy(
                cardId,
                { code: s.code, rarity: s.rarity, edition: addEdition || undefined },
                1
              );
              setAdding(false);
              setAddEdition("");
            }}
          >
            <option value="">Choose a printing to add…</option>
            {sets.map((s) => (
              <option key={`${s.code}|${s.rarity}`} value={`${s.code}|${s.rarity}`}>
                {s.code} · {s.rarity}
                {s.price != null ? ` · ${formatUsd(s.price)}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function CopyStepper({ qty, onStep }: { qty: number; onStep: (delta: number) => void }) {
  const btn =
    "pressable w-8 h-8 flex items-center justify-center rounded-lg bg-raised border border-line active:bg-overlay text-base";
  return (
    <div className="flex items-center gap-2 shrink-0">
      <button type="button" onClick={() => onStep(-1)} className={btn} aria-label="Remove one">
        −
      </button>
      <span className="w-4 text-center tabular-nums text-sm">{qty}</span>
      <button type="button" onClick={() => onStep(1)} className={btn} aria-label="Add one">
        +
      </button>
    </div>
  );
}

const EDITIONS: { label: string; value: string }[] = [
  { label: "1st", value: "1st Edition" },
  { label: "Unlimited", value: "Unlimited" },
  { label: "Limited", value: "Limited Edition" },
];

// Binders/tags the owned copies are filed under: current tags as removable
// chips, one-tap suggestions from binders used elsewhere, plus a free input.
function BindersRow({ cardId, tags }: { cardId: number; tags: string[] }) {
  const [draft, setDraft] = useState("");
  const suggestions = useLiveQuery(
    async () => (await allTags()).filter((t) => !tags.includes(t)).slice(0, 6),
    [tags],
    []
  );

  const add = (name: string) => {
    if (!name.trim()) return;
    void setTags(cardId, [...tags, name]);
    setDraft("");
  };

  return (
    <div className="mt-3">
      <span className="block text-xs font-semibold text-neutral-400 mb-1.5">Binders</span>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-amber-400/15 border border-amber-900/50 text-amber-200"
          >
            {t}
            <button
              type="button"
              aria-label={`Remove from ${t}`}
              onClick={() => void setTags(cardId, tags.filter((x) => x !== t))}
              className="text-amber-200/70"
            >
              ✕
            </button>
          </span>
        ))}
        {suggestions.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => add(t)}
            className="text-xs px-2 py-1 rounded-full bg-raised border border-line text-neutral-400"
          >
            ＋ {t}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add(draft)}
          placeholder="New binder (e.g. trade binder)…"
          className="input-base flex-1 rounded-lg px-3 py-1.5 text-xs"
        />
        {draft.trim() && (
          <button type="button" onClick={() => add(draft)} className="btn-ghost px-3 py-1.5 rounded-lg text-xs">
            Add
          </button>
        )}
      </div>
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
              className="shrink-0 self-start relative"
              aria-label="Show full card art"
            >
              <img src={card.img} alt={card.name} className="w-32 rounded-lg ring-1 ring-white/10" />
              {foilClass(topRarity(entry?.copies)) && (
                <span aria-hidden className={`foil ${foilClass(topRarity(entry?.copies))}`} />
              )}
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
                  {formatUsd(card.price)}
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
        {owned > 0 && <BindersRow cardId={card.id} tags={entry?.tags ?? []} />}

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

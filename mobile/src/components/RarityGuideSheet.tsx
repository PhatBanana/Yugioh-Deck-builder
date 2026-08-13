import { useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  guideReferenceUrl,
  RARITY_GUIDE,
  type RarityGuideEntry,
} from "@shared/scan/rarityGuide";
import { db } from "../db";
import { foilClass } from "../lib/foil";
import { useBackClose } from "../hooks/useBackClose";

// "What does this rarity look like?" — a reference sheet for telling tiers
// apart by eye, with each entry rendered using the app's own foil emulation
// on a real card image. No API serves per-rarity photos (every card's catalog
// image is shared across printings), so the description is the substance and
// the swatch is the illustration; a Yugipedia link covers real scans.
export default function RarityGuideSheet({
  focus,
  onClose,
}: {
  focus?: string; // rarity to scroll to, when opened from a picker
  onClose: () => void;
}) {
  useBackClose(onClose);
  // A real card image makes the foils read properly. Any owned card with art
  // works; fall back to the first card in the database.
  const sample = useLiveQuery(async () => {
    const owned = await db.collection.filter((e) => e.quantity > 0).first();
    const card = owned ? await db.cards.get(owned.cardId) : undefined;
    if (card?.img) return card;
    return db.cards.filter((c) => !!c.img).first();
  }, []);

  const focusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus && focusRef.current) {
      focusRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focus, sample]);

  return (
    <div className="sheet-backdrop z-[85] flex items-end justify-center" onClick={onClose}>
      <div
        className="sheet w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl p-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">📖 Rarity guide</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 text-2xl leading-none px-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="text-xs text-neutral-500 mb-3">
          How to tell rarities apart by eye. The swatches are this app's foil
          emulation — close, but tilt the real card under a light for the
          truth. Tap any tier for photos on Yugipedia.
        </p>

        <div className="flex flex-col gap-2">
          {RARITY_GUIDE.map((entry) => (
            <GuideRow
              key={entry.rarity}
              entry={entry}
              img={sample?.img ?? null}
              highlighted={focus?.toLowerCase() === entry.rarity.toLowerCase()}
              rowRef={focus?.toLowerCase() === entry.rarity.toLowerCase() ? focusRef : undefined}
            />
          ))}
        </div>

        <p className="text-[11px] text-neutral-600 mt-3">
          Rarity is a foil finish, not different artwork — every printing of a
          card shares one picture, which is why the same art appears above with
          different sheens.
        </p>
      </div>
    </div>
  );
}

function GuideRow({
  entry,
  img,
  highlighted,
  rowRef,
}: {
  entry: RarityGuideEntry;
  img: string | null;
  highlighted: boolean;
  rowRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const foil = foilClass(entry.rarity);
  const t = entry.traits;
  const chips: string[] = [];
  if (t.name) chips.push(`${t.name === "plain" ? "plain ink" : t.name} name`);
  if (t.artFoiled !== undefined) chips.push(t.artFoiled ? "shiny art" : "matte art");
  if (t.embossed) chips.push("raised texture");

  return (
    <div
      ref={rowRef}
      className={`panel p-3 ${highlighted ? "ring-1 ring-amber-400/60" : ""}`}
    >
      <div className="flex gap-3">
        <span className="relative shrink-0 w-14">
          {img ? (
            <img src={img} alt="" className="w-full rounded-md ring-1 ring-white/10" loading="lazy" />
          ) : (
            <span className="block w-14 h-20 rounded-md bg-raised" />
          )}
          {foil && <span aria-hidden className={`foil ${foil}`} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="text-sm font-semibold text-neutral-100">{entry.rarity}</h3>
            <span className="text-[11px] text-neutral-500">{entry.abbrev}</span>
          </div>
          <p className="text-xs text-neutral-300 mt-0.5 leading-relaxed">{entry.tell}</p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {chips.map((c) => (
              <span
                key={c}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface border border-line text-neutral-400"
              >
                {c}
              </span>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 mt-1.5">
            <span className="text-[11px] text-neutral-500 truncate">
              {entry.era} · {entry.frequency}
            </span>
            <button
              type="button"
              onClick={() => window.open(guideReferenceUrl(entry.rarity), "_blank")}
              className="text-[11px] text-amber-300/90 shrink-0"
            >
              Photos ↗
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

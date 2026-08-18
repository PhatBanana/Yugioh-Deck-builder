import { useEffect, useRef, useState } from "react";
import {
  guideEntryFor,
  guideReferenceUrl,
  RARITY_GUIDE,
  type RarityGuideEntry,
} from "@shared/scan/rarityGuide";
import { db, type MCard } from "../db";
import CardThumb from "./CardThumb";
import BottomSheet from "./BottomSheet";

// "What does this rarity look like?" — a reference sheet for telling tiers
// apart by eye, with each entry rendered using the app's own foil emulation
// on a real card image. No API serves per-rarity photos (every card's catalog
// image is shared across printings), so the description is the substance and
// the swatch is the illustration; a Yugipedia link covers real scans.
export default function RarityGuideSheet({
  focus,
  onClose,
}: {
  focus?: string; // printed rarity to scroll to, when opened from a picker
  onClose: () => void;
}) {
  // A real card image makes the foils read properly. Any owned card with art
  // works; fall back to the first card in the database. One-shot fetch — a
  // live query here would subscribe unindexed scans to every cards/collection
  // write for a purely decorative image.
  const [sample, setSample] = useState<MCard | undefined>();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const owned = await db.collection.filter((e) => e.quantity > 0).first();
      const card = owned ? await db.cards.get(owned.cardId) : undefined;
      return card?.img ? card : db.cards.filter((c) => !!c.img).first();
    })().then((c) => !cancelled && setSample(c));
    return () => {
      cancelled = true;
    };
  }, []);

  // Printed rarities carry prefixes ("Platinum Secret Rare") — resolve to the
  // guide tier the shared way instead of hoping for an exact string match.
  const focusRarity = focus ? guideEntryFor(focus)?.rarity : undefined;
  const focusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusRarity && focusRef.current) {
      focusRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusRarity, sample]);

  return (
    <BottomSheet onClose={onClose} title="📖 Rarity guide" layer="above">
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
            rowRef={entry.rarity === focusRarity ? focusRef : undefined}
          />
        ))}
      </div>

      <p className="text-[11px] text-neutral-600 mt-3">
        Rarity is a foil finish, not different artwork — every printing of a
        card shares one picture, which is why the same art appears above with
        different sheens.
      </p>
    </BottomSheet>
  );
}

function GuideRow({
  entry,
  img,
  rowRef,
}: {
  entry: RarityGuideEntry;
  img: string | null;
  rowRef?: React.RefObject<HTMLDivElement | null>; // set = this row is focused
}) {
  const t = entry.traits;
  const chips: string[] = [];
  if (t.name) chips.push(`${t.name === "plain" ? "plain ink" : t.name} name`);
  if (t.artFoiled !== undefined) chips.push(t.artFoiled ? "shiny art" : "matte art");
  if (t.embossed) chips.push("raised texture");

  return (
    <div ref={rowRef} className={`panel p-3 ${rowRef ? "ring-1 ring-amber-400/60" : ""}`}>
      <div className="flex gap-3">
        <CardThumb img={img} w="w-14" h="h-20" rarity={entry.rarity} />
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

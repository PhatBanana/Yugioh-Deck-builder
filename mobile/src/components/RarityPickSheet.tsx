import { pullShare, type RarityCandidate } from "@shared/scan/rarityPrior";
import { rarityAbbrev } from "@shared/scan/setCode";
import { foilClass } from "../lib/foil";
import { formatUsd } from "../lib/util";
import { useBackClose } from "../hooks/useBackClose";

// One-tap rarity disambiguation: when a set code maps to several rarities,
// judging the foil by eye is the hard part — so each candidate shows its foil
// sheen on the card art, its own market price, and how common the pull is.
// Candidates arrive prior-ranked (most likely first).
export default function RarityPickSheet({
  cardName,
  img,
  candidates,
  current,
  onPick,
  onClose,
}: {
  cardName: string;
  img: string | null;
  candidates: RarityCandidate[];
  current?: string; // the currently-filed (guessed) rarity
  onPick: (c: RarityCandidate) => void;
  onClose: () => void;
}) {
  useBackClose(onClose);
  return (
    <div className="sheet-backdrop z-[80] flex items-end justify-center" onClick={onClose}>
      <div
        className="sheet w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-t-3xl p-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold leading-tight truncate pr-2">
            Which rarity is it?
          </h2>
          <button type="button" onClick={onClose} className="text-neutral-400 text-2xl leading-none px-1" aria-label="Close">
            ×
          </button>
        </div>
        <p className="text-xs text-neutral-500 mb-3 truncate">
          {cardName} — this set printed it at {candidates.length} rarities. Match
          the foil on your card.
        </p>

        <div className="flex flex-col gap-1.5">
          {candidates.map((c) => {
            const foil = foilClass(c.rarity);
            const share = pullShare(c.rarity, candidates);
            const isCurrent = c.rarity === current;
            return (
              <button
                key={`${c.code}|${c.rarity}`}
                type="button"
                onClick={() => onPick(c)}
                className={`pressable flex items-center gap-3 panel px-3 py-2 text-left ${
                  isCurrent ? "ring-1 ring-amber-400/60" : ""
                }`}
              >
                <span className="relative shrink-0 w-10">
                  {img ? (
                    <img src={img} alt="" className="w-full rounded-md ring-1 ring-white/10" loading="lazy" />
                  ) : (
                    <span className="block w-10 h-14 rounded-md bg-raised" />
                  )}
                  {foil && <span aria-hidden className={`foil ${foil}`} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">
                    {c.rarity}
                    <span className="text-neutral-500"> · {rarityAbbrev(c.rarity)}</span>
                    {isCurrent && <span className="text-amber-300 text-xs"> · current guess</span>}
                  </span>
                  <span className="block text-[11px] text-neutral-500 tabular-nums">
                    {share >= 0.005 ? `≈${Math.round(share * 100)}% of pulls` : "very rare pull"}
                  </span>
                </span>
                {c.priceUsd != null && (
                  <span className="text-sm text-amber-300 tabular-nums shrink-0">
                    {formatUsd(c.priceUsd)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

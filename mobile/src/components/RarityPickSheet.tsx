import { useMemo, useState } from "react";
import { pullShare, type RarityCandidate } from "@shared/scan/rarityPrior";
import { rarityAbbrev } from "@shared/scan/setCode";
import {
  foilToAnswers,
  matchesTraits,
  usefulQuestions,
  type NameFinish,
  type TraitAnswers,
} from "@shared/scan/rarityTraits";
import type { FoilClass } from "@shared/scan/rarityVision";
import { foilClass } from "../lib/foil";
import { formatUsd } from "../lib/util";
import RarityGuideSheet from "./RarityGuideSheet";
import BottomSheet from "./BottomSheet";

// One-tap rarity disambiguation: when a set code maps to several rarities,
// judging the foil by eye is the hard part — so each candidate shows its foil
// sheen on the card art, its own market price, and how common the pull is.
// Candidates arrive prior-ranked (most likely first).
//
// The narrowing row asks only the questions a person can answer by looking
// ("Name color?", "Art shiny?", "Raised texture?") — and only when the
// answer would actually split the candidates. The camera's foil read
// pre-answers what it saw (a silver vs gold name plate is exactly what one
// frame CAN tell); answers dim inconsistent candidates rather than hiding
// them, because the trait table is a guide, not an oracle.
export default function RarityPickSheet({
  cardName,
  img,
  candidates,
  current,
  foil,
  onPick,
  onClose,
}: {
  cardName: string;
  img: string | null;
  candidates: RarityCandidate[];
  current?: string; // the currently-filed (guessed) rarity
  foil?: FoilClass; // what the camera saw, when the pick follows a scan
  onPick: (c: RarityCandidate) => void;
  onClose: () => void;
}) {
  const cameraAnswers = useMemo(() => foilToAnswers(foil), [foil]);
  const [answers, setAnswers] = useState<TraitAnswers>(cameraAnswers);
  const [guideOpen, setGuideOpen] = useState(false);
  const questions = useMemo(
    () => usefulQuestions(candidates.map((c) => c.rarity)),
    [candidates]
  );

  const fits = (c: RarityCandidate) => matchesTraits(c.rarity, answers);
  // Consistent candidates first (keeping prior order inside each half).
  const ordered = useMemo(
    () => [...candidates.filter(fits), ...candidates.filter((c) => !fits(c))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, answers]
  );
  const fitCount = candidates.filter(fits).length;
  const anyAnswer =
    answers.name !== undefined || answers.artFoiled !== undefined || answers.embossed !== undefined;

  const setName = (v: NameFinish) =>
    setAnswers((a) => ({ ...a, name: a.name === v ? undefined : v }));
  const setBool = (key: "artFoiled" | "embossed", v: boolean) =>
    setAnswers((a) => ({ ...a, [key]: a[key] === v ? undefined : v }));

  const chip = (on: boolean) =>
    `text-xs px-2.5 py-1 rounded-full border transition-colors ${
      on
        ? "bg-amber-400/15 border-amber-900/60 text-amber-200 font-medium"
        : "bg-surface border-line text-neutral-400"
    }`;

  return (
    <>
      <BottomSheet
        onClose={onClose}
        title="Which rarity is it?"
        layer="stacked"
        panelClass="max-h-[85vh] overflow-y-auto"
        subtitle={
          <>
            <span className="block truncate">
            {cardName} — this set printed it at {candidates.length} rarities.
            Match the foil on your card.
            </span>
            <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="text-amber-300/90 mt-0.5"
            >
            📖 What do these look like?
            </button>
          </>
        }
      >

        {(questions.name || questions.artFoiled || questions.embossed) && (
          <div className="panel p-2.5 mb-3 flex flex-col gap-2">
            {questions.name && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-neutral-500 shrink-0">Name color:</span>
                {(
                  [
                    ["plain", "Plain ink"],
                    ["silver", "Silver"],
                    ["gold", "Gold"],
                    ["rainbow", "Rainbow"],
                  ] as const
                ).map(([v, label]) => (
                  <button key={v} type="button" onClick={() => setName(v)} className={chip(answers.name === v)}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {questions.artFoiled && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-neutral-500 shrink-0">Artwork shiny?</span>
                <button type="button" onClick={() => setBool("artFoiled", true)} className={chip(answers.artFoiled === true)}>
                  Yes
                </button>
                <button type="button" onClick={() => setBool("artFoiled", false)} className={chip(answers.artFoiled === false)}>
                  No
                </button>
              </div>
            )}
            {questions.embossed && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-neutral-500 shrink-0">Raised 3D texture?</span>
                <button type="button" onClick={() => setBool("embossed", true)} className={chip(answers.embossed === true)}>
                  Yes
                </button>
                <button type="button" onClick={() => setBool("embossed", false)} className={chip(answers.embossed === false)}>
                  No
                </button>
              </div>
            )}
            {(cameraAnswers.name !== undefined || cameraAnswers.artFoiled !== undefined) && (
              <p className="text-[11px] text-neutral-600">
                📷 Pre-filled from what the camera saw — tap to change.
              </p>
            )}
            {anyAnswer && (
              <p className="text-[11px] text-neutral-500 tabular-nums">
                {fitCount} of {candidates.length} rarities match your answers.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          {ordered.map((c) => {
            const foilCls = foilClass(c.rarity);
            const share = pullShare(c.rarity, candidates);
            const isCurrent = c.rarity === current;
            const dimmed = anyAnswer && !fits(c);
            return (
              <button
                key={`${c.code}|${c.rarity}`}
                type="button"
                onClick={() => onPick(c)}
                className={`pressable flex items-center gap-3 panel px-3 py-2 text-left ${
                  isCurrent ? "ring-1 ring-amber-400/60" : ""
                } ${dimmed ? "opacity-40" : ""}`}
              >
                <span className="relative shrink-0 w-10">
                  {img ? (
                    <img src={img} alt="" className="w-full rounded-md ring-1 ring-white/10" loading="lazy" />
                  ) : (
                    <span className="block w-10 h-14 rounded-md bg-raised" />
                  )}
                  {foilCls && <span aria-hidden className={`foil ${foilCls}`} />}
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
      </BottomSheet>

      {guideOpen && (
        <RarityGuideSheet focus={candidates[0]?.rarity} onClose={() => setGuideOpen(false)} />
      )}
    </>
  );
}

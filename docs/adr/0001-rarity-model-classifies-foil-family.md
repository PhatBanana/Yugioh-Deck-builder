# The rarity model classifies foil family, not rarity tier

The on-device rarity classifier (the seam in `mobile/src/services/rarityModel.ts`)
outputs one of six foil families — `matte`, `holo-name`, `holo-art`, `gold-name`,
`rainbow`, `unclear` (abstain) — not a printed rarity name, despite the seam's
original `{ rarity: string }` sketch and the roadmap's "rarity ML classifier"
framing. The set-code rarity index is near-ground-truth for *which tiers a card
could be*; vision's only honest contribution is *which foil finish is physically
on the cardstock*, and several tiers are visually identical (Secret vs Prismatic
vs Platinum all read as rainbow). A full 12-tier classifier would need a far
larger dataset to learn distinctions the index already answers for free, and its
out-of-candidate answers were discarded anyway. Family output instead drops into
the existing `rarityBucket`/`reconcileRarity` narrowing machinery and pre-fills
the picker's trait chips via `foilToAnswers`.

## Consequences

- Training labels are derived from confirmed rarities via `rarityBucket()`;
  the dataset is labelled by family, so reversing this decision means
  relabelling and retraining, not just remapping.
- The model replaces the single-frame heuristic foil pass outright (no
  fallback: the heuristic's failure mode is confident wrongness under glare,
  which the trained `unclear` class exists to prevent). The torch-differential
  pass stays: it measures a physical signal a single frame cannot see, and
  ranks above the model when both speak.

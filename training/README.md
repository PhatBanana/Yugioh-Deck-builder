# Foil-classifier training

Reproducible pipeline for the on-device foil-family classifier
(see `docs/adr/0001-rarity-model-classifies-foil-family.md` and `CONTEXT.md`).
The model classifies card crops into six families:
`matte / holo-name / holo-art / gold-name / rainbow / unclear`.

## Dataset layout (gitignored — photos never enter git)

```
training/dataset/
├── phone/       ← real captures, ingested from the app's zip exports
├── synthetic/   ← rendered foils (see synthetic/), pre-training only
│   └── <family>/<cardId>-<n>.jpg + manifest.jsonl
└── web/         ← real eBay listing photos (see harvest/), pre-training only
    └── <family>/<itemId>.jpg + manifest.jsonl
```

Ground rules from the design session:

- **Real captures are the only evaluation data.** Synthetic (and any future
  web-sourced) images are pre-training/augmentation only — the scorecard
  judges the model exclusively on phone captures, split by never-seen cards.
- **Back up `dataset/` yourself** (Drive/external). It's deliberately outside
  git; the code and scorecard results are committed, the photos are not.

## Pieces

- `synthetic/` — renders catalog card images with the app's own foil overlay
  CSS (`mobile/src/foil.css`, imported verbatim) into labelled training
  images. See `synthetic/render.mjs --help` equivalent below.

  ```bash
  cd synthetic
  npm install && npx playwright install chromium   # once
  npm run render -- --count 40 --variants 2        # → ../dataset/synthetic/
  ```

- `harvest/` — pulls real foil-card *photographs* from eBay via the official
  Browse API (never HTML scraping). Labels are cleaned against the catalog:
  the listing title's set code is looked up in the YGOPRODeck printing data,
  and a listing is kept only when the code pins the rarity (or the title
  names exactly one of the code's rarities) — the seller's claim is never
  the label. Known bias: pricey cards are photographed in sleeves/toploaders.

  ```bash
  cd harvest
  node ebay.mjs --check        # offline self-test, no keys needed
  # one-time: create a free keyset at https://developer.ebay.com and put
  # EBAY_CLIENT_ID / EBAY_CLIENT_SECRET in harvest/.env, then:
  node ebay.mjs --max 400      # → ../dataset/web/
  ```

- `ingest.py` (planned) — unpacks the app's exported zips into
  `dataset/phone/`, dedupes by JPEG content hash (phone exports overlap and
  example ids collide across phones), and relabels glare-saturated crops to
  `unclear` using the same specular check as the app — a glare-blown Secret
  Rare labelled "rainbow" would teach exactly the failure the abstain class
  exists to prevent.

- `train.py` (planned) — Keras transfer learning (MobileNetV3-Small class
  backbone) → quantized `.tflite`. Camera-realism augmentation (perspective,
  lighting, glare, JPEG artifacts) is applied on the fly at train time, which
  is also where synthetic images earn their keep.

- Scorecard (planned, printed by every train run) — the ship gate: beats the
  heuristic foil pass on held-out real captures from never-seen cards,
  rainbow-vs-glare confusion below the heuristic's, and ≥95% precision when
  not abstaining.

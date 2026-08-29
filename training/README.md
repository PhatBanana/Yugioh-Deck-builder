# Foil-classifier training

Reproducible pipeline for the on-device foil-family classifier
(see `docs/adr/0001-rarity-model-classifies-foil-family.md` and `CONTEXT.md`).
The model classifies card crops into six families:
`matte / holo-name / holo-art / gold-name / rainbow / unclear`.

## Dataset layout (gitignored — photos never enter git)

```
training/dataset/
├── phone/       ← real captures, ingested from the app's zip exports
├── flatbed/     ← real scanner scans, filed by the scan-lab workflow
│   ├── in/                  ← point the scanner software's output here
│   ├── sorted/<rarity>/     ← machine's best-guess rarity — pre-training only
│   ├── confirmed/<rarity>/  ← set-code catalog fact or human tag — trusted
│   ├── review/              ← no confident guess / detection failed / undecodable
│   └── manifest.jsonl       ← append-only log of every filing + its readings,
│                              incl. the visual foil pattern (family) each
│                              guess/reading came from, for ingest to bucket by
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

- Flatbed workflow (`tools/scan-lab.html` + `tools/scan-lab-server.mjs`) —
  the in/out loop for a real scanner. Start the server, point the scanner
  software at the workspace's `in/` folder, and every settled scan is read
  and filed into `sorted/<guessed rarity>/` (e.g. `sorted/Ultra Rare/`) —
  folders name the actual rarity, not the visual pattern that suggested it.
  Typing the printed set code asks the YGOPRODeck catalog what that code was
  actually printed as — one match pins the rarity outright, several become
  click-to-tag chips — and either that or a manual tag refiles the scan under
  `confirmed/<rarity>/` as a trusted label. The server never decodes a pixel;
  all foil math lives in the page's mirror of the app's reading code, and the
  visual pattern (foil family) behind every guess still rides along in the
  manifest for `ingest.py` to bucket by when it builds the training set.

  ```bash
  node tools/scan-lab-server.mjs            # workspace = training/dataset/flatbed
  node tools/scan-lab-server.mjs --root D:\scans --port 8787 --no-open
  ```

  Caveats: one card per file (crop multi-card platen scans first), and a
  flat straight-on scan cannot see embossing or angle-shift — Ultimate Rares
  read as their glint pattern, so tag those by hand.

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

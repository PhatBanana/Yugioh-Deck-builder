# Roadmap

A living map of what the Yu-Gi-Oh! deck-builder app does today and what's next.
Keep it current: when a "Next" item ships, move it up to "Shipped" with a one-liner.

The app is a Capacitor (Android) app in `mobile/`, with framework-free core
logic in `shared/` (unit-tested in `tests/`). See `AGENTS.md` for layout.

---

## Shipped

### Collection & Cards
- Full card database sync from YGOPRODeck (offline after first sync).
- Owned tracking with quantity steppers; wishlist (♡) with price tracking.
- **Wishlist budget planner**: total cost of the wishlist, and for a given
  budget, which cards you can complete (cheapest-first) with spend/left-over.
- Search + sort (A–Z, price, ATK, level) + filters (type, attribute, level,
  banlist status); list and grid layouts.
- Binders/tags to file cards, with tag filter chips.
- **Bulk edit**: multi-select owned cards (grid or list) to file them under a
  binder, set condition, or remove them all at once (with undo).
- **Per-printing breakdown**: own a card at multiple rarities/editions as
  separate line items, each valued at its own printing price.
- **Rarity foil overlay**: art shows a sheen matching its rarity (silver/holo/
  gold/rainbow), since every printing shares the same catalog image.
- **Alternate artworks**: cards with multiple official arts show an artwork
  picker in the detail view; the chosen art becomes your collection thumbnail
  (grid/list) and full-screen view. Captured during card sync.
- Collection value hero with today's value change (▲/▼) and a value-over-time
  sparkline.
- Set completion browser (owned vs missing per set).
- **Pack simulator**: rip a virtual booster of any set from its real card pool
  with era-accurate pull ratios picked from the set's release date (classic
  2002–2019 vs modern guaranteed-foil boosters; approximate), with foils and
  pack value.
- CSV export; full JSON backup & restore (via the Android share sheet), with
  **backup freshness tracking**: the sheet shows when you last exported, and
  a throttled reminder nudges when a 10+ card collection hasn't been backed
  up in a week. (A silent auto-backup can't survive "clear app data" under
  scoped storage — an export to Drive/Downloads is the only copy that does.)
- Sticky preferences (view/sort/filters/tab persist across launches).

### Scanning (add cards)
- Live camera OCR scanning: reads the card **name** and printed **passcode**,
  auto-adds on a confident/stable match.
- **Set code + rarity + edition detection**: reads the set code (e.g.
  `SDCB-EN001`) and 1st-Edition mark; resolves rarity from an **offline rarity
  index** built during card sync.
- **Visual foil second-pass**: classifies the card's foil from the frame to
  confirm / flag / disambiguate the set-code rarity — sampling regions track
  the detected card (not fixed screen areas). (On-device ML classifier
  scaffolded — see Next.)
- **Rarity disambiguation**: when a set code maps to several rarities, the
  filed rarity is the statistically likely one (pull-rate + price prior) and
  is marked ambiguous — the session chip shows "?" and taps open a one-tap
  picker (foil previews, prices, pull odds); unconfirmed copies stay findable
  via the card sheet's confirm pill and an Owned-view filter chip.
- Camera controls: real **optical zoom** with physical-lens buttons
  (0.5/1/2/3×) + quarter-step fine tuning, front/back flip, tap-to-refocus,
  torch (steady or glare-reducing pulse).
- Scan settings: keep-awake, beep, haptic buzz, time-between-reads, detect
  edition/rarity toggle. End-of-session recap (cards + value added).
- **Session review list**: tap the "N added" counter mid-scan for the full
  list of this session's cards — fix any card's rarity or remove a misread
  copy on the spot (removal targets that card's exact filed printing).
- Other add paths: paste a list, or import a whole deck's cards.

### Decks
- Deck builder with Main / Extra / Side sections and divider UI.
- Multi-format legality validation: TCG / OCG / Goat, plus **Master Duel**
  and **Speed Duel** (regulations from the CI-built yaml-yugi data packs;
  Speed checks the 20–30 card sizes and the Speed card pool — Skill cards
  out of scope).
- Deck stats (monster/spell/trap split, price) and opening-hand simulator.
- **Deck odds**: exact opening-hand probabilities (hypergeometric) per card,
  going first (5) or second (6); tap cards as starters for a live consistency
  vs. brick reading, and pick 2+ for combo odds (opening the whole combo
  together, via inclusion–exclusion).
- "How it plays" strategy notes (auto-seeded when copied from a meta deck).
- `.ydk` import/export; duplicate a deck; cover art on deck tiles.
- **Deck sharing**: share a deck as a compact copy-paste code (via the Android
  share sheet or clipboard) and import one from a pasted code.
- One-tap "add this deck's missing cards to wishlist."
- Duel tools (life points, dice/coin, etc.).

### Meta & recommendations
- Meta-deck search across local cache + online (YGOPRODeck / YugiohMeta),
  case- and word-order-insensitive; "show more."
- Deck recommendations ranked by how much of it you own.
- "Buy next" purchase suggestions (cards that unlock the most decks).
- Save any meta deck into your editable decks.

### Trades & prices
- Trade log: what you gave/got, valued at log time, with net value + undo.
- **Real market price history** per printing (TCGplayer + Cardmarket), from
  YGOPRODeck's trend data — months of history, not just since you added the
  card. Falls back to the app's own recorded points when a card has no trend
  data. Daily collection-value snapshots; every card's price snapshotted on
  each sync.
- **Price alerts**: notable recent moves (≥15% and ≥$0.50) on owned &
  wishlisted cards over 1w/1m/3m, from the recorded price history; badge on the
  Owned view's Alerts button.
- **Collection insights**: most valuable cards, value split by card type and by
  archetype, total/avg value — from the Owned view's Insights button.

### Platform & UX
- Android back button closes popups/sheets instead of minimizing.
- **Crash recovery screen** instead of a silent black screen: render crashes
  (error boundary) and fatal database failures (global crash guard —
  corruption, quota, IndexedDB unavailable) both land on a screen showing the
  real error with backup-first recovery options; an older APK opened over a
  newer database gets a dedicated "install the latest APK, don't reset"
  message.
- Undo snackbars (remove card, delete deck) and confirm dialogs for
  destructive actions.
- Fullscreen card art; Millennium-gold theme with motion/depth, all animation
  gated behind `prefers-reduced-motion`.

### Infrastructure
- GitHub Actions builds a debug APK on every push to `main`, published to the
  rolling `apk-latest` release + a versioned release (auto-pruned to the last
  10; build artifacts not retained, to bound storage).
- **In-app updates**: the app checks the repo's GitHub Releases (~daily, plus
  a manual check in Backup & restore) and offers the newer APK as a download —
  same signing key + rising versionCode, so it installs as an in-place
  upgrade. Requires the repo to be public (unauthenticated phones can't read
  a private repo's releases).
- **Data packs**: a weekly CI workflow (`data-packs.yml`) distills the
  yaml-yugi card database into small JSON assets on the rolling `data-latest`
  release — Master Duel/Speed regulations, Yugipedia page ids, and localized
  name packs — which the app fetches best-effort during card sync.
- **Rulings & errata link**: every card sheet links to the card's Yugipedia
  page by stable page id (name search as fallback).
- **Card language packs**: downloadable localized names (ja/ko/de/fr/it/es/pt)
  that widen card search, deck search, and the scanner's OCR matching (camera
  reads Latin script only; ja/ko benefit typed search).

---

## Next up (near-term, concrete)

- [ ] **On-device rarity ML classifier** — train/bundle a TensorFlow-Lite model
      and wire it into the scan pipeline (the seam already exists in
      `services/rarityModel.ts`); needs a labelled dataset of card photos.
- [ ] **Sealed-product / barcode scanning** — the camera plugin supports
      barcode scanning; use it to add sealed products or look up by UPC.
- [ ] **Deck-as-image export** — render a deck to a shareable image (the
      copy-paste code is shipped; an image is the remaining half).

## Later / ideas

- [ ] Cloud sync / multi-device (currently local-only IndexedDB).
- [ ] Trade suggestions (match your haves against others' wants).
- [ ] iOS build (Capacitor already cross-platform; needs an iOS target + test).
- [ ] UI localization (card-name language packs shipped; app chrome is
      English-only).

## Known cleanup backlog

Findings from a full code review (2026-08). Critical/high items were fixed
immediately; most medium/low ones have since been cleaned up too. Still open:

- [ ] Budget planner and set sheets render unbounded lists; each missing-card
      row mounts its own wishlist live query (`WishlistBudgetSheet`,
      `SetSheet`).
- [ ] Card search full-scans all ~13k rows per keystroke; `nameLower` is
      indexed and could serve prefix matches (`CardsPage`).
- [ ] Price-alert windows mislabel cards whose history is shorter than the
      window ("1m" move may be two days) — mark "since tracking started"
      (`shared/collection/insights.ts`).
- [ ] `shared/deck/handSim.ts` (drawHand bias) and
      `shared/recommendation/recommend.ts` have no tests at all.

## Known limitations (by design / data)

- **No per-rarity artwork.** Every printing of a card shares one catalog image;
  rarity is a foil finish, shown via the foil overlay rather than a different
  picture. (Genuinely different artworks are separate card IDs already.)
- **Market history depth varies by card.** The card chart now pulls YGOPRODeck's
  real trend data (the same source its website graph uses), which goes back
  months per printing — but not always to a card's original release, and some
  older/less-traded cards have no trend data at all (there the app falls back to
  its own recorded points, which start when the card was first tracked). No free
  source has complete since-release history for every card.

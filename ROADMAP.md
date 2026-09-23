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
- CSV export (with edition, and a flag on rarities that are only a best
  guess); full JSON backup & restore — collection, decks, wishlist, trade
  log, price history — through a real **Save-as dialog**
  (choose the folder — Drive, Downloads), with
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
- **Rarity guide**: a reference sheet (in the foil lab, or "what do these
  look like?" in the rarity picker) describing how to spot each tier by eye — the
  tell, era and pull frequency, with a live foil swatch per tier and a
  Yugipedia link for real photos. Its trait chips are unit-tested against the
  same table the picker's narrowing uses, so the two can't drift apart.
- **Rarity narrowing**: the picker asks only the questions that split the
  candidates (name colour / shiny art / raised texture), pre-answered by what
  the camera's foil pass could genuinely see.
- Camera controls: real **optical zoom** with physical-lens buttons
  (0.5/1/2/3×) + quarter-step fine tuning, front/back flip, tap-to-refocus,
  torch (steady or glare-reducing pulse).
- Scan settings: keep-awake, beep, haptic buzz, time-between-reads, detect
  edition/rarity toggle. End-of-session recap (cards + value added).
- **Session review list**: tap the "N added" counter mid-scan for the full
  list of this session's cards — fix any card's rarity or remove a misread
  copy on the spot (removal targets that card's exact filed printing).
- **Japanese OCR**: the app's own ML Kit plugin replaces the Latin-only
  third-party one; a "Text recognition" scan setting switches to the Japanese
  model (which carries the same Latin model, so mixed collections scan fine).
  Name matching keeps CJK text — it used to normalize every Japanese name to
  an empty string.
- **Foil lab** (Scan menu): fullscreen camera that captures a no-flash and a
  flash frame of the same card and compares them per region — torch glare
  alone can't separate foils, so the flash-free frame's colour spread is what
  tells rainbow foil from Ultra. Tag the true rarity, export the readings as
  JSON; real-device readings are pinned as test fixtures. Captures persist
  on the phone (closing the lab or the app no longer loses them); clearing
  asks first.
- **`tools/scan-lab.html`**: a standalone page (open off disk, no install)
  that reads flatbed/sheet-fed scans and reports the same foil numbers the
  phone measures, for building a labelled reference set.
- Other add paths: paste a list, or import a whole deck's cards.

### Decks
- Deck builder with Main / Extra / Side sections and divider UI.
- Multi-format legality validation, remembered per deck: TCG / OCG / Goat,
  plus **Master Duel**
  and **Speed Duel** (regulations from the CI-built yaml-yugi data packs;
  Speed checks the 20–30 card sizes and the Speed card pool — Skill cards
  out of scope).
- Deck stats (monster/spell/trap split, price) and opening-hand simulator.
- **Deck odds**: exact opening-hand probabilities (hypergeometric) per card,
  going first (5) or second (6); tap cards as starters for a live consistency
  vs. brick reading, and pick 2+ for combo odds (opening the whole combo
  together, via inclusion–exclusion).
- "How it plays" strategy notes (auto-seeded when copied from a meta deck).
- `.ydk` import/export (Save-as dialog); duplicate a deck; cover art on deck
  tiles.
- **Written deck-list import**: paste a list ("3 Card Name" lines under
  Monsters/Spells/Traps/Extra headers) and get a preview of every card with
  its art — typos fuzzy-corrected and flagged, unmatched lines tap-to-pick —
  before anything saves.
- **Typo-tolerant card search** in every picker, including misspelled partial
  names ("Ash Blosom" finds Ash Blossom).
- **Deck sharing**: share a deck as a compact copy-paste code (via the Android
  share sheet or clipboard) and import one from a pasted code — or as a
  **rendered image** (every copy shown per section, deck-site style, with
  name/composition/price header) via the share sheet.
- One-tap "add this deck's missing cards to wishlist."
- Duel tools (life points, dice/coin, etc.).

### Meta & recommendations
- Meta-deck search across local cache + online (YGOPRODeck / YugiohMeta),
  case- and word-order-insensitive; "show more."
- Deck recommendations ranked by how much of it you own.
- "Buy next" purchase suggestions (cards that unlock the most decks).
- Save any meta deck into your editable decks.

### Trades & prices
- Trade log: what you gave/got, valued at log time, with net value. Undo
  (from the "Trade logged" toast, or deleting the entry) reverses exactly
  the collection changes the trade made.
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
- **Diagnostics report**: Backup & restore → "Copy diagnostics" gives one
  block of text with the build, scan settings, pack state, the last few OCR
  reads (what the recognizer returned and what it matched) and every error
  or error toast — kept on the phone across restarts, so a device-test
  failure comes back as evidence rather than "it didn't work".
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
  that widen card search, deck search, and the scanner's OCR matching. The
  camera reads Latin and Japanese; Korean names help typed search only.
- **Japanese printings pack**: OCG set codes and their rarities (~32k
  printings, ~0.7 MB) from yaml-yugi, so a scanned `RC04-JP001` resolves to a
  rarity — the card API carries TCG printings only. Kept in its own table
  (card syncs rebuild the TCG index), and looked up by the code's printed
  region so shared codes like RC04-JP001 / RC04-EN001 don't collide.
- **Headless E2E tests in CI**: Playwright drives the real built app with
  every network call stubbed from a captured API response — every sheet,
  stacked-sheet dismissal, deck-list import, Meta tab, scan settings — and
  fails on any console error. An upgrade test opens the previous commit's
  bundle then the new one over the same IndexedDB. The APK job waits on it,
  so a broken UI blocks the release.
- **Navigation cleanup**: one ⚙ Settings sheet in the header (backup &
  restore, card data and language packs, app/diagnostics) instead of
  settings split across Cards and Scan; the deck editor gets a toolbar
  (Test hand / Odds / Share menu) plus a ⋯ menu for duplicate/delete; Cards
  and Meta filters fold behind a toggle with active ones shown as chips; the
  Decks list groups its imports under one 📥 Import menu; the Scan tab is
  now "Add".

---

## Next up (near-term, concrete)

- [ ] **Device-test the untested stack.** Everything since roughly build 100
      has only been verified by unit tests, E2E and CI, never on a phone.
      Native paths the browser can't reach: Japanese OCR (build 114 swapped the
      OCR engine every scan depends on), the Save-as dialog, the foil lab's
      flash/no-flash capture, camera pre-fill in the rarity picker.
- [ ] **Foil calibration from scanner readings** — waiting on scan-lab JSON
      for the reference cards (both Dark Magicians, both Ash Blossoms). Tells
      us whether a flatbed scan can serve as a repeatable measuring bench.
- [ ] **On-device rarity ML classifier** — train/bundle a TensorFlow-Lite model
      and wire it into the scan pipeline (the seam already exists in
      `services/rarityModel.ts`); needs the labelled dataset above.
- [ ] **Re-enable R8 minification** — switched off after the black-screen
      crash, which turned out to be corrupted data, not R8. Needs one careful
      build plus a device check.
- [ ] **Sealed-product / barcode scanning** — the camera plugin supports
      barcode scanning; use it to add sealed products or look up by UPC.
      (Needs on-device iteration — barcode formats and a UPC lookup source.)

## Later / ideas

- [ ] Korean (and Chinese) OCR — needs ML Kit's Korean model (the Japanese
      one bundles Han, so Chinese may partly read already; untested).
- [ ] Prices for Japanese printings — the pack carries rarities only.
- [ ] Cloud sync / multi-device (currently local-only IndexedDB).
- [ ] Trade suggestions (match your haves against others' wants).
- [ ] iOS build (Capacitor already cross-platform; needs an iOS target + test).
- [ ] UI localization (card-name language packs shipped; app chrome is
      English-only).

## Known cleanup backlog

The 2026-08 review backlog is closed, and the simplify passes (one of them
whole-codebase) landed their safe fixes, including the shared `BottomSheet`. Left
on purpose, each as its own change with a device check rather than batched:

- **Rarity keyword classifiers disagree** — four places map rarity names to
  foil families and drift on edge cases (Gold Rare is one). Unifying them
  changes behaviour, so it needs a decision on each disagreement.
- Near-duplicate sparkline/chart components (price, value, market).
- Card-id resolution from the remote API exists twice (`collection.ts`,
  `metaDecks.ts`).
- Smaller: a shared `.chip` style, a paged-list hook, per-frame canvas reuse
  in the scanner.

## Known limitations (by design / data)

- **The E2E suite can't reach native code.** Camera, OCR, the Save-as dialog
  and the torch run only on a device; the browser tests cover everything
  above them.

- **No per-rarity artwork.** Every printing of a card shares one catalog image;
  rarity is a foil finish, shown via the foil overlay rather than a different
  picture. (Genuinely different artworks are separate card IDs already.)
- **Market history depth varies by card.** The card chart now pulls YGOPRODeck's
  real trend data (the same source its website graph uses), which goes back
  months per printing — but not always to a card's original release, and some
  older/less-traded cards have no trend data at all (there the app falls back to
  its own recorded points, which start when the card was first tracked). No free
  source has complete since-release history for every card.

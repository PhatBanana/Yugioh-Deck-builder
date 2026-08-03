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
- Search + sort (A–Z, price, ATK, level) + filters (type, attribute, level,
  banlist status); list and grid layouts.
- Binders/tags to file cards, with tag filter chips.
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
- CSV export; full JSON backup & restore (via the Android share sheet).
- Sticky preferences (view/sort/filters/tab persist across launches).

### Scanning (add cards)
- Live camera OCR scanning: reads the card **name** and printed **passcode**,
  auto-adds on a confident/stable match.
- **Set code + rarity + edition detection**: reads the set code (e.g.
  `SDCB-EN001`) and 1st-Edition mark; resolves rarity from an **offline rarity
  index** built during card sync.
- **Visual foil second-pass**: classifies the card's foil from the frame to
  confirm / flag / disambiguate the set-code rarity. (On-device ML classifier
  scaffolded — see Next.)
- Camera controls: real **optical zoom** with physical-lens buttons
  (0.5/1/2/3×) + quarter-step fine tuning, front/back flip, tap-to-refocus,
  torch (steady or glare-reducing pulse).
- Scan settings: keep-awake, beep, haptic buzz, time-between-reads, detect
  edition/rarity toggle. End-of-session recap (cards + value added).
- Other add paths: paste a list, or import a whole deck's cards.

### Decks
- Deck builder with Main / Extra / Side sections and divider UI.
- Multi-format legality (TCG / OCG / Goat) validation.
- Deck stats (monster/spell/trap split, price) and opening-hand simulator.
- **Deck odds**: exact opening-hand probabilities (hypergeometric) per card,
  going first (5) or second (6); tap cards as starters for a live consistency
  vs. brick reading.
- "How it plays" strategy notes (auto-seeded when copied from a meta deck).
- `.ydk` import/export; duplicate a deck; cover art on deck tiles.
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

### Platform & UX
- Android back button closes popups/sheets instead of minimizing.
- Undo snackbars (remove card, delete deck) and confirm dialogs for
  destructive actions.
- Fullscreen card art; Millennium-gold theme with motion/depth, all animation
  gated behind `prefers-reduced-motion`.

### Infrastructure
- GitHub Actions builds a debug APK on every push to `main`, published to the
  rolling `apk-latest` release + a versioned release (auto-pruned to the last
  10; build artifacts not retained, to bound storage).

---

## Next up (near-term, concrete)

- [ ] **On-device rarity ML classifier** — train/bundle a TensorFlow-Lite model
      and wire it into the scan pipeline (the seam already exists in
      `services/rarityModel.ts`); needs a labelled dataset of card photos.
- [ ] **Sealed-product / barcode scanning** — the camera plugin supports
      barcode scanning; use it to add sealed products or look up by UPC.
- [ ] **Wishlist total cost + budget planner** — sum wishlist value; "what can
      I complete for $X."
- [ ] **Price alerts** — flag notable price moves on owned/wishlisted cards
      (data already recorded in price history).
- [ ] **Collection insights** — most valuable cards, biggest movers, value by
      set/archetype.
- [ ] **Bulk edit** — multi-select cards to set quantity/tags/condition at once.
- [ ] **Deck sharing** — export a deck as an image, or a shareable link/code.

## Later / ideas

- [ ] Cloud sync / multi-device (currently local-only IndexedDB).
- [ ] Multi-card combo probability — odds of opening card A *and* card B (the
      deck-odds sheet already does per-card and starter-group consistency).
- [ ] Pack/box opening simulator using set contents + rarity odds.
- [ ] Trade suggestions (match your haves against others' wants).
- [ ] iOS build (Capacitor already cross-platform; needs an iOS target + test).
- [ ] Localization / non-English card data.

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

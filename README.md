# Yu-Gi-Oh! Deck Builder (Android)

Track the Yu-Gi-Oh! cards you own and find out which top tournament meta decks
you're closest to building — with the missing cards, prices, and a shopping
list for each. Card data comes from the [YGOPRODeck](https://ygoprodeck.com)
API (cached on-device); meta decks are scraped from YGOPRODeck's format pages
(current + Edison, Goat, and other eras) with a bundled snapshot as fallback.

A Capacitor + React Android app. The core logic lives in `shared/`
(recommendation scoring, deck validation, `.ydk`/list parsing, meta-deck
parsing, OCR name matching) and is unit-tested in `tests/`.

## Features

- **Continuous camera scanning** — hold cards up one after another; each is
  captured automatically when its name is readable (on-device ML Kit OCR +
  fuzzy matching, or an exact match off the printed 8-digit passcode), added
  to your collection, with a running strip + undo, manual shutter, torch, and
  keep-awake for hands-free mounted scanning.
- **Deck builder** — build/save your own decks (main/extra/side) with live
  legality checks (deck sizes, copy/banlist limits) and owned-vs-needed
  highlighting. Import a `.ydk` from Master Duel / EDOPro / YGOPRODeck; export
  any deck back to `.ydk`.
- **Meta recommendations** — the top meta decks you're closest to building,
  filterable by **era** and **play-style**, with cost-to-complete, a **budget
  filter**, and **"best cards to buy next."** Tap a card to read its full text.
  One tap copies a meta deck into your own Decks.
- **Wishlist** — ♥ any card and review it in the Cards tab.
- **Import by search** — type "Dark Magician" to pull in a whole archetype, or
  import a cached meta deck's list; plus paste / `.ydk` collection import.

## Install

Every push to `main` builds an APK via GitHub Actions →
**Releases → "APK latest" → `app-debug.apk`**. Open it on your phone to
install (allow "unknown sources" the first time). First launch downloads the
card database (~50 MB, use Wi-Fi). Updates install over the top (all builds
share one signing key) — no uninstall.

### Giving it to a friend

The repo is private, so a friend either:

1. **Gets the APK file** — download `app-debug.apk` from the latest release and
   share it (Drive, email, messaging); no GitHub account needed. Or
2. **Is added as a repo collaborator** (GitHub → Settings → Collaborators) so
   they can grab it from Releases and get every future build.

On their phone: open the APK, allow installing when prompted, launch, and let
it sync once (Wi-Fi). Collections/decks live on-device, per phone.

## Develop

```bash
cd mobile
npm install
npm run dev          # browser preview (camera scanning stubs to manual search)
npm run build && npx cap sync android   # refresh the native Android project
```

## Tests

```bash
npm install          # at the repo root (installs vitest)
npm test             # shared core: scoring, parsers, deck validation, OCR matcher
```

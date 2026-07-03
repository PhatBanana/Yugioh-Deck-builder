# Yu-Gi-Oh! Deck Builder

Track the Yu-Gi-Oh! cards you own and find out which top tournament meta decks
you're closest to building — with the missing cards, prices, and a shopping
list for each. Card data comes from the [YGOPRODeck](https://ygoprodeck.com)
API (cached locally); meta decks are scraped from YGOPRODeck's tournament meta
decks page with a bundled snapshot as fallback.

Two apps share one core (`shared/` — recommendation engine, list/ydk import
parsing, deck-page parsing, OCR name matching):

## 📱 Android app (`mobile/`)

Capacitor + React app with **camera card scanning**: point the camera at a
card, on-device ML Kit OCR reads the name, fuzzy matching finds the card, one
tap adds it to your collection. Also: card browser, bulk import, deck
recommendations with cost-to-complete.

**Install:** every push to `main` builds an APK via GitHub Actions →
**Releases → "APK latest" → `app-debug.apk`**. Open it on your phone to
install (allow "unknown sources" the first time). First launch downloads the
card database (~50 MB, use Wi-Fi).

**Develop:**

```bash
cd mobile
npm install
npm run dev          # browser preview (camera scanning stubs to manual search)
npm run build && npx cap sync android   # refresh native project
```

## 🖥️ Desktop app (repo root)

Next.js + SQLite web app you run locally — same features plus a portable
distribution: see [README-PORTABLE.txt](README-PORTABLE.txt). Quick start:

```bash
npm install
npm run dev          # http://localhost:3000
```

or double-click `launch.bat` (uses the pre-built standalone server, no
install needed once `runtime/node.exe` is present).

## Tests

```bash
npx vitest run       # shared core: scoring, parsers, OCR name matcher
```

# Yu-Gi-Oh! Deck Builder

Track the Yu-Gi-Oh! cards you own and find out which top tournament meta decks
you're closest to building — with the missing cards, prices, and a shopping
list for each. Card data comes from the [YGOPRODeck](https://ygoprodeck.com)
API (cached locally); meta decks are scraped from YGOPRODeck's tournament meta
decks page with a bundled snapshot as fallback.

Two apps share one core (`shared/` — recommendation engine, list/ydk import
parsing, deck-page parsing, OCR name matching):

## 📱 Android app (`mobile/`)

Capacitor + React app with **continuous camera card scanning**: open the live
camera and hold up cards one after another — each is captured automatically
when its name is readable (on-device ML Kit OCR + fuzzy matching), added to
your collection, and shown in a running strip with an undo. A manual shutter
and torch toggle are there too.

Also:

- **Deck builder** — build/save your own decks (main/extra/side), with live
  legality checks (deck sizes, copy/banlist limits) and owned-vs-needed
  highlighting. Import a `.ydk` from Master Duel / EDOPro / YGOPRODeck; export
  any deck back to `.ydk`.
- **Meta recommendations** — the top meta decks you're closest to building,
  with cost-to-complete, a **budget filter**, and **"best cards to buy next"**
  (the cards that unlock the most progress across decks).
- **Wishlist** — ♥ any card and review it in the Cards tab.
- **Import by search** — type "Dark Magician" to pull in a whole archetype, or
  import a cached meta deck's list; plus paste / `.ydk` collection import.
- **Card browser** with scanning-fed collection tracking.

**Install:** every push to `main` builds an APK via GitHub Actions →
**Releases → "APK latest" → `app-debug.apk`**. Open it on your phone to
install (allow "unknown sources" the first time). First launch downloads the
card database (~50 MB, use Wi-Fi).

### Giving it to a friend

The repo is private, so a friend has two ways to get the app:

1. **Send them the APK file.** Download `app-debug.apk` from the latest release
   and share it (Drive, email, messaging). Simplest — they don't need a GitHub
   account.
2. **Add them as a repo collaborator** (GitHub → Settings → Collaborators) so
   they can open the Releases page and download it themselves, and get every
   future build.

On their phone: open the APK, allow installing from your browser/files app when
prompted, then launch and let it sync the card database once (Wi-Fi). Updates
install straight over the top — all builds share one signing key — so they only
grab the newer APK; no uninstall. Collections/decks live on-device (per phone);
the Cards tab has an **Export backup** on the desktop app if they want to move
data over via the Import tab.

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

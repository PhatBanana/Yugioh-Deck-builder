# Project layout

A Capacitor (Android) Yu-Gi-Oh! deck-builder app. There is one app: the
mobile one. (An earlier Next.js desktop build was removed once mobile
superseded it.)

- `mobile/` — the app. Vite + React + TypeScript + Tailwind, wrapped with
  Capacitor for Android. Local storage is IndexedDB via Dexie. Card scanning
  uses the device camera + on-device ML Kit OCR.
- `shared/` — pure, framework-free core logic (recommendation scoring, deck
  validation, `.ydk`/list parsing, meta-deck HTML parsing, OCR name matching).
  Imported by the app as `@shared/*`. Keep this free of DOM/DB/network code.
- `tests/` — Vitest unit tests for `shared/`. Run `npm test` at the repo root.
- `data/static-meta-decks.json` — bundled fallback deck snapshot, imported by
  the app as `@data/*`.

Every push to `main` builds a debug APK via GitHub Actions and attaches it to
the rolling `apk-latest` release (see `.github/workflows/android.yml`).

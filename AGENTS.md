# Project layout

A Capacitor (Android) Yu-Gi-Oh! deck-builder app. There is one app: the
mobile one. (An earlier Next.js desktop build was removed once mobile
superseded it.)

- `mobile/` — the app. Vite + React + TypeScript + Tailwind, wrapped with
  Capacitor for Android. Local storage is IndexedDB via Dexie. Card scanning
  uses the device camera + on-device ML Kit OCR, through the app's own
  Capacitor plugins under
  `mobile/android/app/src/main/java/com/phatbanana/ygodeckbuilder/`
  (`OcrPlugin` — Latin and Japanese text recognition; `SaveFilePlugin` — the
  Save-as dialog). Local plugins must be registered in `MainActivity` before
  the bridge starts.
- `shared/` — pure, framework-free core logic (recommendation scoring, deck
  validation, `.ydk`/list parsing, meta-deck HTML parsing, OCR name matching).
  Imported by the app as `@shared/*`. Keep this free of DOM/DB/network code.
- `tests/` — Vitest unit tests for `shared/`. Run `npm test` at the repo root.
- Typecheck the app with `npx tsc -b` in `mobile/`. Plain `tsc --noEmit`
  there checks **nothing** — `mobile/tsconfig.json` is a solution file whose
  only content is project references, so it exits 0 on any code.
- `mobile/e2e/` — Playwright tests of the real app in a headless browser:
  the built bundle served by `vite preview`, with every network call
  answered from `e2e/fixtures/` (a captured real API response — don't
  hand-write card shapes). `smoke.spec.ts` walks the pages and sheets;
  `upgrade.spec.ts` opens a previous release's bundle and then this one on
  the same origin to prove the IndexedDB upgrade (needs `OLD_DIST`, set in
  CI). Run with `npm run test:e2e` in `mobile/`; locally, set
  `PW_CHROMIUM` to an installed Chromium to skip the browser download. The
  shared fixture fails any test that logs a console error. CI runs this
  before building the APK, so a broken UI blocks the release.
- `data/static-meta-decks.json` — bundled fallback deck snapshot, imported by
  the app as `@data/*`.
- `tools/` — standalone single-file HTML utilities, opened straight off disk
  (no build, no server). `scan-lab.html` reads flatbed/sheet-fed card scans and
  reports the same foil numbers the phone measures; it mirrors `regionStat` /
  `readFoilStats` in `mobile/src/services/scanner.ts` and `classifyFoil` in
  `shared/scan/rarityVision.ts`, so those three must change together or the
  readings stop being comparable.

Every push to `main` builds a debug APK via GitHub Actions and attaches it to
the rolling `apk-latest` release (see `.github/workflows/android.yml`).

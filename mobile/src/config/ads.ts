// AdMob configuration.
//
// Google's OFFICIAL sample/test IDs are used by default — they always serve
// test ads and are safe to click. Before a public release:
//   1. Set USE_TEST_ADS = false.
//   2. Replace the PROD ids below with your real AdMob ad-unit id.
//   3. Replace the App ID in android/app/src/main/AndroidManifest.xml
//      (com.google.android.gms.ads.APPLICATION_ID) with your real App ID.
//
// NEVER tap your own live ads, and never ship test ids to production.

// Banner disabled for now (per user request) — flip back to true to restore.
// All ad plumbing (init, show/hide, layout reserve) stays intact behind this.
export const ADS_ENABLED = false;

// Flip to false only once your real ids (and manifest App ID) are in place.
export const USE_TEST_ADS = true;

const TEST = {
  // Google's public test banner ad unit — always safe.
  banner: "ca-app-pub-3940256099942544/6300978111",
};

const PROD = {
  // TODO: your real banner ad-unit id, e.g. "ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ"
  banner: "ca-app-pub-0000000000000000/0000000000",
};

export const AD_UNITS = USE_TEST_ADS ? TEST : PROD;

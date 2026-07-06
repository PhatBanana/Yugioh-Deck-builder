import { Capacitor } from "@capacitor/core";
import {
  AdMob,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
} from "@capacitor-community/admob";
import { AD_UNITS, ADS_ENABLED, USE_TEST_ADS } from "../config/ads";

let initialized = false;
let bannerCreated = false;
// Reserve height (CSS px) for the banner so it never overlaps app content, even
// if the plugin's SizeChanged event is slow or never fires. Adaptive anchored
// banners on phones are ~50-60px; the listener refines this to the real value.
const FALLBACK_BANNER_H = 60;
let lastBannerHeight = FALLBACK_BANNER_H;

function adsAvailable(): boolean {
  return ADS_ENABLED && Capacitor.isNativePlatform();
}

function setBannerHeightVar(px: number): void {
  document.documentElement.style.setProperty("--ad-banner-h", `${px}px`);
}

export async function initAds(): Promise<void> {
  if (!adsAvailable() || initialized) return;
  try {
    await AdMob.initialize({ initializeForTesting: USE_TEST_ADS });
    // The native banner is drawn over the webview; publish its real height as a
    // CSS var so the layout can reserve space for it (see App.tsx). Ignore 0-
    // height reports so we never collapse the reserve out from under the ad.
    await AdMob.addListener(BannerAdPluginEvents.SizeChanged, (info: { height: number }) => {
      if (info.height > 0) {
        lastBannerHeight = info.height;
        setBannerHeightVar(info.height);
      }
    });
    initialized = true;
  } catch {
    // Ads are best-effort; never block the app if init fails.
  }
}

export async function showBanner(): Promise<void> {
  if (!adsAvailable()) return;
  try {
    if (!initialized) await initAds();
    // Reserve space immediately (fallback until SizeChanged reports the exact
    // height) so the ad can't overlap the header/content.
    setBannerHeightVar(lastBannerHeight);
    if (bannerCreated) {
      await AdMob.resumeBanner();
      return;
    }
    await AdMob.showBanner({
      adId: AD_UNITS.banner,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.TOP_CENTER,
      isTesting: USE_TEST_ADS,
      margin: 0,
    });
    bannerCreated = true;
  } catch {
    // ignore — no ad rather than a crash
  }
}

export async function hideBanner(): Promise<void> {
  if (!adsAvailable() || !bannerCreated) return;
  try {
    await AdMob.hideBanner();
    // Collapse the reserved space while hidden (e.g. fullscreen scanning).
    setBannerHeightVar(0);
  } catch {
    // ignore
  }
}

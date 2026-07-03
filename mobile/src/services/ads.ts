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

function adsAvailable(): boolean {
  return ADS_ENABLED && Capacitor.isNativePlatform();
}

export async function initAds(): Promise<void> {
  if (!adsAvailable() || initialized) return;
  try {
    await AdMob.initialize({ initializeForTesting: USE_TEST_ADS });
    // The native banner is drawn over the webview; publish its real height as a
    // CSS var so the layout can lift the bottom nav above it (see index.css).
    await AdMob.addListener(BannerAdPluginEvents.SizeChanged, (info: { height: number }) => {
      document.documentElement.style.setProperty("--ad-banner-h", `${info.height}px`);
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
    if (bannerCreated) {
      await AdMob.resumeBanner();
      return;
    }
    await AdMob.showBanner({
      adId: AD_UNITS.banner,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
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
    document.documentElement.style.setProperty("--ad-banner-h", "0px");
  } catch {
    // ignore
  }
}

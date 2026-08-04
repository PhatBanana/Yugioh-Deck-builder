import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { getSyncMeta, setSyncMeta } from "../db";
import { httpGetJson } from "./http";

// In-app update check against the repo's GitHub Releases. CI tags every build
// `v<base>-build.<N>` where N is the Android versionCode, so "is there an
// update?" is a plain number comparison against the installed build. Works
// only while the repo (and its releases) are public — unauthenticated phones
// can't see a private repo's API, so the check quietly finds nothing there.

const REPO = "PhatBanana/Yugioh-Deck-builder";
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases?per_page=15`;
const CHECK_EVERY_MS = 20 * 60 * 60 * 1000; // ~daily, forgiving of clock drift

interface GhRelease {
  tag_name?: string;
  assets?: { name?: string; browser_download_url?: string }[];
}

export interface AppUpdate {
  build: number; // the newest published versionCode
  versionName: string; // e.g. "1.0.0-build.123"
  url: string; // direct APK download (public repo)
}

const BUILD_TAG = /-build\.(\d+)$/;

// The installed build number (Android versionCode). Null on web/dev.
export async function installedBuild(): Promise<number | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const info = await App.getInfo();
    const n = Number(info.build);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

// Finds the newest published build from the versioned releases. Null when the
// repo is unreachable/private or no versioned release exists.
async function latestPublishedBuild(): Promise<AppUpdate | null> {
  const releases = await httpGetJson<GhRelease[]>(RELEASES_URL);
  let best: AppUpdate | null = null;
  for (const r of releases) {
    const m = r.tag_name?.match(BUILD_TAG);
    if (!m) continue; // skip the rolling apk-latest tag
    const build = Number(m[1]);
    const apk = r.assets?.find((a) => a.name?.endsWith(".apk"));
    if (!apk?.browser_download_url) continue;
    if (!best || build > best.build) {
      best = {
        build,
        versionName: r.tag_name!.replace(/^v/, ""),
        url: apk.browser_download_url,
      };
    }
  }
  return best;
}

// Checks for a newer build than the installed one. Throttled to ~daily unless
// forced; any failure (offline, private repo, rate limit) returns null.
export async function checkForUpdate(force = false): Promise<AppUpdate | null> {
  const installed = await installedBuild();
  if (installed == null) return null; // web/dev build — nothing to update

  if (!force) {
    const last = Number(await getSyncMeta("update_checked_at")) || 0;
    if (Date.now() - last < CHECK_EVERY_MS) return null;
  }
  try {
    const latest = await latestPublishedBuild();
    await setSyncMeta("update_checked_at", String(Date.now()));
    return latest && latest.build > installed ? latest : null;
  } catch {
    return null;
  }
}

// Hands the APK to the system browser: Android downloads it and the user taps
// the finished download to install. Same signing key + higher versionCode, so
// it applies as an in-place upgrade with all data kept.
export function openUpdate(update: AppUpdate): void {
  window.open(update.url, "_blank");
}

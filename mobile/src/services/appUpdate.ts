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
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases?per_page=30`;
export const RELEASES_PAGE = `https://github.com/${REPO}/releases`;
const CHECK_EVERY_MS = 20 * 60 * 60 * 1000; // ~daily, forgiving of clock drift

// GitHub's API rejects requests without a User-Agent, and pinning the API
// version keeps a future default from changing the payload shape.
const GH_HEADERS: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "User-Agent": "ygo-deck-builder-app",
  "X-GitHub-Api-Version": "2022-11-28",
};

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
  const releases = await httpGetJson<GhRelease[]>(RELEASES_URL, GH_HEADERS);
  if (!Array.isArray(releases)) throw new Error("Unexpected response from GitHub");
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

// A check's outcome. Previously every path returned null, so "you're on the
// latest build" was reported even when the request had failed outright —
// indistinguishable, and misleading exactly when something is wrong.
export type UpdateCheck =
  | { status: "update"; update: AppUpdate }
  // `latest` is what GitHub actually showed, so "current" is a verifiable
  // claim ("latest is N and you have N"), never a shrug.
  | { status: "current"; installed: number; latest: number }
  | { status: "skipped" } // throttled, not actually checked
  | { status: "unsupported" } // web/dev build — no versionCode to compare
  | { status: "error"; message: string };

// Checks for a newer build than the installed one. Throttled to ~daily unless
// forced.
export async function checkForUpdateResult(force = false): Promise<UpdateCheck> {
  const installed = await installedBuild();
  if (installed == null) return { status: "unsupported" };

  if (!force) {
    const last = Number(await getSyncMeta("update_checked_at")) || 0;
    if (Date.now() - last < CHECK_EVERY_MS) return { status: "skipped" };
  }
  try {
    const latest = await latestPublishedBuild();
    await setSyncMeta("update_checked_at", String(Date.now()));
    if (!latest) {
      // The request "succeeded" but no versioned release with an APK was in
      // it — a rate-limit body or filtered network, not an up-to-date app.
      // Reporting "current" here is how "never sees updates" hides.
      return {
        status: "error",
        message: "GitHub returned no app releases — likely rate-limited, try again later",
      };
    }
    if (latest.build > installed) {
      return { status: "update", update: latest };
    }
    return { status: "current", installed, latest: latest.build };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/HTTP 403/.test(msg)) {
      // Unauthenticated GitHub API: 60 requests/hour PER IP — shared
      // carrier-NAT addresses exhaust that constantly.
      return {
        status: "error",
        message: "GitHub rate limit hit (shared network IP) — try Wi-Fi or again later",
      };
    }
    return { status: "error", message: msg || "Couldn't reach GitHub" };
  }
}

// Convenience wrapper for the launch check, which only cares about the
// "there's an update" case.
export async function checkForUpdate(force = false): Promise<AppUpdate | null> {
  const res = await checkForUpdateResult(force);
  return res.status === "update" ? res.update : null;
}

// Hands the APK to the system browser: Android downloads it and the user taps
// the finished download to install. Same signing key + higher versionCode, so
// it applies as an in-place upgrade with all data kept.
export function openUpdate(update: AppUpdate): void {
  window.open(update.url, "_blank");
}

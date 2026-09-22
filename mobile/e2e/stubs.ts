import { test as base, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Shared harness: every external request the app makes is answered here, so
// tests are hermetic (no network, no flakiness from YGOPRODeck being slow)
// and exercise the real code paths — sync, indexing, packs — end to end.
//
// Card data is a real API response captured into fixtures/cardinfo.json, not
// hand-written. Tests validated against invented shapes have misled us before.

const fixture = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8"));

type ApiCard = {
  id: number;
  name: string;
  card_sets?: { set_name: string; set_code: string; set_rarity: string }[];
};
const CARDS: ApiCard[] = fixture("cardinfo.json").data;

// 1×1 transparent PNG for every card image — the page must lay out and not
// crash on image loads; the pixels are irrelevant.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

const json = (body: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  headers: { "access-control-allow-origin": "*" },
  body: JSON.stringify(body),
});

export async function installStubs(page: Page): Promise<void> {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const host = url.hostname;

    // The app itself.
    if (host === "127.0.0.1" || host === "localhost") return route.continue();

    if (host === "db.ygoprodeck.com") {
      if (url.pathname.endsWith("/checkDBVer.php")) {
        return route.fulfill(json([{ database_version: "e2e-1", last_update: "2026-09-01" }]));
      }
      if (url.pathname.endsWith("/cardinfo.php")) {
        const id = url.searchParams.get("id");
        const set = url.searchParams.get("cardset");
        let data = CARDS;
        if (id) {
          const ids = new Set(id.split(",").map(Number));
          data = CARDS.filter((c) => ids.has(c.id));
        } else if (set) {
          data = CARDS.filter((c) => c.card_sets?.some((s) => s.set_name === set));
        }
        // The real API answers an unknown id with a 400 + error body.
        return data.length
          ? route.fulfill(json({ data }))
          : route.fulfill(json({ error: "No card matching your query was found." }, 400));
      }
      if (url.pathname.endsWith("/cardsets.php")) {
        const seen = new Map<string, { set_name: string; set_code: string; num_of_cards: number }>();
        for (const c of CARDS) {
          for (const s of c.card_sets ?? []) {
            const prefix = s.set_code.split("-")[0];
            const e = seen.get(s.set_name) ?? { set_name: s.set_name, set_code: prefix, num_of_cards: 0 };
            e.num_of_cards++;
            seen.set(s.set_name, e);
          }
        }
        return route.fulfill(json([...seen.values()]));
      }
    }

    if (host === "images.ygoprodeck.com") {
      return route.fulfill({ status: 200, contentType: "image/png", body: PNG });
    }

    // Update check: "no releases" is a legitimate answer the UI must handle.
    if (host === "api.github.com") return route.fulfill(json([]));

    // Data packs, meta-deck sources, trend prices: unreachable. These are all
    // best-effort in the app, so a 404 here tests the offline paths — which
    // is precisely what a flaky phone connection exercises.
    return route.fulfill({ status: 404, body: "stubbed offline" });
  });
}

// Console noise we cause on purpose (404s above) versus real faults.
const EXPECTED = [/Failed to load resource/i, /status of 40\d/i];

export const test = base.extend<{ errors: string[] }>({
  errors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !EXPECTED.some((re) => re.test(m.text()))) {
        errors.push(`console: ${m.text()}`);
      }
    });
    await installStubs(page);
    await use(errors);
    // Every test also asserts the app never threw or fell into the crash
    // screen — a sheet that renders but logs an exception is still a bug.
    expect(errors, "unexpected console errors / page errors").toEqual([]);
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
  },
});

export { expect };

// First launch → Welcome → download the (stubbed) card DB → Cards tab ready.
export async function syncFreshApp(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /download/i }).first().click();
  // The page switches off the Welcome screen once cards exist.
  await expect(page.getByText("Welcome 👋")).toHaveCount(0, { timeout: 30_000 });
}

export const FIXTURE_CARD_COUNT = CARDS.length;

import { test as base, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installStubs } from "./stubs";

// Schema upgrade test: open the PREVIOUS release's web bundle, put real data
// in it, then open THIS build on the same origin (IndexedDB is per-origin)
// and check nothing was lost. A failed Dexie upgrade on a phone lands on the
// crash screen with the collection inaccessible — the exact failure that cost
// a collection once already — so it's worth proving before an APK ships.
//
// Needs OLD_DIST: a `vite build` output of the previous release. Skipped
// without it, so the everyday suite doesn't depend on a second checkout.
const OLD_DIST = process.env.OLD_DIST;
const NEW_DIST = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const PORT = 4175;
const ORIGIN = `http://127.0.0.1:${PORT}`;

const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

// One origin, two bundles: /__use/old and /__use/new flip which dist the
// server hands out, exactly like installing an APK over the previous one.
let root = OLD_DIST ?? NEW_DIST;
let server: Server;

const test = base.extend({});
test.skip(!OLD_DIST, "set OLD_DIST to a previous release's dist/ to run");

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", ORIGIN);
    if (url.pathname === "/__use/old") root = OLD_DIST!;
    if (url.pathname === "/__use/new") root = NEW_DIST;
    if (url.pathname.startsWith("/__use/")) return res.end("ok");
    const file = join(root, url.pathname === "/" ? "index.html" : url.pathname);
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(await readFile(join(root, "index.html"))); // SPA fallback
    }
  });
  await new Promise<void>((r) => server.listen(PORT, "127.0.0.1", r));
});

test.afterAll(() => new Promise<void>((r) => server.close(() => r())));

const use = (page: Page, which: "old" | "new") => page.request.get(`${ORIGIN}/__use/${which}`);

const idbVersion = (page: Page) =>
  page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    return dbs.find((d) => d.name === "ygo-deck-builder")?.version ?? null;
  });

test("upgrading from the previous release keeps the collection, decks and wishlist", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await installStubs(page);

  // ---- previous release: sync and create data --------------------------
  await use(page, "old");
  await page.goto(ORIGIN);
  await page.getByRole("button", { name: /download/i }).first().click();
  await expect(page.getByText("Welcome 👋")).toHaveCount(0, { timeout: 30_000 });

  await page.getByRole("button", { name: "+" }).first().click(); // own a card
  await page.getByRole("button", { name: "+" }).first().click(); // …twice
  await page.getByRole("button", { name: "Add to wishlist" }).nth(3).click();
  const oldVersion = await idbVersion(page);

  // ---- this build over it ----------------------------------------------
  await use(page, "new");
  await page.goto(ORIGIN);
  await expect(page.getByText("Something went wrong")).toHaveCount(0);
  await expect(page.getByText("Welcome 👋")).toHaveCount(0); // cards survived
  const newVersion = await idbVersion(page);
  expect(newVersion, "schema should have been upgraded").toBeGreaterThan(oldVersion ?? 0);

  await page.getByRole("button", { name: "Owned", exact: true }).click();
  await expect(page.getByText("2", { exact: true }).first()).toBeVisible(); // quantity kept
  await page.getByRole("button", { name: "Wishlist", exact: true }).click();
  await expect(page.getByRole("button", { name: /Remove from wishlist/ })).toHaveCount(1);
  expect(errors, "page errors during upgrade").toEqual([]);

  // ---- and back again: an older APK over the newer schema --------------
  // Dexie 4 retries a VersionError by opening whatever version is on disk,
  // so an older build normally just works over a newer database — the new
  // tables sit unused. (The "too old" screen covers the rarer case where that
  // retry fails too, e.g. a newer release dropped a table the old code needs.)
  // Either outcome is acceptable. What must never happen is the old build
  // looking EMPTY (Welcome screen — invites a re-sync or "clear data") or
  // landing on the generic crash screen.
  await use(page, "old");
  await page.goto(ORIGIN);
  await expect(
    page.getByText("This app version is too old").or(page.getByRole("button", { name: "Owned", exact: true }))
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Welcome 👋")).toHaveCount(0);
  await expect(page.getByText("Something went wrong")).toHaveCount(0);

  // …and the round trip loses nothing.
  await use(page, "new");
  await page.goto(ORIGIN);
  await page.getByRole("button", { name: "Wishlist", exact: true }).click();
  await expect(page.getByRole("button", { name: /Remove from wishlist/ })).toHaveCount(1);
  expect(errors, "page errors across the round trip").toEqual([]);
});

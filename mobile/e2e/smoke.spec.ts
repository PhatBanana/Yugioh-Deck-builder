import type { Page } from "@playwright/test";
import { expect, syncFreshApp, test } from "./stubs";

// Smoke coverage for the parts of the app no unit test reaches. Each test
// starts from a fresh profile (empty IndexedDB) and a stubbed card sync, and
// the shared fixture fails the test on any console error or crash screen.

// Scoped to the bottom nav: the Scan page has its own "📷 Scan" toggle.
const tab = (page: Page, name: "Cards" | "Scan" | "Decks" | "Meta") =>
  page.getByRole("navigation").getByRole("button", { name: new RegExp(`${name}$`) }).click();

const heading = (page: Page, name: string | RegExp) => page.getByRole("heading", { name });

// Top-most sheet's × — stacked sheets each render one, newest last.
const closeTop = (page: Page) => page.getByRole("button", { name: "Close", exact: true }).last().click();

// A tap on the dimmed backdrop above the sheet (sheets cap at 92vh, so the
// top strip of the screen is always backdrop).
const tapBackdrop = (page: Page) => page.mouse.click(200, 12);

test.beforeEach(async ({ page }) => {
  await syncFreshApp(page);
});

test("first launch syncs the card database and lists the cards", async ({ page }) => {
  await expect(page.getByText(/Synced \d+ cards/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /^Dark Magician/ })).toBeVisible();
});

test.describe("bottom sheets", () => {
  test("backup sheet: opens, shows the build line, closes on ×", async ({ page }) => {
    await page.getByRole("button", { name: "💾 Backup" }).click();
    await expect(heading(page, "Backup & restore")).toBeVisible();
    await expect(page.getByText(/Browser build|Installed build/)).toBeVisible();
    await closeTop(page);
    await expect(heading(page, "Backup & restore")).toHaveCount(0);
  });

  test("trades sheet closes on a backdrop tap", async ({ page }) => {
    await page.getByRole("button", { name: "🤝 Trades" }).click();
    await expect(heading(page, "Trades")).toBeVisible();
    await tapBackdrop(page);
    await expect(heading(page, "Trades")).toHaveCount(0);
  });

  test("owned view: insights, alerts and budget sheets all open and close", async ({ page }) => {
    // Own two cards so the owned-only sheets have something to show.
    await page.getByRole("button", { name: "+" }).first().click();
    await page.getByRole("button", { name: "+" }).nth(1).click();
    await page.getByRole("button", { name: "Owned", exact: true }).click();

    for (const [button, title] of [
      ["📊 Insights", /Collection insights/],
      ["🔔 Alerts", /Price alerts/],
    ] as const) {
      await page.getByRole("button", { name: button }).click();
      await expect(heading(page, title)).toBeVisible();
      await closeTop(page);
      await expect(heading(page, title)).toHaveCount(0);
    }

    await page.getByRole("button", { name: "Wishlist", exact: true }).click();
    await page.getByRole("button", { name: "💰 Budget planner" }).click();
    await expect(heading(page, /Budget planner/)).toBeVisible();
    await closeTop(page);
  });

  test("stacked sheets: dismissing the pack sim leaves its set open", async ({ page }) => {
    await page.getByRole("button", { name: "Sets", exact: true }).click();
    // Set rows end in "→"; any set from the stubbed cardsets.php works.
    await page.getByRole("button", { name: /· \d+ cards →$/ }).first().click();
    await page.getByRole("button", { name: "📦 Open a pack" }).click();
    await expect(heading(page, /Pack simulator/)).toBeVisible();

    // The BottomSheet refactor made every backdrop stop propagation. Before,
    // only three sheets did — a tap on the pack sim's backdrop could also
    // reach the set sheet underneath and close both.
    await tapBackdrop(page);
    await expect(heading(page, /Pack simulator/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "📦 Open a pack" })).toBeVisible();
  });
});

test.describe("scan tab (no camera on web)", () => {
  test("scan settings: sticky header, OCR script persists, pack errors are handled", async ({ page }) => {
    await tab(page, "Scan");
    await page.getByRole("button", { name: "⚙ Settings" }).click();
    await expect(heading(page, "Scan settings")).toBeVisible();

    // The longest sheet: scrolled to the bottom, its close button must still
    // be on screen (sticky title row).
    await page.locator(".sheet").last().evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(page.getByRole("button", { name: "Close", exact: true })).toBeInViewport();

    // Text recognition choice survives a reload (localStorage).
    await page.getByRole("button", { name: "Japanese (日本語)" }).click();
    await page.reload();
    await tab(page, "Scan");
    await page.getByRole("button", { name: "⚙ Settings" }).click();
    await expect(page.getByRole("button", { name: "Japanese (日本語)" })).toHaveClass(/seg-on/);

    // Packs are unreachable in this harness: installs must fail politely.
    await page.getByRole("button", { name: /Install \(~0\.7 MB\)/ }).click();
    await expect(page.getByText(/Couldn't download the printing pack/)).toBeVisible();
  });

  test("camera features are disabled, with an explanation, where there's no camera", async ({ page }) => {
    await tab(page, "Scan");
    await expect(page.getByRole("button", { name: "🔦 Foil lab" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "📷 Scan cards" })).toBeDisabled();
    await expect(page.getByText(/works in the Android app/)).toBeVisible();
    // The manual fallback still works — and uses the typo-tolerant search.
    await page.getByPlaceholder("Or add a card by name…").fill("Dark Magican");
    await expect(page.getByText("Dark Magician").first()).toBeVisible();
  });
});

test.describe("decks", () => {
  const LIST = [
    "Branded Test",
    "",
    "Monsters",
    "3 Fallen of Albaz",
    "2 Aluber the Jester of Despia",
    "",
    "Spell Cards",
    "3 Branded Fusion",
    "",
    "Extra Deck",
    "1 Mirriorjade the Iceblade Dragon", // typo → Mirrorjade
    "1 Lebellion the Ssaring Dragon", //   typo → Lubellion
    "1 Despia Quaeritis", //               not in this card pool
  ].join("\n");

  test("written deck list: preview, corrections, fix a line, import", async ({ page }) => {
    await tab(page, "Decks");
    await page.getByRole("button", { name: "Import a written deck list" }).click();
    await page.getByRole("textbox").first().fill(LIST);
    await page.getByRole("button", { name: "Check list" }).click();

    // 5 lines resolve (3 exact + 2 fuzzy), 1 doesn't.
    await expect(page.getByText(/matched/)).toContainText("5");
    await expect(page.getByText(/corrected/)).toContainText("2");
    await expect(page.getByText(/not found/)).toContainText("1");

    // Fix the unresolved line via the stacked picker, then dismiss the picker
    // by its backdrop — the import sheet underneath must survive.
    await page.getByText("Not found — tap to pick").click();
    await expect(heading(page, /Which card is/)).toBeVisible();
    await tapBackdrop(page);
    await expect(heading(page, /Which card is/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Import \d+ cards$/ })).toBeVisible();

    await page.getByRole("button", { name: /^Import \d+ cards$/ }).click();
    await expect(page.getByText("Branded Test")).toBeVisible();
  });

  test("new deck: add cards by misspelled partial search", async ({ page }) => {
    await tab(page, "Decks");
    await page.getByRole("button", { name: "+ New deck" }).click();
    const search = page.getByRole("searchbox", { name: /Add a card to Main Deck/ });
    // A misspelled partial name — this returned nothing before the prefix
    // matcher, which is how the suite caught it.
    await search.fill("Ash Blosom");
    await page.getByRole("button", { name: /Ash Blossom/ }).first().click();
    await expect(page.getByRole("heading", { name: /Main Deck \(1\)/ })).toBeVisible();
  });

  test("duel tools and an invalid deck code both behave", async ({ page }) => {
    await tab(page, "Decks");
    await page.getByRole("button", { name: "Duel tools" }).click();
    await expect(heading(page, "Duel tools")).toBeVisible();
    await page.getByRole("button", { name: /Coin flip/ }).click();
    await closeTop(page);

    await page.getByRole("button", { name: "Import from deck code" }).click();
    await page.getByRole("textbox").fill("YGO1|definitely-not-a-deck");
    await page.getByRole("button", { name: "Import deck" }).click();
    await expect(heading(page, "Import deck code")).toBeVisible(); // stays open on error
  });
});

test.describe("meta", () => {
  test("recommendations and buy-next both render from one data load", async ({ page }) => {
    await tab(page, "Meta");
    await expect(page.getByRole("button", { name: /Best cards to buy next/ })).toBeVisible();
    await page.getByRole("button", { name: /Best cards to buy next/ }).click();
    await expect(page.getByRole("button", { name: /Show more decks/ })).toBeVisible();
  });
});

test("wishlist heart: toggled in the list, shown in the Wishlist view", async ({ page }) => {
  await page.getByRole("button", { name: "Add to wishlist" }).first().click();
  await page.getByRole("button", { name: "Wishlist", exact: true }).click();
  await expect(page.getByRole("button", { name: /Remove from wishlist/ }).first()).toBeVisible();
});

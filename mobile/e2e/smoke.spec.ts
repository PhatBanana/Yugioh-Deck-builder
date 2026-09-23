import type { Page } from "@playwright/test";
import { expect, syncFreshApp, test } from "./stubs";

// Smoke coverage for the parts of the app no unit test reaches. Each test
// starts from a fresh profile (empty IndexedDB) and a stubbed card sync, and
// the shared fixture fails the test on any console error or crash screen.

// Scoped to the bottom nav: the Scan page has its own "📷 Scan" toggle.
const tab = (page: Page, name: "Cards" | "Add" | "Decks" | "Meta") =>
  page.getByRole("navigation").getByRole("button", { name: new RegExp(`${name}$`) }).click();

const heading = (page: Page, name: string | RegExp) => page.getByRole("heading", { name });

// Decks list → 📥 Import → one of the import options.
async function importVia(page: Page, option: RegExp) {
  await page.getByRole("button", { name: "📥 Import" }).click();
  await page.getByRole("button", { name: option }).click();
}

// The app-wide Settings sheet, from the ⚙ in the header (any tab).
const openAppSettings = (page: Page) =>
  page.getByRole("banner").getByRole("button", { name: "Settings", exact: true }).click();

// Top-most sheet's × — stacked sheets each render one, newest last.
const closeTop = (page: Page) => page.getByRole("button", { name: "Close", exact: true }).last().click();

// A tap on the dimmed backdrop above the sheet (sheets cap at 92vh, so the
// top strip of the screen is always backdrop).
const tapBackdrop = (page: Page) => page.mouse.click(200, 12);


// Logs a trade through the real form: gives one Albion, gets one Aluber.
async function logTestTrade(page: Page) {
  await page.getByRole("button", { name: "🤝 Trades" }).click();
  await page.getByRole("button", { name: "＋ Log a trade" }).click();
  await page.getByPlaceholder("Search cards to add…").fill("Albion");
  const sheet = page.locator(".sheet").last();
  await sheet.getByRole("button", { name: /Albion the Branded Dragon/ }).first().click();
  await page.getByRole("button", { name: "Adding to: You got" }).click();
  await page.getByPlaceholder("Search cards to add…").fill("Aluber");
  await sheet.getByRole("button", { name: /Aluber the Jester of Despia/ }).first().click();
  await page.getByRole("button", { name: "Save trade" }).click();
  await expect(page.getByText(/Trade logged/)).toBeVisible();
}


test.beforeEach(async ({ page }) => {
  await syncFreshApp(page);
});

test("first launch syncs the card database and lists the cards", async ({ page }) => {
  await expect(page.getByText(/Synced \d+ cards/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /^Dark Magician/ })).toBeVisible();
});

test.describe("bottom sheets", () => {
  test("settings: opens from the header on any tab, grouped in three sections", async ({ page }) => {
    // From a tab other than Cards: it's app-wide, not a Cards feature.
    await tab(page, "Decks");
    await openAppSettings(page);
    await expect(heading(page, "Settings")).toBeVisible();
    for (const section of ["Backup & restore", "Card data", "App"]) {
      await expect(heading(page, section)).toBeVisible();
    }
    await expect(page.getByText(/Browser build|Installed build/)).toBeVisible();
    // The packs moved here from Scan settings; offline installs fail politely.
    await page.getByRole("button", { name: /Install \(~0\.7 MB\)/ }).click();
    await expect(page.getByText(/Couldn't download the printing pack/)).toBeVisible();
    await closeTop(page);
    await expect(heading(page, "Settings")).toHaveCount(0);
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
  test("scan settings: sticky header, OCR script persists", async ({ page }) => {
    await tab(page, "Add");
    await page.getByRole("button", { name: "⚙ Scan settings" }).click();
    await expect(heading(page, "Scan settings")).toBeVisible();

    // The longest sheet: scrolled to the bottom, its close button must still
    // be on screen (sticky title row).
    await page.locator(".sheet").last().evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(page.getByRole("button", { name: "Close", exact: true })).toBeInViewport();

    // Text recognition choice survives a reload (localStorage).
    await page.getByRole("button", { name: "Japanese (日本語)" }).click();
    await page.reload();
    await tab(page, "Add");
    await page.getByRole("button", { name: "⚙ Scan settings" }).click();
    await expect(page.getByRole("button", { name: "Japanese (日本語)" })).toHaveClass(/seg-on/);
    // Card-data packs moved to app Settings.
    await expect(page.getByText("Japanese printings")).toHaveCount(0);
  });

  test("camera features are disabled, with an explanation, where there's no camera", async ({ page }) => {
    await tab(page, "Add");
    await expect(page.getByRole("button", { name: "🔦 Foil lab" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "📷 Scan cards" })).toBeDisabled();
    await expect(page.getByText(/works in the Android app/)).toBeVisible();
    // The manual fallback still works — and uses the typo-tolerant search.
    await page.getByPlaceholder("Or add a card by name…").fill("Dark Magican");
    await expect(page.getByText("Dark Magician").first()).toBeVisible();
    // …including a misspelled partial name, which found nothing before.
    await page.getByPlaceholder("Or add a card by name…").fill("Ash Blosom");
    await expect(page.getByText("Ash Blossom & Joyous Spring").first()).toBeVisible();
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
    await importVia(page, /Paste a written deck list/);
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

  test("a deck remembers its format", async ({ page }) => {
    await tab(page, "Decks");
    await page.getByRole("button", { name: "+ New deck" }).click();
    await page.getByRole("button", { name: "Speed", exact: true }).click();
    await expect(page.getByRole("button", { name: "Speed", exact: true })).toHaveClass(/seg-on/);

    // Leave and come back: used to reset to TCG every time.
    await page.getByRole("button", { name: "←" }).click();
    // exact: getByText is a case-insensitive substring match by default, which
    // hits the "+ New deck" button first and quietly makes a second deck.
    await page.getByText("New Deck", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Speed", exact: true })).toHaveClass(/seg-on/);
    await expect(page.getByRole("button", { name: "TCG", exact: true })).not.toHaveClass(/seg-on/);
  });

  test("duel tools and an invalid deck code both behave", async ({ page }) => {
    await tab(page, "Decks");
    await page.getByRole("button", { name: /Duel tools/ }).click();
    await expect(heading(page, "Duel tools")).toBeVisible();
    await page.getByRole("button", { name: /Coin flip/ }).click();
    await closeTop(page);

    await importVia(page, /Paste a deck code/);
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

test("diagnostics: an error the user saw ends up in the copied report", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

  // Produce a real error toast: the printing pack is unreachable here.
  await openAppSettings(page);
  await page.getByRole("button", { name: /Install \(~0\.7 MB\)/ }).click();
  await expect(page.getByText(/Couldn't download the printing pack/)).toBeVisible();
  // Reopen so the counts line re-reads the log.
  await closeTop(page);
  await openAppSettings(page);
  await expect(page.getByText(/1 errors · 0 recent scans logged/)).toBeVisible();
  await page.getByRole("button", { name: "🩺 Copy diagnostics" }).click();
  await expect(page.getByText("Diagnostics copied")).toBeVisible();

  const report = await page.evaluate(() => navigator.clipboard.readText());
  expect(report).toContain("build: browser");
  expect(report).toContain("card database: 22");
  expect(report).toContain("toast: Couldn't download the printing pack");
  expect(report).toContain("(none — scan a card first)");

  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByText(/0 errors · 0 recent scans logged/)).toBeVisible();
});

test.describe("round trips", () => {
  test("backup → wiped app → restore from the Welcome screen brings everything back", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

    // Data worth losing: 3 copies of one card, 1 of another, a wishlist entry.
    const plus = page.getByRole("button", { name: "+" });
    await plus.first().click();
    await plus.first().click();
    await plus.first().click();
    await plus.nth(1).click();
    await page.getByRole("button", { name: "Add to wishlist" }).nth(4).click();

    // …and a trade, which backups used to leave out entirely.
    await logTestTrade(page);
    await closeTop(page);

    await openAppSettings(page);
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(page.getByText("Backup copied")).toBeVisible();
    const backup = await page.evaluate(() => navigator.clipboard.readText());

    // What "clear app data" does on the phone: the whole database is gone.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const req = indexedDB.deleteDatabase("ygo-deck-builder");
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
          req.onblocked = () => resolve();
        })
    );
    await page.reload();
    await expect(page.getByText("Welcome 👋")).toBeVisible();

    // The recovery path a user actually has at that moment.
    await page.getByRole("button", { name: "Restore a backup" }).click();
    await page.getByPlaceholder("…or paste a backup here").fill(backup);
    await page.getByRole("button", { name: "Check pasted backup" }).click();
    await page.getByRole("button", { name: "Restore now" }).click();
    await expect(page.getByText(/Restored 2 cards, 0 decks, 1 wishlisted, 1 trades/)).toBeVisible();

    // The card database isn't in a backup (it re-downloads); after it does,
    // the restored quantities must be intact.
    await page.getByRole("button", { name: /download/i }).first().click();
    await expect(page.getByText("Welcome 👋")).toHaveCount(0, { timeout: 30_000 });
    await page.getByRole("button", { name: "Owned", exact: true }).click();
    // Albion 3→2 and Aluber 1→2 after the trade — exact quantities, not just
    // the cards — plus the trade itself.
    await expect(page.getByText(/4 cards · 2 unique/)).toBeVisible();
    await page.getByRole("button", { name: "🤝 Trades" }).click();
    await expect(page.getByRole("button", { name: "Delete entry" })).toHaveCount(1);
    await closeTop(page);
    await page.getByRole("button", { name: "Wishlist", exact: true }).click();
    await expect(page.getByRole("button", { name: /Remove from wishlist/ })).toHaveCount(1);
  });

  test("deck share code → import reproduces the deck", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await tab(page, "Decks");
    await importVia(page, /Paste a written deck list/);
    await page.getByRole("textbox").first().fill(
      ["Shared Deck", "", "Monsters", "3 Fallen of Albaz", "2 Dark Magician", "", "Extra Deck", "1 Mirrorjade the Iceblade Dragon"].join("\n")
    );
    await page.getByRole("button", { name: "Check list" }).click();
    await page.getByRole("button", { name: /^Import \d+ cards$/ }).click();

    // The import lands straight in the deck editor.
    await expect(page.getByRole("heading", { name: /Main Deck \(5\)/ })).toBeVisible();
    await page.getByRole("button", { name: "📤 Share" }).click();
    await page.getByRole("button", { name: /🔗 Share code/ }).click();
    await expect(page.getByText("Deck code copied")).toBeVisible();
    const code = await page.evaluate(() => navigator.clipboard.readText());
    expect(code).toMatch(/^YGO1\|/);

    await page.getByRole("button", { name: "←" }).click();
    await importVia(page, /Paste a deck code/);
    await page.getByRole("textbox").fill(code);
    await page.getByRole("button", { name: "Import deck" }).click();

    // Same composition in the copy: 5 main, 1 extra.
    await expect(page.getByRole("heading", { name: /Main Deck \(5\)/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Extra Deck \(1\)/ })).toBeVisible();
  });
});

test.describe("trades", () => {
  test("deleting a trade undoes what it did to the collection", async ({ page }) => {
    // Own 2 Albion (first card A–Z); Aluber (second) starts at 0.
    await page.getByRole("button", { name: "+" }).first().click();
    await page.getByRole("button", { name: "+" }).first().click();

    await logTestTrade(page);
    await closeTop(page);
    await page.getByRole("button", { name: "Owned", exact: true }).click();
    // Gave one Albion (2→1), got one Aluber (0→1).
    await expect(page.getByText(/2 cards · 2 unique/)).toBeVisible();

    await page.getByRole("button", { name: "🤝 Trades" }).click();
    await page.getByRole("button", { name: "Delete entry" }).click();
    await expect(page.getByText(/Your collection goes back to how it was/)).toBeVisible();
    await page.getByRole("button", { name: "Delete & undo" }).click();
    await expect(page.getByText("Trade undone")).toBeVisible();
    await closeTop(page);
    // Back to exactly 2 Albion and no Aluber.
    await expect(page.getByText(/2 cards · 1 unique/)).toBeVisible();
  });

  test("the Undo on 'Trade logged' reverses it too", async ({ page }) => {
    await page.getByRole("button", { name: "+" }).first().click();
    await logTestTrade(page);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("Trade undone")).toBeVisible();
    await expect(page.getByText(/No trades logged yet/)).toBeVisible();
    await closeTop(page);
    await page.getByRole("button", { name: "Owned", exact: true }).click();
    await expect(page.getByText(/1 cards · 1 unique|1 card · 1 unique/)).toBeVisible();
  });
});

test.describe("layout: menus and filters", () => {
  test("deck editor: tools up top, Share menu, and ⋯ holds Duplicate / Delete", async ({ page }) => {
    await tab(page, "Decks");
    await page.getByRole("button", { name: "+ New deck" }).click();
    // Everyday tools sit under the stats, not below every card.
    for (const name of ["🎴 Test hand", "🎯 Odds", "📤 Share"]) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }
    await page.getByRole("button", { name: "📤 Share" }).click();
    await expect(heading(page, "Share deck")).toBeVisible();
    await expect(page.getByRole("button", { name: /Export \.ydk/ })).toBeVisible();
    await closeTop(page);

    await page.getByRole("button", { name: "Deck actions" }).click();
    await page.getByRole("button", { name: /Duplicate deck/ }).click();
    await expect(page.getByText(/Duplicated as "New Deck \(copy\)"/)).toBeVisible();

    // Delete is a deliberate, confirmed act now — not a button beside Export.
    await page.getByRole("button", { name: "Deck actions" }).click();
    await page.getByRole("button", { name: /Delete deck/ }).click();
    await expect(page.getByText("Delete this deck?")).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("button", { name: "+ New deck" })).toBeVisible();
    await expect(page.getByText("New Deck (copy)", { exact: true })).toBeVisible();
  });

  test("deck list: tile ⋯ menu adds missing cards to the wishlist", async ({ page }) => {
    await tab(page, "Decks");
    await importVia(page, /Paste a written deck list/);
    await page.getByRole("textbox").first().fill(["Menu Deck", "", "Monsters", "2 Dark Magician"].join("\n"));
    await page.getByRole("button", { name: "Check list" }).click();
    await page.getByRole("button", { name: /^Import \d+ cards$/ }).click();
    await page.getByRole("button", { name: "←" }).click();

    await page.getByRole("button", { name: "Actions for Menu Deck" }).click();
    await page.getByRole("button", { name: /Add missing cards to wishlist/ }).click();
    await expect(page.getByText(/Added 1 missing card to your wishlist/)).toBeVisible();
  });

  test("cards: filters collapse behind a toggle; active ones stay visible as chips", async ({ page }) => {
    // Collapsed by default: no filter dropdowns before the list.
    await expect(page.getByRole("combobox", { name: "Card type" })).toHaveCount(0);
    await page.getByRole("button", { name: /^Filters/ }).click();
    await page.getByRole("combobox", { name: "Card type" }).selectOption("Monster");
    await page.getByRole("combobox", { name: "Attribute" }).selectOption("DARK");
    await page.getByRole("button", { name: /^Filters \(2\)/ }).click(); // close

    // Closed, the two filters show as chips — and they really filter.
    await expect(page.getByRole("button", { name: "Remove filter Monsters" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Dark Magician/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Pot of Greed/ })).toHaveCount(0);

    await page.getByRole("button", { name: "Remove filter Monsters" }).click();
    await page.getByRole("button", { name: "Remove filter DARK" }).click();
    await expect(page.getByRole("button", { name: /^Filters$|^Filters ▾$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Pot of Greed/ })).toBeVisible();
  });

  test("cards: Select sits above the owned list; card detail leads with owned + wishlist", async ({ page }) => {
    await page.getByRole("button", { name: "+" }).first().click();
    await page.getByRole("button", { name: "+" }).nth(2).click();
    await page.getByRole("button", { name: "Owned", exact: true }).click();

    // The value card keeps the collection's tools; Select moved to the list.
    await expect(page.getByRole("button", { name: "🤝 Trades" })).toBeVisible();
    await expect(page.getByText("2 cards", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "☑ Select" }).click();
    await expect(page.getByText("Tap cards to pick")).toBeVisible();
    await page.getByRole("button", { name: "× Cancel" }).click();

    // In the detail sheet, the Owned stepper comes before the art and stats.
    await page.getByRole("button", { name: /^Albion the Branded Dragon/ }).click();
    // Read both positions in one frame — the sheet is still sliding up.
    const sheet = page.locator(".sheet").last();
    await expect(sheet.getByText("Owned", { exact: true })).toBeVisible();
    const ownedFirst = await sheet.evaluate((el) => {
      const y = (text: string) =>
        [...el.querySelectorAll("span, dt")].find((n) => n.textContent === text)!.getBoundingClientRect().top;
      return y("Owned") < y("Type");
    });
    expect(ownedFirst).toBe(true);
  });

  test("meta: filters collapse; side deck moved in as a labelled option", async ({ page }) => {
    await tab(page, "Meta");
    await expect(page.getByText("Count side deck cards")).toHaveCount(0);
    await page.getByRole("button", { name: /^Filters/ }).click();
    await page.getByText("Count side deck cards").click();
    await page.getByRole("button", { name: "≤ $25" }).click();
    await page.getByRole("button", { name: /^Filters \(2\)/ }).click();
    await expect(page.getByRole("button", { name: "Remove filter With side deck" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove filter ≤ $25" })).toBeVisible();
  });
});

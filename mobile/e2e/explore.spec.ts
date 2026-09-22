import { syncFreshApp, test } from "./stubs";

// Exploration helper, not a test of behaviour: prints each tab's buttons so
// the real specs can target what's actually rendered. Skipped unless asked.
test.skip(!process.env.EXPLORE, "exploration only");

test("list buttons per tab", async ({ page }) => {
  await syncFreshApp(page);
  await page.waitForTimeout(1500);
  for (const tab of ["Cards", "Scan", "Decks", "Meta"]) {
    await page.getByRole("button", { name: new RegExp(`^\\S*\\s*${tab}$`) }).first().click();
    await page.waitForTimeout(800);
    const names = await page.getByRole("button").evaluateAll((els) =>
      els.map((e) => (e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " ")).filter(Boolean)
    );
    console.log(`\n=== ${tab} (${names.length}) ===\n` + [...new Set(names)].slice(0, 70).join(" | "));
  }
});

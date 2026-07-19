import { describe, expect, it } from "vitest";
import { valueEntry } from "../../shared/collection/value";

// Secret Rare $30, Common $1; generic card price $2.
const priceOf = (code?: string, rarity?: string): number | null => {
  if (rarity === "Secret Rare") return 30;
  if (rarity === "Common") return 1;
  return null;
};

describe("valueEntry", () => {
  it("uses the generic price when there is no breakdown", () => {
    expect(valueEntry(3, undefined, 2, priceOf)).toBe(6);
  });

  it("values each printing at its own price", () => {
    const copies = [
      { quantity: 1, code: "X-EN001", rarity: "Secret Rare" },
      { quantity: 2, code: "Y-EN001", rarity: "Common" },
    ];
    expect(valueEntry(3, copies, 2, priceOf)).toBe(30 + 2 * 1);
  });

  it("prices unattributed copies at the generic price", () => {
    // Own 3, only 1 attributed (Secret) -> 30 + 2 generic.
    const copies = [{ quantity: 1, code: "X-EN001", rarity: "Secret Rare" }];
    expect(valueEntry(3, copies, 2, priceOf)).toBe(30 + 2 * 2);
  });

  it("falls back to generic when a printing has no known price", () => {
    const copies = [{ quantity: 1, rarity: "Ghost Rare" }]; // priceOf -> null
    expect(valueEntry(1, copies, 2, priceOf)).toBe(2);
  });

  it("clamps a breakdown that overshoots the owned total", () => {
    // Drift: copies sum to 4 but only 2 owned -> value only 2 (both Secret).
    const copies = [{ quantity: 4, code: "X-EN001", rarity: "Secret Rare" }];
    expect(valueEntry(2, copies, 2, priceOf)).toBe(60);
  });

  it("treats a missing generic price as zero", () => {
    expect(valueEntry(2, undefined, null, priceOf)).toBe(0);
  });
});

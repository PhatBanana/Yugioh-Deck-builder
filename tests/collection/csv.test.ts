import { describe, expect, it } from "vitest";
import { collectionToCsv } from "../../shared/collection/csv";

describe("collectionToCsv", () => {
  it("writes header + one line per row with totals", () => {
    const csv = collectionToCsv([
      { name: "Blue-Eyes White Dragon", quantity: 3, condition: "NM", printingCode: "LOB-001", rarity: "Ultra Rare", priceUsd: 3.5, tags: ["binder A"] },
    ]);
    const [header, row] = csv.split("\n");
    expect(header).toBe(
      "Name,Quantity,Condition,Set Code,Rarity,Rarity Guessed,Edition,Unit Price USD,Total USD,Binders"
    );
    expect(row).toBe("Blue-Eyes White Dragon,3,NM,LOB-001,Ultra Rare,,,3.50,10.50,binder A");
  });

  it("quotes commas and embedded quotes", () => {
    const csv = collectionToCsv([
      { name: 'Fiend, the "Great"', quantity: 1, priceUsd: null },
    ]);
    expect(csv.split("\n")[1]).toBe('"Fiend, the ""Great""",1,,,,,,,,');
  });

  it("leaves price columns empty when unpriced", () => {
    const csv = collectionToCsv([{ name: "X", quantity: 2 }]);
    expect(csv.split("\n")[1]).toBe("X,2,,,,,,,,");
  });
  it("carries the edition, so two editions of one printing stay distinguishable", () => {
    const csv = collectionToCsv([
      { name: "Dark Magician", quantity: 1, printingCode: "SDY-006", rarity: "Ultra Rare", edition: "1st Edition" },
      { name: "Dark Magician", quantity: 2, printingCode: "SDY-006", rarity: "Ultra Rare" },
    ]);
    const [, first, second] = csv.split("\n");
    expect(first).toBe("Dark Magician,1,,SDY-006,Ultra Rare,,1st Edition,,,");
    // Blank, not "Unlimited": an unmarked card and a missed read look alike.
    expect(second).toBe("Dark Magician,2,,SDY-006,Ultra Rare,,,,,");
  });

  it("flags a rarity that is only the app's best guess", () => {
    const csv = collectionToCsv([
      { name: "Ash Blossom & Joyous Spring", quantity: 1, rarity: "Secret Rare", rarityGuessed: true },
    ]);
    expect(csv.split("\n")[1]).toBe('Ash Blossom & Joyous Spring,1,,,Secret Rare,yes,,,,');
  });
});

import { describe, expect, it } from "vitest";
import { collectionToCsv } from "../../shared/collection/csv";

describe("collectionToCsv", () => {
  it("writes header + one line per row with totals", () => {
    const csv = collectionToCsv([
      { name: "Blue-Eyes White Dragon", quantity: 3, condition: "NM", printingCode: "LOB-001", rarity: "Ultra Rare", priceUsd: 3.5, tags: ["binder A"] },
    ]);
    const [header, row] = csv.split("\n");
    expect(header).toBe("Name,Quantity,Condition,Set Code,Rarity,Unit Price USD,Total USD,Binders");
    expect(row).toBe("Blue-Eyes White Dragon,3,NM,LOB-001,Ultra Rare,3.50,10.50,binder A");
  });

  it("quotes commas and embedded quotes", () => {
    const csv = collectionToCsv([
      { name: 'Fiend, the "Great"', quantity: 1, priceUsd: null },
    ]);
    expect(csv.split("\n")[1]).toBe('"Fiend, the ""Great""",1,,,,,,');
  });

  it("leaves price columns empty when unpriced", () => {
    const csv = collectionToCsv([{ name: "X", quantity: 2 }]);
    expect(csv.split("\n")[1]).toBe("X,2,,,,,,");
  });
});

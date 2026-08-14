import { describe, expect, it } from "vitest";
import {
  guideEntryFor,
  guideReferenceUrl,
  RARITY_GUIDE,
} from "../../shared/scan/rarityGuide";
import { rarityAbbrev } from "../../shared/scan/setCode";
import { traitsFor } from "../../shared/scan/rarityTraits";

describe("RARITY_GUIDE", () => {
  it("covers the tiers people actually have to tell apart", () => {
    const names = RARITY_GUIDE.map((e) => e.rarity);
    for (const r of [
      "Common",
      "Rare",
      "Super Rare",
      "Ultra Rare",
      "Secret Rare",
      "Ultimate Rare",
      "Starlight Rare",
      "Quarter Century Secret Rare",
    ]) {
      expect(names).toContain(r);
    }
  });

  it("gives every entry a tell, era, frequency and abbreviation", () => {
    for (const e of RARITY_GUIDE) {
      expect(e.tell.length).toBeGreaterThan(20);
      expect(e.era).toBeTruthy();
      expect(e.frequency).toBeTruthy();
    }
  });

  it("uses the SAME abbreviations as every chip and picker in the app", () => {
    // The guide once had its own abbreviation logic and showed "SR" where
    // the picker beside it showed "ScR" — they must come from one helper.
    for (const e of RARITY_GUIDE) {
      expect(e.abbrev).toBe(rarityAbbrev(e.rarity));
    }
    expect(RARITY_GUIDE.find((e) => e.rarity === "Secret Rare")?.abbrev).toBe("ScR");
  });

  it("keeps its traits in sync with the narrowing table", () => {
    // The guide's chips and the picker's checkboxes must never disagree.
    for (const e of RARITY_GUIDE) {
      expect(e.traits).toEqual(traitsFor(e.rarity));
    }
  });

  it("describes the traits the picker asks about", () => {
    const byName = (r: string) => RARITY_GUIDE.find((e) => e.rarity === r)!;
    expect(byName("Rare").traits).toMatchObject({ name: "silver", artFoiled: false });
    expect(byName("Super Rare").traits).toMatchObject({ name: "plain", artFoiled: true });
    expect(byName("Ultra Rare").traits).toMatchObject({ name: "gold" });
    expect(byName("Ultimate Rare").traits.embossed).toBe(true);
  });
});

describe("guideEntryFor", () => {
  it("finds an exact tier", () => {
    expect(guideEntryFor("Secret Rare")?.rarity).toBe("Secret Rare");
    expect(guideEntryFor("  ultra rare ")?.rarity).toBe("Ultra Rare");
  });

  it("falls back to a contained tier name for decorated rarities", () => {
    // Printed rarities carry prefixes the guide doesn't list separately.
    expect(guideEntryFor("Platinum Secret Rare")?.rarity).toBe("Secret Rare");
  });

  it("returns nothing for an unknown rarity", () => {
    expect(guideEntryFor("Totally New Rare")).toBeUndefined();
  });
});

describe("guideReferenceUrl", () => {
  it("builds an escaped Yugipedia search link", () => {
    expect(guideReferenceUrl("Quarter Century Secret Rare")).toBe(
      "https://yugipedia.com/index.php?search=Quarter%20Century%20Secret%20Rare"
    );
  });
});

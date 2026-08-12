import { describe, expect, it } from "vitest";
import {
  foilToAnswers,
  matchesTraits,
  traitsFor,
  usefulQuestions,
} from "../../shared/scan/rarityTraits";

describe("traitsFor", () => {
  it("maps the everyday tiers to what you can see", () => {
    expect(traitsFor("Common")).toEqual({ name: "plain", artFoiled: false, embossed: false });
    expect(traitsFor("Rare")).toEqual({ name: "silver", artFoiled: false, embossed: false });
    expect(traitsFor("Super Rare")).toEqual({ name: "plain", artFoiled: true, embossed: false });
    expect(traitsFor("Ultra Rare")).toEqual({ name: "gold", artFoiled: true, embossed: false });
    expect(traitsFor("Secret Rare")).toEqual({ name: "silver", artFoiled: true, embossed: false });
  });

  it("maps the chase tiers, most specific keyword first", () => {
    expect(traitsFor("Ultimate Rare").embossed).toBe(true);
    expect(traitsFor("Quarter Century Secret Rare").name).toBe("rainbow");
    expect(traitsFor("Starlight Rare").name).toBe("rainbow");
    expect(traitsFor("Gold Secret Rare").name).toBe("gold");
    expect(traitsFor("Prismatic Secret Rare").name).toBe("silver");
    expect(traitsFor("Ghost Rare").name).toBe("silver");
  });

  it("leaves unknown finishes unconstrained", () => {
    expect(traitsFor("Some Future Rarity")).toEqual({});
    expect(traitsFor("Starfoil Rare").name).toBeUndefined();
  });
});

describe("matchesTraits", () => {
  it("filters by answered traits and fails open on unknowns", () => {
    expect(matchesTraits("Ultra Rare", { name: "gold" })).toBe(true);
    expect(matchesTraits("Secret Rare", { name: "gold" })).toBe(false);
    expect(matchesTraits("Ultra Rare", { name: "gold", artFoiled: true })).toBe(true);
    expect(matchesTraits("Common", { artFoiled: true })).toBe(false);
    // Unknown rarity is never disqualified.
    expect(matchesTraits("Mystery Rare", { name: "gold", artFoiled: false })).toBe(true);
    // No answers = everything matches.
    expect(matchesTraits("Common", {})).toBe(true);
  });

  it("separates the RA05-style pileup with one or two answers", () => {
    const candidates = [
      "Ultra Rare",
      "Secret Rare",
      "Quarter Century Secret Rare",
      "Prismatic Secret Rare",
      "Ultimate Rare",
      "Platinum Secret Rare",
    ];
    // "The name is gold" alone narrows six to two…
    expect(candidates.filter((r) => matchesTraits(r, { name: "gold" }))).toEqual([
      "Ultra Rare",
      "Ultimate Rare",
    ]);
    // …and "not embossed" settles it.
    expect(
      candidates.filter((r) => matchesTraits(r, { name: "gold", embossed: false }))
    ).toEqual(["Ultra Rare"]);
  });
});

describe("usefulQuestions", () => {
  it("only offers questions that split the candidates", () => {
    // Ultra vs Secret differ on name color, agree the art is foiled.
    expect(usefulQuestions(["Ultra Rare", "Secret Rare"])).toEqual({
      name: true,
      artFoiled: false,
      embossed: false,
    });
    // Common vs Super: art is the discriminator (name too: plain vs plain? both plain → no).
    expect(usefulQuestions(["Common", "Super Rare"])).toEqual({
      name: false,
      artFoiled: true,
      embossed: false,
    });
    // The embossed question appears only when an Ultimate is in the mix.
    expect(usefulQuestions(["Ultra Rare", "Ultimate Rare"]).embossed).toBe(true);
  });
});

describe("foilToAnswers", () => {
  it("claims only what one frame can genuinely see", () => {
    expect(foilToAnswers("gold-name")).toEqual({ name: "gold" });
    expect(foilToAnswers("holo-name")).toEqual({ name: "silver" });
    expect(foilToAnswers("holo-art")).toEqual({ artFoiled: true });
    expect(foilToAnswers("rainbow")).toEqual({ artFoiled: true });
    expect(foilToAnswers("matte")).toEqual({}); // no glints may just be bad light
    expect(foilToAnswers(undefined)).toEqual({});
  });
});

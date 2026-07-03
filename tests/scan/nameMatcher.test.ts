import { describe, expect, it } from "vitest";
import {
  extractPasscodes,
  matchCardName,
  matchOcrLines,
  normalizeName,
} from "../../shared/scan/nameMatcher";

const CATALOG = [
  { id: 1, name: "Ash Blossom & Joyous Spring" },
  { id: 2, name: "Effect Veiler" },
  { id: 3, name: "Infinite Impermanence" },
  { id: 4, name: "Blue-Eyes White Dragon" },
  { id: 5, name: "Blue-Eyes Alternative White Dragon" },
  { id: 6, name: "Dark Magician" },
  { id: 7, name: "Snake-Eye Ash" },
];

describe("normalizeName", () => {
  it("strips punctuation, spacing and case", () => {
    expect(normalizeName("Ash Blossom & Joyous Spring")).toBe("ashblossomjoyousspring");
    expect(normalizeName("Blue-Eyes  WHITE   Dragon!")).toBe("blueeyeswhitedragon");
  });
});

describe("matchCardName", () => {
  it("finds an exact match with score 1", () => {
    const [top] = matchCardName("Ash Blossom & Joyous Spring", CATALOG);
    expect(top.id).toBe(1);
    expect(top.score).toBe(1);
  });

  it("tolerates OCR misreads", () => {
    // '&' read as '8', 'l' read as '1'
    const [top] = matchCardName("Ash B1ossom 8 Joyous Spring", CATALOG);
    expect(top.id).toBe(1);
    expect(top.score).toBeGreaterThan(0.8);
  });

  it("prefers the more specific name when both contain the query", () => {
    const results = matchCardName("Blue-Eyes White Dragon", CATALOG);
    expect(results[0].id).toBe(4); // exact beats superstring
  });

  it("handles OCR junk around the name via containment", () => {
    const [top] = matchCardName("xx Dark Magician yy", CATALOG);
    expect(top.id).toBe(6);
    expect(top.score).toBeGreaterThan(0.8);
  });

  it("returns nothing for garbage or too-short input", () => {
    expect(matchCardName("zzqqxxwwvv", CATALOG)).toHaveLength(0);
    expect(matchCardName("ab", CATALOG)).toHaveLength(0);
  });
});

describe("extractPasscodes", () => {
  it("pulls isolated 8-digit passcodes from OCR lines", () => {
    expect(extractPasscodes(["Dark Magician", "ATK/2500 DEF/2100", "46986414"])).toEqual([
      46986414,
    ]);
  });

  it("drops leading zeros so the value matches the numeric card id", () => {
    expect(extractPasscodes(["04031928"])).toEqual([4031928]);
  });

  it("ignores numbers that aren't exactly 8 digits", () => {
    // ATK/DEF, set-code fragments, longer serials
    expect(extractPasscodes(["2500", "123", "1234567890", "LOB-001"])).toEqual([]);
  });

  it("dedupes and reads passcodes embedded in a longer line", () => {
    expect(extractPasscodes(["YGO 89631139 EN", "89631139"])).toEqual([89631139]);
  });
});

describe("matchOcrLines", () => {
  it("picks the card name out of multi-line OCR output", () => {
    const lines = [
      "Ash Blossom & Joyous Sprinq", // name line, slight misread
      "[Zombie/Tuner/Effect]",
      "When a card or effect is activated that includes any of these effects",
    ];
    const [top] = matchOcrLines(lines, CATALOG);
    expect(top.id).toBe(1);
  });

  it("keeps the best score per card across lines", () => {
    const lines = ["Effect Veiler", "Effect Vei1er"];
    const results = matchOcrLines(lines, CATALOG);
    expect(results.filter((r) => r.id === 2)).toHaveLength(1);
    expect(results[0].score).toBe(1);
  });
});

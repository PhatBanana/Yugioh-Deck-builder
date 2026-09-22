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

  it("keeps Japanese, which used to normalize away to nothing", () => {
    // The old ASCII-only rule mapped every CJK name to "", so no Japanese
    // card could ever be matched however cleanly it was read.
    expect(normalizeName("灰流うらら")).toBe("灰流うらら");
    expect(normalizeName("メガリス・フール")).toBe("メガリスフール");
    // The prolonged sound mark carries pronunciation and has to survive; the
    // middle dot is a separator and goes, like the hyphen in "Blue-Eyes".
    expect(normalizeName("サイバー・ドラゴン")).toBe("サイバードラゴン");
    expect(normalizeName("사이버 드래곤")).toBe("사이버드래곤");
  });

  it("folds the full-width Latin that Japanese prints mix in", () => {
    expect(normalizeName("ＡＢＣ－１２３")).toBe(normalizeName("ABC-123"));
    expect(normalizeName("ﾒｶﾞﾘｽ")).toBe(normalizeName("メガリス"));
  });

  it("still drops accents and punctuation from Latin names", () => {
    expect(normalizeName("Phul Megalítico")).toBe("phulmegaltico");
    expect(normalizeName("Dragón de Ojos Azules")).toBe("dragndeojosazules");
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

describe("matchCardName (prefix, for typed search)", () => {
  const pool = [
    { id: 1, name: "Ash Blossom & Joyous Spring" },
    { id: 2, name: "Dark Magician" },
    { id: 3, name: "Dark Magician Girl" },
    { id: 4, name: "Mirrorjade the Iceblade Dragon" },
  ];
  const opts = { minScore: 0.4, prefix: true };

  it("finds a card from a misspelled partial name", () => {
    // The E2E suite caught this: the deck editor's search returned nothing
    // for "Ash Blosom", because the whole-name comparison drops any pair
    // whose lengths differ by more than half.
    expect(matchCardName("Ash Blosom", pool, opts)[0]?.id).toBe(1);
    expect(matchCardName("Mirriorjade", pool, opts)[0]?.id).toBe(4);
  });

  it("still ranks the exact whole name above a longer name it prefixes", () => {
    const [first, second] = matchCardName("Dark Magician", pool, opts);
    expect(first.id).toBe(2);
    expect(second.id).toBe(3);
    expect(first.score).toBeGreaterThan(second.score);
  });

  it("is opt-in: OCR matching of a short fragment is unchanged", () => {
    // A short OCR line against a long name is noise, not a partial name.
    expect(matchCardName("Ash Blosom", pool, { minScore: 0.4 })).toEqual([]);
  });

  it("ignores very short queries", () => {
    expect(matchCardName("Das", pool, opts).every((m) => m.score < 0.9)).toBe(true);
  });
});

describe("matchCardName (Japanese)", () => {
  const jp = [
    { id: 14558127, name: "灰流うらら" },
    { id: 23434538, name: "増殖するG" },
    { id: 46986414, name: "ブラック・マジシャン" },
  ];

  it("matches a Japanese card name read off the card", () => {
    const [top] = matchCardName("ブラック・マジシャン", jp);
    expect(top.id).toBe(46986414);
    expect(top.score).toBe(1);
  });

  it("tolerates a misread kana", () => {
    const [top] = matchCardName("灰流うらち", jp);
    expect(top?.id).toBe(14558127);
  });

  it("does not confuse two unrelated Japanese names", () => {
    const [top] = matchCardName("増殖するG", jp);
    expect(top.id).toBe(23434538);
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

import { describe, expect, it } from "vitest";
import {
  buildJpPrintings,
  buildLangPack,
  buildLimitRegs,
  buildYugipediaIds,
  mapRegulation,
  type YamlYugiCard,
} from "../../shared/datapacks/transform";

// Fixtures mirror the real yaml-yugi aggregate: capitalized regulation words,
// a Speed "Limit 1/2/3" ladder, and NO limit_regulation.master_duel key —
// Master Duel membership is signalled by master_duel_rarity alone.
const cards: YamlYugiCard[] = [
  {
    password: 46986414,
    konami_id: 4041,
    name: { en: "Dark Magician", ja: "ブラック・マジシャン", de: "Dunkler Magier" },
    limit_regulation: { tcg: "Unlimited", ocg: "Unlimited", speed: "Unlimited" },
    master_duel_rarity: "UR",
    yugipedia_page_id: 1132,
  },
  {
    password: 89631139,
    name: { en: "Blue-Eyes White Dragon", de: "Blauäugiger w. Drache" },
    // In the TCG but outside both pool-limited formats.
    limit_regulation: { tcg: "Unlimited", ocg: "Unlimited" },
    yugipedia_page_id: 5321,
  },
  {
    password: 10000,
    name: { en: "MD-only card" },
    limit_regulation: { tcg: "Not yet released", ocg: "Unlimited" },
    master_duel_rarity: "N",
  },
  {
    password: 20000,
    name: { en: "Speed one-of" },
    limit_regulation: { tcg: "Forbidden", ocg: "Forbidden", speed: "Limited 1" },
  },
  {
    password: 30000,
    name: { en: "Speed two-of" },
    limit_regulation: { tcg: "Unlimited", speed: "Limited 2" },
  },
  {
    password: 40000,
    name: { en: "Speed playset" },
    limit_regulation: { tcg: "Unlimited", speed: "Limited 3" },
  },
  { password: null, name: { en: "No password — skipped" }, yugipedia_page_id: 1 },
];

describe("mapRegulation", () => {
  it("maps the standard vocabulary", () => {
    expect(mapRegulation("Forbidden")).toBe("Banned");
    expect(mapRegulation("Limited")).toBe("Limited");
    expect(mapRegulation("Semi-Limited")).toBe("Semi-Limited");
    expect(mapRegulation("Unlimited")).toBeNull();
  });

  it("maps Speed Duel's Limit 1/2/3 ladder onto copy allowances", () => {
    expect(mapRegulation("Limited 1")).toBe("Limited"); // 1 copy
    expect(mapRegulation("Limited 2")).toBe("Semi-Limited"); // 2 copies
    expect(mapRegulation("Limited 3")).toBeNull(); // full playset
  });

  it("fails open on unreleased, unknown and missing values", () => {
    expect(mapRegulation("Not yet released")).toBeNull();
    expect(mapRegulation("mystery-new-word")).toBeNull();
    expect(mapRegulation(null)).toBeNull();
    expect(mapRegulation(undefined)).toBeNull();
  });
});

describe("buildLimitRegs", () => {
  const regs = buildLimitRegs(cards);

  it("marks Master Duel membership from the in-game rarity, with no copy limit", () => {
    // `md` present-but-null: the card is in Master Duel; upstream publishes no
    // MD Forbidden/Limited list, so a limit must never be invented here.
    expect(regs["46986414"]).toEqual({ md: null, speed: null });
    expect(regs["10000"]).toEqual({ md: null });
  });

  it("omits cards that are in neither pool", () => {
    expect(regs["89631139"]).toBeUndefined();
  });

  it("records Speed pool membership and its copy limits", () => {
    expect(regs["20000"]).toEqual({ speed: "Limited" });
    expect(regs["30000"]).toEqual({ speed: "Semi-Limited" });
    // A "Limited 3" card is in the pool with no restriction — the key must
    // still be present, or the deck editor would call it out-of-pool.
    expect(regs["40000"]).toEqual({ speed: null });
    expect("speed" in regs["40000"]).toBe(true);
  });

  it("skips cards without a password", () => {
    expect(Object.values(regs)).toHaveLength(5);
  });

  it("reads a master_duel regulation if upstream ever publishes one", () => {
    const future = buildLimitRegs([
      {
        password: 50000,
        name: { en: "Future MD limited" },
        limit_regulation: { tcg: "Unlimited", master_duel: "Semi-Limited" },
        master_duel_rarity: "SR",
      },
    ]);
    expect(future["50000"]).toEqual({ md: "Semi-Limited" });
  });
});

describe("buildLangPack", () => {
  it("collects only cards with a name in that language", () => {
    const ja = buildLangPack(cards, "ja");
    expect(ja).toEqual({ "46986414": "ブラック・マジシャン" });
    const de = buildLangPack(cards, "de");
    expect(Object.keys(de)).toHaveLength(2);
  });
});

describe("buildYugipediaIds", () => {
  it("maps password to page id, skipping absentees", () => {
    const ids = buildYugipediaIds(cards);
    expect(ids["46986414"]).toBe(1132);
    expect(ids["10000"]).toBeUndefined();
    expect(Object.keys(ids)).toHaveLength(2);
  });
});

describe("buildJpPrintings", () => {
  // Shapes copied from the live yaml-yugi aggregate, including the old
  // region-less set numbers and the multi-rarity entries that make up
  // roughly a fifth of the Japanese printings.
  const cards = [
    {
      password: 46986414,
      sets: {
        ja: [
          { set_number: "SDMY-JP001", set_name: "Structure Deck", rarities: ["Common"] },
          { set_number: "301-016", set_name: "The New Ruler", rarities: ["Ultra Rare", "Secret Rare"] },
        ],
        en: [{ set_number: "LOB-EN005", set_name: "Legend of Blue Eyes", rarities: ["Ultra Rare"] }],
      },
    },
    {
      password: 14558127,
      sets: {
        ja: [
          { set_number: "RC04-JP001", set_name: "Rarity Collection", rarities: ["Quarter Century Secret Rare"] },
        ],
      },
    },
    { password: 999, sets: { en: [{ set_number: "X-EN001", rarities: ["Common"] }] } },
    { password: null, sets: { ja: [{ set_number: "Y-JP001", rarities: ["Common"] }] } },
  ];

  it("indexes Japanese printings by password", () => {
    const pack = buildJpPrintings(cards);
    expect(Object.keys(pack.printings).sort()).toEqual(["14558127", "46986414"]);
  });

  it("emits one row per rarity when a set code has several", () => {
    const { printings, rarities } = buildJpPrintings(cards);
    const rows = printings["46986414"];
    expect(rows).toHaveLength(3);
    const byCode = rows.filter(([code]) => code === "301-016");
    expect(byCode.map(([, r]) => rarities[r]).sort()).toEqual(["Secret Rare", "Ultra Rare"]);
  });

  it("interns rarity names rather than repeating them", () => {
    const pack = buildJpPrintings([...cards, ...cards]);
    // "Common" appears in several entries but is stored once.
    expect(pack.rarities.filter((r) => r === "Common")).toHaveLength(1);
    expect(new Set(pack.rarities).size).toBe(pack.rarities.length);
  });

  it("ignores TCG-only cards and entries with no usable data", () => {
    const pack = buildJpPrintings(cards);
    expect(pack.printings["999"]).toBeUndefined();
    expect(Object.values(pack.printings).flat()).not.toContainEqual(
      expect.arrayContaining(["Y-JP001"])
    );
  });

  it("degrades to no entry on missing/blank fields rather than throwing", () => {
    const pack = buildJpPrintings([
      { password: 1, sets: { ja: [{ set_number: "  ", rarities: ["Common"] }] } },
      { password: 2, sets: { ja: [{ set_number: "A-JP001", rarities: [] }] } },
      { password: 3, sets: { ja: [{ set_number: "B-JP001", rarities: [null, " "] }] } },
      { password: 4, sets: null },
      { password: 5 },
    ] as Parameters<typeof buildJpPrintings>[0]);
    expect(pack.printings).toEqual({});
  });
});

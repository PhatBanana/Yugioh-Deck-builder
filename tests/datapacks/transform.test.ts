import { describe, expect, it } from "vitest";
import {
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

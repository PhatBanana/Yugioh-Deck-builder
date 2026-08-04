import { describe, expect, it } from "vitest";
import {
  buildLangPack,
  buildLimitRegs,
  buildYugipediaIds,
  mapRegulation,
  type YamlYugiCard,
} from "../../shared/datapacks/transform";

const cards: YamlYugiCard[] = [
  {
    password: 46986414,
    konami_id: 4041,
    name: { en: "Dark Magician", ja: "ブラック・マジシャン", de: "Schwarzer Magier" },
    limit_regulation: { tcg: "unlimited", ocg: "unlimited", master_duel: "limited", speed: "unlimited" },
    master_duel_rarity: "UR",
    yugipedia_page_id: 5464,
  },
  {
    password: 89631139,
    name: { en: "Blue-Eyes White Dragon", de: "Blauäugiger w. Drache" },
    limit_regulation: { tcg: "unlimited" }, // not in MD or Speed
    yugipedia_page_id: 5321,
  },
  {
    password: 10000,
    name: { en: "MD-only card" },
    master_duel_rarity: "N", // in MD with no explicit regulation → unlimited
  },
  { password: null, name: { en: "No password — skipped" }, yugipedia_page_id: 1 },
  { password: 20000, name: { en: "Forbidden everywhere" }, limit_regulation: { master_duel: "forbidden", speed: "semi-limited" } },
];

describe("mapRegulation", () => {
  it("maps the known words and fails open on anything else", () => {
    expect(mapRegulation("forbidden")).toBe("Banned");
    expect(mapRegulation("Limited")).toBe("Limited");
    expect(mapRegulation("semi-limited")).toBe("Semi-Limited");
    expect(mapRegulation("unlimited")).toBeNull();
    expect(mapRegulation("mystery-new-word")).toBeNull();
    expect(mapRegulation(undefined)).toBeNull();
  });
});

describe("buildLimitRegs", () => {
  const regs = buildLimitRegs(cards);

  it("keys by password and records format membership", () => {
    expect(regs["46986414"]).toEqual({ md: "Limited", speed: null });
  });

  it("omits formats a card isn't in (Speed pool membership matters)", () => {
    expect(regs["89631139"]).toBeUndefined(); // in neither MD nor Speed
    expect(regs["10000"]).toEqual({ md: null }); // MD via rarity, no speed key
  });

  it("maps forbidden/semi-limited", () => {
    expect(regs["20000"]).toEqual({ md: "Banned", speed: "Semi-Limited" });
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
    expect(ids["46986414"]).toBe(5464);
    expect(ids["10000"]).toBeUndefined();
    expect(Object.keys(ids)).toHaveLength(2);
  });
});

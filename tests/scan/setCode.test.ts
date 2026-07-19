import { describe, expect, it } from "vitest";
import {
  canonSetCode,
  detectEdition,
  extractSetCode,
  matchPrinting,
  rarityAbbrev,
  type PrintingRef,
} from "../../shared/scan/setCode";

describe("canonSetCode", () => {
  it("collapses region and zero-padding to one key", () => {
    const key = "SDCB-1";
    expect(canonSetCode("SDCB-EN001")).toBe(key);
    expect(canonSetCode("SDCB-001")).toBe(key);
    expect(canonSetCode("SDCB-EN1")).toBe(key);
    expect(canonSetCode("sdcb-fr001")).toBe(key);
  });

  it("keeps a letter that prefixes the card number", () => {
    expect(canonSetCode("YGLD-ENC01")).toBe("YGLD-C1");
    expect(canonSetCode("YGLD-ENC02")).not.toBe(canonSetCode("YGLD-ENC01"));
  });

  it("does not treat a real number prefix as a region", () => {
    expect(canonSetCode("MP23-EN123")).toBe("MP23-123");
  });
});

describe("extractSetCode", () => {
  it("reads a region-coded set code", () => {
    expect(extractSetCode(["Dark Magician", "SDCB-EN001", "89631139"])).toBe("SDCB-EN001");
  });

  it("tolerates spaces the OCR inserts around the hyphen", () => {
    expect(extractSetCode(["LOB - EN005"])).toBe("LOB-EN005");
    expect(extractSetCode(["LOB -EN005"])).toBe("LOB-EN005");
  });

  it("ignores hyphenated card names (no digit in the suffix)", () => {
    expect(extractSetCode(["BLUE-EYES WHITE DRAGON"])).toBeNull();
    expect(extractSetCode(["XYZ-DRAGON CANNON"])).toBeNull();
  });

  it("returns null when there is no set code", () => {
    expect(extractSetCode(["Just some effect text", "ATK/3000 DEF/2500"])).toBeNull();
  });
});

describe("detectEdition", () => {
  it("detects 1st Edition, including the common OCR misread", () => {
    expect(detectEdition(["1st Edition"])).toBe("1st Edition");
    expect(detectEdition(["IST EDITION"])).toBe("1st Edition");
    expect(detectEdition(["First Edition"])).toBe("1st Edition");
  });

  it("detects Limited Edition", () => {
    expect(detectEdition(["LIMITED EDITION"])).toBe("Limited Edition");
  });

  it("returns undefined for unmarked (unlimited) copies", () => {
    expect(detectEdition(["Dark Magician", "SDCB-EN001"])).toBeUndefined();
  });
});

describe("rarityAbbrev", () => {
  it("uses the known shorthand", () => {
    expect(rarityAbbrev("Secret Rare")).toBe("ScR");
    expect(rarityAbbrev("Ultra Rare")).toBe("UR");
    expect(rarityAbbrev("Starlight Rare")).toBe("StR");
    expect(rarityAbbrev("Common")).toBe("C");
  });

  it("falls back to word initials for unknown rarities", () => {
    expect(rarityAbbrev("Mosaic Rare")).toBe("MR");
  });
});

describe("matchPrinting", () => {
  const printings: PrintingRef[] = [
    { code: "LOB-EN005", rarity: "Ultra Rare" },
    { code: "SDY-006", rarity: "Common" },
    { code: "SKE-005", rarity: "Common" },
    { code: "MP23-EN123", rarity: "Secret Rare" },
  ];

  it("matches on the region-stripped, zero-padded code", () => {
    expect(matchPrinting("LOB-EN005", printings)?.rarity).toBe("Ultra Rare");
    expect(matchPrinting("LOB-005", printings)?.rarity).toBe("Ultra Rare");
    expect(matchPrinting("MP23-EN123", printings)?.rarity).toBe("Secret Rare");
  });

  it("returns null when nothing matches", () => {
    expect(matchPrinting("ZZZ-EN999", printings)).toBeNull();
    expect(matchPrinting(null, printings)).toBeNull();
    expect(matchPrinting("LOB-EN005", [])).toBeNull();
  });

  it("prefers an exact region hit when one code carries two rarities", () => {
    const dual: PrintingRef[] = [
      { code: "GFTP-EN001", rarity: "Ghost Rare" },
      { code: "GFTP-DE001", rarity: "Secret Rare" },
    ];
    // Region matches DE exactly -> pick that one, not the ambiguous canon.
    expect(matchPrinting("GFTP-DE001", dual)?.rarity).toBe("Secret Rare");
  });

  it("gives up on an ambiguous code with no exact region hit", () => {
    const dual: PrintingRef[] = [
      { code: "GFTP-EN001", rarity: "Ghost Rare" },
      { code: "GFTP-DE001", rarity: "Secret Rare" },
    ];
    // Region "FR" matches neither exactly but both by canon -> ambiguous.
    expect(matchPrinting("GFTP-FR001", dual)).toBeNull();
  });
});

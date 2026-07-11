import { describe, expect, it } from "vitest";
import { matchesQuery, queryTokens } from "../../shared/search/textMatch";

describe("queryTokens", () => {
  it("lowercases and splits on whitespace", () => {
    expect(queryTokens("Branded  Despia")).toEqual(["branded", "despia"]);
  });

  it("returns nothing for blank input", () => {
    expect(queryTokens("   ")).toEqual([]);
  });
});

describe("matchesQuery", () => {
  it("is case-insensitive", () => {
    expect(matchesQuery("Branded Despia", "BRANDED")).toBe(true);
    expect(matchesQuery("BRANDED DESPIA", "branded")).toBe(true);
  });

  it("ignores word order", () => {
    expect(matchesQuery("Despia Branded", "branded despia")).toBe(true);
    expect(matchesQuery("Branded Despia", "despia branded")).toBe(true);
  });

  it("matches partial words", () => {
    expect(matchesQuery("Blue-Eyes White Dragon", "blue eyes drag")).toBe(true);
  });

  it("requires every token", () => {
    expect(matchesQuery("Branded Despia", "branded fire")).toBe(false);
  });

  it("matches everything on an empty query", () => {
    expect(matchesQuery("anything", "")).toBe(true);
  });

  it("accepts pre-tokenized queries", () => {
    expect(matchesQuery("Despia Branded", ["branded", "despia"])).toBe(true);
  });
});

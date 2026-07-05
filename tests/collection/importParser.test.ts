import { describe, expect, it } from "vitest";
import { parseImportText } from "../../shared/collection/importParser";

describe("parseImportText", () => {
  it("parses '3x Name' and '3 Name' and 'Name x3' formats", () => {
    const entries = parseImportText(
      "3x Ash Blossom & Joyous Spring\n2 Effect Veiler\nInfinite Impermanence x3"
    );
    expect(entries).toEqual([
      { raw: "3x Ash Blossom & Joyous Spring", name: "Ash Blossom & Joyous Spring", quantity: 3 },
      { raw: "2 Effect Veiler", name: "Effect Veiler", quantity: 2 },
      { raw: "Infinite Impermanence x3", name: "Infinite Impermanence", quantity: 3 },
    ]);
  });

  it("treats a bare line as quantity 1", () => {
    expect(parseImportText("Pot of Prosperity")).toEqual([
      { raw: "Pot of Prosperity", name: "Pot of Prosperity", quantity: 1 },
    ]);
  });

  it("parses .ydk numeric ids, skipping section markers, and aggregates copies", () => {
    const ydk = "#created by tool\n#main\n14558127\n14558127\n14558127\n23434538\n!side\n23434538";
    const entries = parseImportText(ydk);
    expect(entries).toEqual([
      { raw: "14558127", cardId: 14558127, quantity: 3 },
      { raw: "23434538", cardId: 23434538, quantity: 2 },
    ]);
  });

  it("aggregates duplicate names case-insensitively", () => {
    const entries = parseImportText("2 Effect Veiler\n1 effect veiler");
    expect(entries).toHaveLength(1);
    expect(entries[0].quantity).toBe(3);
  });

  it("parses a JSON backup (array and {cards} wrapper)", () => {
    const arr = parseImportText('[{"name":"Effect Veiler","quantity":2}]');
    expect(arr).toEqual([
      { raw: '{"name":"Effect Veiler","quantity":2}', name: "Effect Veiler", quantity: 2 },
    ]);
    const wrapped = parseImportText('{"cards":[{"cardId":97268402,"quantity":1}]}');
    expect(wrapped).toEqual([
      { raw: '{"cardId":97268402,"quantity":1}', cardId: 97268402, quantity: 1 },
    ]);
  });

  it("ignores blank lines and caps quantities at 99", () => {
    const entries = parseImportText("\n\n60 Effect Veiler\n60 Effect Veiler\n");
    expect(entries).toEqual([
      { raw: "60 Effect Veiler", name: "Effect Veiler", quantity: 99 },
    ]);
  });

  it("returns empty for empty input", () => {
    expect(parseImportText("   \n  ")).toEqual([]);
  });
});

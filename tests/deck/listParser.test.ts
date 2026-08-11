import { describe, expect, it } from "vitest";
import { parseDeckList } from "../../shared/deck/listParser";

// A real pasted list (typos and all) — the exact shape this parser exists for.
const BRANDED = `Branded Deck

Monsters
3 Keeper of Dragon Magic
3 Fallen of Albaz
2 Blazing Cartesia the Virtuous
1 Despia Dramaturgy

Spell Cards
2 Branded Fusion
1 Ultimate Slayer

Trap Cards
1 Branded Expulsion
2 Judgment of the Branded

Extra Deck
1 Albion the Branded Dragon
2 Granquignol the Dusk Dragon
`;

describe("parseDeckList", () => {
  it("reads the title, sections and quantities from a real list", () => {
    const p = parseDeckList(BRANDED);
    expect(p.name).toBe("Branded Deck");
    expect(p.sawSections).toBe(true);

    const main = p.lines.filter((l) => l.section === "main");
    const extra = p.lines.filter((l) => l.section === "extra");
    // Monsters + Spells + Traps all land in main.
    expect(main.map((l) => l.name)).toEqual([
      "Keeper of Dragon Magic",
      "Fallen of Albaz",
      "Blazing Cartesia the Virtuous",
      "Despia Dramaturgy",
      "Branded Fusion",
      "Ultimate Slayer",
      "Branded Expulsion",
      "Judgment of the Branded",
    ]);
    expect(extra.map((l) => `${l.quantity} ${l.name}`)).toEqual([
      "1 Albion the Branded Dragon",
      "2 Granquignol the Dusk Dragon",
    ]);
    expect(main.find((l) => l.name === "Keeper of Dragon Magic")?.quantity).toBe(3);
  });

  it("accepts every quantity spelling and defaults bare names to 1", () => {
    const p = parseDeckList("Main Deck\n3 Alpha\n2x Beta\nGamma x2\nDelta");
    expect(p.lines.map((l) => `${l.quantity} ${l.name}`)).toEqual([
      "3 Alpha",
      "2 Beta",
      "2 Gamma",
      "1 Delta",
    ]);
  });

  it("tolerates header decorations: colons, counts, case", () => {
    const p = parseDeckList("MONSTERS:\n1 A\nspell cards (10)\n1 B\nSide Deck: 15\n1 C");
    expect(p.lines.map((l) => l.section)).toEqual(["main", "main", "side"]);
  });

  it("takes a bare first line as the title, but not once cards started", () => {
    const withTitle = parseDeckList("My Cool Deck\n3 Alpha");
    expect(withTitle.name).toBe("My Cool Deck");
    expect(withTitle.lines).toHaveLength(1);

    // Starting straight with cards: the bare line is a 1-of card, not a title.
    const noTitle = parseDeckList("3 Alpha\nBeta");
    expect(noTitle.name).toBeNull();
    expect(noTitle.lines.map((l) => l.name)).toEqual(["Alpha", "Beta"]);
  });

  it("aggregates duplicate names in a section and caps at 3 copies", () => {
    const p = parseDeckList("2 Alpha\n2 Alpha");
    expect(p.lines).toHaveLength(1);
    expect(p.lines[0].quantity).toBe(3);
  });

  it("flags flat lists so the importer can infer extra-deck cards by type", () => {
    expect(parseDeckList("3 Alpha\n1 Beta").sawSections).toBe(false);
  });

  it("returns nothing for empty input", () => {
    expect(parseDeckList("").lines).toEqual([]);
    expect(parseDeckList("").name).toBeNull();
  });
});

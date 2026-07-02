import { describe, expect, it } from "vitest";
import {
  extractDeckName,
  extractDeckSlugs,
  isKeyCardFor,
  parseDeckSection,
} from "../../shared/metaDecks/parseHtml";

describe("extractDeckSlugs", () => {
  it("collects unique deck slugs from category page links", () => {
    const html = `
      <a href="/deck/kewl-tune-719281">x</a>
      <a href="/deck/sky-striker-101">y</a>
      <a href="/deck/kewl-tune-719281">dup</a>`;
    expect(extractDeckSlugs(html)).toEqual(["kewl-tune-719281", "sky-striker-101"]);
  });
});

describe("extractDeckName", () => {
  it("reads the h1 title", () => {
    expect(extractDeckName('<h1 class="t">Kewl Tune</h1>')).toBe("Kewl Tune");
    expect(extractDeckName("<div>no title</div>")).toBeNull();
  });
});

describe("parseDeckSection", () => {
  it("counts card links per section, stopping at the next section", () => {
    const html = `
      <div id="main_deck">
        <a href="/card/?search=111">a</a>
        <a href="/card/?search=111">a</a>
        <a href="/card/?search=222">b</a>
      </div>
      <div class="deck-output" id="extra_deck">
        <a href="/card/?search=333">c</a>
      </div>`;
    expect(parseDeckSection(html, "main_deck")).toEqual([
      { cardId: 111, quantity: 2 },
      { cardId: 222, quantity: 1 },
    ]);
    expect(parseDeckSection(html, "extra_deck")).toEqual([{ cardId: 333, quantity: 1 }]);
    expect(parseDeckSection(html, "side_deck")).toEqual([]);
  });
});

describe("isKeyCardFor", () => {
  it("matches archetype and deck name in either direction", () => {
    expect(isKeyCardFor("Kewl Tune Control", "Kewl Tune")).toBe(true);
    expect(isKeyCardFor("Sky Striker", "Sky Striker Ace")).toBe(true);
    expect(isKeyCardFor("Kewl Tune", null)).toBe(false);
    expect(isKeyCardFor("Kewl Tune", "Blue-Eyes")).toBe(false);
  });
});

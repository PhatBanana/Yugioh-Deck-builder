import { describe, expect, it } from "vitest";
import {
  chanceOfNone,
  chanceToDraw,
  chanceToOpenAny,
  combination,
  hypergeometricPmf,
} from "../../shared/deck/probability";

describe("combination", () => {
  it("computes known binomials", () => {
    expect(combination(40, 5)).toBe(658008);
    expect(combination(5, 2)).toBe(10);
    expect(combination(60, 6)).toBe(50063860);
  });

  it("is symmetric and handles edges", () => {
    expect(combination(40, 35)).toBeCloseTo(combination(40, 5), 6);
    expect(combination(5, 0)).toBe(1);
    expect(combination(3, 5)).toBe(0); // k > n
    expect(combination(4, -1)).toBe(0);
  });
});

describe("hypergeometricPmf", () => {
  it("matches a hand-computed value", () => {
    // P(exactly 2 of a 3-of in a 5-card hand from 40) = C(3,2)C(37,3)/C(40,5)
    expect(hypergeometricPmf(40, 3, 5, 2)).toBeCloseTo(23310 / 658008, 10);
  });

  it("sums to 1 across all k", () => {
    let sum = 0;
    for (let k = 0; k <= 3; k++) sum += hypergeometricPmf(40, 3, 5, k);
    expect(sum).toBeCloseTo(1, 10);
  });
});

describe("chanceToDraw", () => {
  it("gives the classic ~33.8% to open a 3-of (deck 40, hand 5)", () => {
    expect(chanceToDraw(40, 3, 5, 1)).toBeCloseTo(0.3375506, 6);
  });

  it("drawing an extra card (going second) raises the odds", () => {
    expect(chanceToDraw(40, 3, 6, 1)).toBeGreaterThan(chanceToDraw(40, 3, 5, 1));
  });

  it("needing 2 copies is much rarer than needing 1", () => {
    expect(chanceToDraw(40, 3, 5, 2)).toBeCloseTo(0.036437, 5);
  });

  it("needing 0 is certain; impossible asks are 0", () => {
    expect(chanceToDraw(40, 3, 5, 0)).toBe(1);
    expect(chanceToDraw(40, 1, 5, 2)).toBe(0); // can't draw 2 of a 1-of
  });
});

describe("chanceOfNone", () => {
  it("is the complement of drawing at least one", () => {
    expect(chanceOfNone(40, 3, 5)).toBeCloseTo(1 - chanceToDraw(40, 3, 5, 1), 10);
  });
});

describe("chanceToOpenAny", () => {
  it("treats a group's copies as one success pool", () => {
    // Two 3-ofs = 6 starter copies in 40, hand 5: 1 - C(34,5)/C(40,5)
    expect(chanceToOpenAny(40, 6, 5)).toBeCloseTo(1 - 278256 / 658008, 10);
  });

  it("is 0 with no starters and rises with more copies", () => {
    expect(chanceToOpenAny(40, 0, 5)).toBe(0);
    expect(chanceToOpenAny(40, 9, 5)).toBeGreaterThan(chanceToOpenAny(40, 3, 5));
  });
});

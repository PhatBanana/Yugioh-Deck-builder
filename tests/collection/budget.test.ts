import { describe, expect, it } from "vitest";
import { planBudget } from "../../shared/collection/budget";

describe("planBudget", () => {
  const items = [
    { id: 1, price: 1 },
    { id: 2, price: 2 },
    { id: 3, price: 3 },
    { id: 4, price: 10 },
  ];

  it("buys cheapest-first to fit the budget, maximizing count", () => {
    const plan = planBudget(items, 6);
    expect(plan.affordableIds).toEqual([1, 2, 3]); // 1+2+3 = 6, the $10 doesn't fit
    expect(plan.spent).toBe(6);
    expect(plan.remaining).toBe(0);
  });

  it("reports the full total and item counts", () => {
    const plan = planBudget(items, 100);
    expect(plan.total).toBe(16);
    expect(plan.totalCount).toBe(4);
    expect(plan.affordableIds).toHaveLength(4);
    expect(plan.remaining).toBe(84);
  });

  it("excludes unpriced items from cost but counts them", () => {
    const plan = planBudget([{ id: 1, price: 5 }, { id: 2, price: 0 }], 10);
    expect(plan.total).toBe(5);
    expect(plan.unpricedCount).toBe(1);
    expect(plan.totalCount).toBe(2);
    expect(plan.affordableIds).toEqual([1]);
  });

  it("affords nothing with a zero budget", () => {
    const plan = planBudget(items, 0);
    expect(plan.affordableIds).toEqual([]);
    expect(plan.spent).toBe(0);
  });
});

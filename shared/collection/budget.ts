// Wishlist budget planning: given priced wishlist items and a budget, work out
// what you can complete. Buying the cheapest cards first maximizes how many
// distinct wants you can knock out for a fixed spend. Pure and unit-tested.

export interface BudgetItem {
  id: number;
  price: number; // USD; items with price <= 0 are treated as unpriced
}

export interface BudgetPlan {
  total: number; // total price of all priced items
  totalCount: number; // every item passed in
  unpricedCount: number; // items with no known price
  affordableIds: number[]; // cheapest-first selection that fits the budget
  spent: number; // sum of the affordable selection
  remaining: number; // budget - spent (never negative)
}

export function planBudget(items: BudgetItem[], budget: number): BudgetPlan {
  const priced = items.filter((i) => i.price > 0);
  const total = priced.reduce((s, i) => s + i.price, 0);
  const affordableIds: number[] = [];
  let spent = 0;
  // Cheapest first — optimal for maximizing the count bought within budget.
  for (const it of [...priced].sort((a, b) => a.price - b.price)) {
    if (spent + it.price <= budget) {
      affordableIds.push(it.id);
      spent += it.price;
    }
  }
  return {
    total,
    totalCount: items.length,
    unpricedCount: items.length - priced.length,
    affordableIds,
    spent,
    remaining: Math.max(0, budget - spent),
  };
}

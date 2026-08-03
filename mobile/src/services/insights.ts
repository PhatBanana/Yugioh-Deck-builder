import { valueEntry } from "@shared/collection/value";
import { groupValue, topBy, type ValueGroup } from "@shared/collection/insights";
import { db } from "../db";
import { loadPrintingPrices, printingPriceKey } from "./rarity";

// "Where does my collection's value sit?" — top cards, and value split by
// archetype and by card type. Built from the same per-printing valuation the
// collection-value total uses, so the numbers reconcile.

export interface ValuedCard {
  cardId: number;
  name: string;
  img: string | null;
  quantity: number;
  value: number; // total value of the owned copies
}

export interface CollectionInsights {
  totalValue: number;
  totalCopies: number;
  topCards: ValuedCard[]; // most valuable owned cards
  byArchetype: ValueGroup[];
  byType: ValueGroup[]; // Monsters / Spells / Traps
  avgCardValue: number; // value per copy
}

function typeBucket(type: string): string | null {
  if (type.includes("Monster")) return "Monsters";
  if (type.includes("Spell")) return "Spells";
  if (type.includes("Trap")) return "Traps";
  return null;
}

export async function getCollectionInsights(topN = 8): Promise<CollectionInsights> {
  const entries = (await db.collection.toArray()).filter((e) => e.quantity > 0);
  const cards = await db.cards.bulkGet(entries.map((e) => e.cardId));
  const priceMap = await loadPrintingPrices(entries.flatMap((e) => e.copies ?? []));
  const priceOf = (code?: string, rarity?: string): number | null => {
    const key = printingPriceKey(code, rarity);
    return key ? priceMap.get(key) ?? null : null;
  };

  const valued = entries.map((e, i) => {
    const c = cards[i];
    return {
      cardId: e.cardId,
      name: c?.name ?? `#${e.cardId}`,
      img: c?.img ?? null,
      quantity: e.quantity,
      value: valueEntry(e.quantity, e.copies, c?.price ?? null, priceOf),
      archetype: c?.archetype ?? null,
      type: c?.type ?? "",
    };
  });

  const totalCopies = valued.reduce((n, v) => n + v.quantity, 0);
  const totalValue = valued.reduce((n, v) => n + v.value, 0);

  return {
    totalValue,
    totalCopies,
    topCards: topBy(valued, (v) => v.value, topN).filter((v) => v.value > 0),
    byArchetype: groupValue(valued, (v) => v.archetype, (v) => v.value).filter((g) => g.value > 0),
    byType: groupValue(valued, (v) => typeBucket(v.type), (v) => v.value),
    avgCardValue: totalCopies > 0 ? totalValue / totalCopies : 0,
  };
}

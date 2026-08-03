import { useEffect, useState } from "react";
import { removeOwnedWithSnapshot, restoreEntries, setOwnedQuantity } from "../services/collection";
import { toast } from "./Toaster";

// The UI copy limit is the same as the deck-legality copy limit.
export { maxCopies as stepperMax } from "@shared/deck/types";

export default function QuantityStepper({
  cardId,
  quantity,
  max = 3,
  onChange,
}: {
  cardId: number;
  quantity: number;
  max?: number;
  onChange?: (q: number) => void;
}) {
  const [value, setValue] = useState(quantity);
  useEffect(() => setValue(quantity), [quantity, cardId]);

  async function persist(next: number) {
    const prev = value;
    setValue(next);
    onChange?.(next);
    try {
      // Removing the last copy is easy to do by accident — snapshot the whole
      // entry first so Undo brings back printings/binders/condition/art, not
      // just the count.
      if (next === 0 && prev > 0) {
        const snapshot = await removeOwnedWithSnapshot(cardId);
        toast("Removed from collection", "info", {
          label: "Undo",
          onClick: () => {
            setValue(prev);
            onChange?.(prev);
            if (snapshot) void restoreEntries([snapshot]);
            else void setOwnedQuantity(cardId, prev);
          },
        });
      } else {
        await setOwnedQuantity(cardId, next);
      }
    } catch {
      setValue(prev);
      onChange?.(prev);
      toast("Failed to save quantity", "error");
    }
  }

  const btn =
    "pressable w-9 h-9 flex items-center justify-center rounded-lg bg-raised border border-line active:bg-overlay disabled:opacity-30 disabled:active:scale-100 text-lg";

  return (
    <div className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
      <button type="button" disabled={value <= 0} onClick={() => persist(Math.max(0, value - 1))} className={btn}>
        −
      </button>
      <span className="w-5 text-center tabular-nums">{value}</span>
      <button type="button" disabled={value >= max} onClick={() => persist(Math.min(max, value + 1))} className={btn}>
        +
      </button>
    </div>
  );
}

import { useEffect, useState } from "react";
import { setOwnedQuantity } from "../services/collection";
import { toast } from "./Toaster";

export function stepperMax(banlist: string | null): number {
  switch (banlist) {
    case "Banned":
      return 0;
    case "Limited":
      return 1;
    case "Semi-Limited":
      return 2;
    default:
      return 3;
  }
}

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
      await setOwnedQuantity(cardId, next);
    } catch {
      setValue(prev);
      onChange?.(prev);
      toast("Failed to save quantity", "error");
    }
  }

  const btn =
    "w-9 h-9 flex items-center justify-center rounded-lg bg-neutral-800 active:bg-neutral-700 disabled:opacity-30 text-lg";

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

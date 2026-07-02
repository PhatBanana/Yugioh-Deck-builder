"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "./Toaster";

interface QuantityStepperProps {
  cardId: number;
  initialQuantity: number;
  max?: number;
  onChange?: (quantity: number) => void;
}

export default function QuantityStepper({
  cardId,
  initialQuantity,
  max = 3,
  onChange,
}: QuantityStepperProps) {
  const [quantity, setQuantity] = useState(initialQuantity);
  const lastConfirmed = useRef(initialQuantity);
  const [isPending, startTransition] = useTransition();

  function persist(next: number) {
    setQuantity(next);
    onChange?.(next);
    startTransition(async () => {
      try {
        const res = await fetch("/api/collection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId, quantity: next }),
        });
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
        lastConfirmed.current = next;
      } catch {
        setQuantity(lastConfirmed.current);
        onChange?.(lastConfirmed.current);
        toast("Failed to save quantity — reverted.", "error");
      }
    });
  }

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={quantity <= 0 || isPending}
        onClick={() => persist(Math.max(0, quantity - 1))}
        className="w-6 h-6 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-sm"
      >
        −
      </button>
      <span className="w-5 text-center text-sm tabular-nums">{quantity}</span>
      <button
        type="button"
        disabled={quantity >= max || isPending}
        onClick={() => persist(Math.min(max, quantity + 1))}
        className="w-6 h-6 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-sm"
      >
        +
      </button>
    </div>
  );
}

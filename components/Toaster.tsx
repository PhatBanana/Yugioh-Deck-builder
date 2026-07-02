"use client";

import { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

type Listener = (toast: Toast) => void;

let nextId = 1;
const listeners = new Set<Listener>();

export function toast(message: string, type: ToastType = "info") {
  const t: Toast = { id: nextId++, message, type };
  for (const listener of listeners) listener(t);
}

const TYPE_STYLES: Record<ToastType, string> = {
  success: "border-emerald-700 bg-emerald-950/90 text-emerald-100",
  error: "border-red-700 bg-red-950/90 text-red-100",
  info: "border-neutral-700 bg-neutral-900/90 text-neutral-100",
};

export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const listener: Listener = (t) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 4000);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-lg border px-4 py-2.5 text-sm shadow-lg backdrop-blur ${TYPE_STYLES[t.type]}`}
          role="status"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

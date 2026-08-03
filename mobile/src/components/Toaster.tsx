import { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

type Listener = (toast: Toast) => void;

let nextId = 1;
const listeners = new Set<Listener>();

export function toast(message: string, type: ToastType = "info", action?: ToastAction) {
  const t: Toast = { id: nextId++, message, type, action };
  for (const listener of listeners) listener(t);
}

const TYPE_STYLES: Record<ToastType, string> = {
  success: "border-emerald-800/70 bg-emerald-950/90 text-emerald-100",
  error: "border-red-800/70 bg-red-950/90 text-red-100",
  info: "border-line-strong bg-surface/90 text-neutral-100",
};

export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const listener: Listener = (t) => {
      setToasts((prev) => [...prev, t]);
      // Actionable toasts linger a little longer so there's time to tap Undo.
      const ttl = t.action ? 5500 : 3500;
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), ttl);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((x) => x.id !== id));

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast-in flex items-center gap-3 rounded-xl border px-4 py-2 text-sm shadow-lg shadow-black/40 backdrop-blur-md ${TYPE_STYLES[t.type]}`}
          role="status"
        >
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action?.onClick();
                dismiss(t.id);
              }}
              className="pointer-events-auto shrink-0 font-semibold uppercase tracking-wide text-amber-300 active:text-amber-200"
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

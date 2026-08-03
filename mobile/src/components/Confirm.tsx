import { useEffect, useState } from "react";
import { useBackClose } from "../hooks/useBackClose";

// Imperative confirm dialog: `await confirmDialog({...})` resolves true/false.
// Mirrors the Toaster pub/sub pattern so any code can prompt without threading
// props. Mount <ConfirmHost/> once near the app root.

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean; // red confirm button for destructive actions
}

type Pending = ConfirmOptions & { id: number; resolve: (ok: boolean) => void };

let listener: ((p: Pending) => void) | null = null;
let nextId = 1;

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (listener) listener({ ...options, id: nextId++, resolve });
    else resolve(false); // host not mounted — treat as cancelled
  });
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => {
    listener = setPending;
    return () => {
      listener = null;
    };
  }, []);

  if (!pending) return null;
  return (
    <ConfirmView
      key={pending.id}
      pending={pending}
      onClose={(ok) => {
        pending.resolve(ok);
        setPending(null);
      }}
    />
  );
}

function ConfirmView({ pending, onClose }: { pending: Pending; onClose: (ok: boolean) => void }) {
  useBackClose(() => onClose(false));
  return (
    <div
      className="sheet-backdrop z-[90] flex items-center justify-center p-6"
      onClick={() => onClose(false)}
    >
      <div
        className="panel w-full max-w-sm rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{pending.title}</h2>
        {pending.message && <p className="text-sm text-neutral-400 mt-1.5">{pending.message}</p>}
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="flex-1 py-2.5 rounded-lg bg-raised active:bg-overlay text-sm"
          >
            {pending.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            onClick={() => onClose(true)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${
              pending.danger ? "bg-red-600 text-white active:bg-red-700" : "btn-primary"
            }`}
          >
            {pending.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

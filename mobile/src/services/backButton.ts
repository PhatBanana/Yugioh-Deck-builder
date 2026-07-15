import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

// Android hardware/gesture back handling: a stack of close handlers so the
// back button dismisses the top-most popup (modal, sheet, sub-view) instead
// of minimizing the app. Only when nothing is open does back minimize.

type BackHandler = () => void;
const stack: BackHandler[] = [];

// Registers a handler and returns its unregister function. The most recently
// registered open thing is the one back closes.
export function pushBackHandler(handler: BackHandler): () => void {
  stack.push(handler);
  return () => {
    const i = stack.lastIndexOf(handler);
    if (i !== -1) stack.splice(i, 1);
  };
}

export function initBackButton(): void {
  if (!Capacitor.isNativePlatform()) return;
  void App.addListener("backButton", () => {
    const top = stack[stack.length - 1];
    if (top) top();
    else void App.minimizeApp();
  });
}

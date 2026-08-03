// A tiny haptic tick, best-effort. Uses the Web Vibration API, which Android's
// WebView supports; a no-op where it isn't (browsers, iOS). Kept short so a
// scan session's confirmations feel like taps, not buzzes.
export function buzz(ms = 15): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Unsupported / blocked — silent.
  }
}

import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { decodeDeckCode, encodeDeckCode } from "@shared/deck/shareCode";
import type { MDeck } from "../db";
import { saveDeckFromYdk } from "./decks";

// Builds a shareable code for a deck and hands it off: on Android the system
// share sheet (with the code as text); on web, copied to the clipboard.
// Returns how the code was delivered so the UI can confirm appropriately.
export async function shareDeck(deck: MDeck): Promise<"shared" | "copied" | "failed"> {
  const code = encodeDeckCode(deck.name, deck.cards);
  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({
        title: deck.name,
        text: code,
        dialogTitle: `Share "${deck.name}"`,
      });
      return "shared";
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      return /cancel/i.test(msg) ? "shared" : "failed"; // dismissed ≠ failed
    }
  }
  try {
    await navigator.clipboard.writeText(code);
    return "copied";
  } catch {
    return "failed";
  }
}

// Imports a deck from a pasted code, saving it as a new deck. Returns the new
// deck, or null if the code was invalid.
export async function importDeckCode(code: string): Promise<MDeck | null> {
  const decoded = decodeDeckCode(code);
  if (!decoded) return null;
  return saveDeckFromYdk(decoded.name, decoded.cards);
}

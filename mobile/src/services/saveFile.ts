import { registerPlugin } from "@capacitor/core";

// Bridge to the tiny local SaveFilePlugin (Android): the system "Save as…"
// dialog via ACTION_CREATE_DOCUMENT. The user picks where the file goes
// (Downloads, Drive, anywhere) and gets an actual saved file — unlike the
// share sheet, which reads as "send this somewhere".
// Text-only by design: every export today is JSON/CSV, and binary writes
// (the deck image) go through Filesystem+Share. Add a base64 mode when a
// binary caller actually exists — not before.
export interface SaveFileOptions {
  fileName: string;
  mimeType: string;
  text: string; // UTF-8 content
}

interface SaveFilePluginApi {
  save(options: SaveFileOptions): Promise<{ saved: boolean }>;
}

export const SaveFile = registerPlugin<SaveFilePluginApi>("SaveFile");

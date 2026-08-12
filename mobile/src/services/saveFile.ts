import { registerPlugin } from "@capacitor/core";

// Bridge to the tiny local SaveFilePlugin (Android): the system "Save as…"
// dialog via ACTION_CREATE_DOCUMENT. The user picks where the file goes
// (Downloads, Drive, anywhere) and gets an actual saved file — unlike the
// share sheet, which reads as "send this somewhere".
export interface SaveFileOptions {
  fileName: string;
  mimeType: string;
  text?: string; // UTF-8 text content…
  base64?: string; // …or binary as base64 (exactly one required)
}

interface SaveFilePluginApi {
  save(options: SaveFileOptions): Promise<{ saved: boolean }>;
}

export const SaveFile = registerPlugin<SaveFilePluginApi>("SaveFile");

import { Capacitor, registerPlugin } from "@capacitor/core";

// Bridge to the native on-device Gemini Nano plugin (ML Kit GenAI Prompt API).
// Experimental — only present on Android; a no-op elsewhere.

export type NanoStatus =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable"
  | "unsupported";

interface GeminiNanoPlugin {
  checkAvailability(): Promise<{ status: NanoStatus; error?: string }>;
  download(): Promise<{ done: boolean }>;
  askAboutImage(options: { image: string; prompt: string }): Promise<{
    status: NanoStatus;
    text?: string;
    ms?: number;
  }>;
}

const GeminiNano = registerPlugin<GeminiNanoPlugin>("GeminiNano");

export function nanoSupported(): boolean {
  return Capacitor.isNativePlatform();
}

export async function nanoAvailability(): Promise<NanoStatus> {
  return (await nanoAvailabilityDetail()).status;
}

// Full detail incl. any native error message, so the lab can show *why* the
// model is unavailable (missing AICore, unsupported device, etc.).
export async function nanoAvailabilityDetail(): Promise<{ status: NanoStatus; error?: string }> {
  if (!nanoSupported()) return { status: "unsupported" };
  try {
    return await GeminiNano.checkAvailability();
  } catch (e) {
    return { status: "unavailable", error: e instanceof Error ? e.message : String(e) };
  }
}

export async function nanoDownload(): Promise<void> {
  await GeminiNano.download();
}

// `image` is raw base64 (no data: prefix).
export async function nanoAsk(
  image: string,
  prompt: string
): Promise<{ status: NanoStatus; text?: string; ms?: number }> {
  return GeminiNano.askAboutImage({ image, prompt });
}

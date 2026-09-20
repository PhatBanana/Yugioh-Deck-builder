import { registerPlugin } from "@capacitor/core";

// On-device OCR, backed by the app's own ML Kit plugin (Android:
// android/app/src/main/java/com/phatbanana/ygodeckbuilder/OcrPlugin.java).
//
// This replaced @jcesarmobile/capacitor-ocr, which hard-wired ML Kit's Latin
// recognizer: Japanese glyphs came back as nothing at all, so OCG cards could
// never be matched by name. Same call shape as before, plus `script`.

/** Which recognizer model to run.
 *
 *  "latin" covers English and the European prints. "japanese" switches to the
 *  CJK model — which also carries the identical Latin model, so it reads
 *  English cards just as well and a mixed collection needs no second pass. */
export type OcrScript = "latin" | "japanese";

export interface OcrLine {
  text: string;
  confidence: number;
}

export interface OcrPlugin {
  process(options: { image: string; script?: OcrScript }): Promise<{ results: OcrLine[] }>;
}

export const Ocr = registerPlugin<OcrPlugin>("Ocr");

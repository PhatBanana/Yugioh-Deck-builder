import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Ocr } from "@jcesarmobile/capacitor-ocr";
import { matchOcrLines, type NameCandidate, type NameMatch } from "@shared/scan/nameMatcher";
import { db } from "../db";

export interface ScanOutcome {
  matches: NameMatch[];
  rawLines: string[];
}

let candidateCache: NameCandidate[] | null = null;

export async function getNameCandidates(): Promise<NameCandidate[]> {
  if (!candidateCache) {
    candidateCache = (await db.cards.toArray()).map((c) => ({ id: c.id, name: c.name }));
  }
  return candidateCache;
}

export function invalidateCandidateCache(): void {
  candidateCache = null;
}

export function isScanSupported(): boolean {
  return Capacitor.isNativePlatform();
}

// Take a photo, OCR it on-device (ML Kit), and fuzzy-match the recognized
// lines against the card catalog.
export async function scanCard(): Promise<ScanOutcome> {
  const photo = await Camera.getPhoto({
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
    quality: 90,
    correctOrientation: true,
    saveToGallery: false,
  });

  const image = photo.path ?? photo.webPath;
  if (!image) throw new Error("Camera returned no image");

  const { results } = await Ocr.process({ image });
  // OCR blocks can span multiple printed lines; split so the card name is a
  // standalone line for matching.
  const rawLines = results
    .flatMap((r) => r.text.split("\n"))
    .map((l) => l.trim())
    .filter((l) => l.length >= 3);

  const candidates = await getNameCandidates();
  const matches = matchOcrLines(rawLines, candidates, { limit: 6, minScore: 0.55 });
  return { matches, rawLines };
}

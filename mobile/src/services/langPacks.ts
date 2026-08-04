import { db, type MAltName } from "../db";
import { fetchLangPack } from "./dataPacks";
import { invalidateCandidateCache } from "./scanner";

// Downloadable card-name language packs (from the CI-built data-pack release).
// Installing one adds that language's names to search and to the scanner's
// OCR candidate list. `latin: false` languages can't be *read* by the bundled
// ML Kit Latin text recognizer — typed search still works.

export interface LangInfo {
  code: string;
  label: string;
  latin: boolean;
}

export const LANGS: LangInfo[] = [
  { code: "de", label: "German", latin: true },
  { code: "fr", label: "French", latin: true },
  { code: "it", label: "Italian", latin: true },
  { code: "es", label: "Spanish", latin: true },
  { code: "pt", label: "Portuguese", latin: true },
  { code: "ja", label: "Japanese", latin: false },
  { code: "ko", label: "Korean", latin: false },
];

// Language codes with at least one installed name row.
export async function installedLangs(): Promise<Set<string>> {
  const langs = new Set<string>();
  for (const l of LANGS) {
    if ((await db.altNames.where("lang").equals(l.code).count()) > 0) langs.add(l.code);
  }
  return langs;
}

// Downloads and installs (or refreshes) one language's name pack.
export async function installLangPack(lang: string): Promise<number> {
  const pack = await fetchLangPack(lang);
  const rows: MAltName[] = [];
  for (const [password, name] of Object.entries(pack)) {
    const cardId = Number(password);
    if (!Number.isFinite(cardId) || !name) continue;
    rows.push({ cardId, lang, name, nameLower: name.toLowerCase() });
  }
  if (rows.length < 1000) throw new Error("Language pack looks incomplete — try again later");
  await db.transaction("rw", db.altNames, async () => {
    await db.altNames.where("lang").equals(lang).delete();
    await db.altNames.bulkPut(rows);
  });
  invalidateCandidateCache();
  return rows.length;
}

export async function removeLangPack(lang: string): Promise<void> {
  await db.altNames.where("lang").equals(lang).delete();
  invalidateCandidateCache();
}

// Card ids whose installed localized names contain the query (lowercased).
// Used to widen name search when packs are installed; cheap no-op when the
// table is empty.
export async function searchAltNameIds(q: string, max = 200): Promise<Set<number>> {
  const ids = new Set<number>();
  if (!q) return ids;
  if ((await db.altNames.limit(1).count()) === 0) return ids;
  await db.altNames
    .filter((a) => a.nameLower.includes(q))
    .until(() => ids.size >= max)
    .each((a) => ids.add(a.cardId));
  return ids;
}

import { DATA_PACK_LANGS } from "@shared/datapacks/transform";
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

// Typed against the pack manifest: a language added to DATA_PACK_LANGS fails
// compilation here until it gets a label, instead of silently never showing up.
const LANG_META: Record<(typeof DATA_PACK_LANGS)[number], { label: string; latin: boolean }> = {
  de: { label: "German", latin: true },
  fr: { label: "French", latin: true },
  it: { label: "Italian", latin: true },
  es: { label: "Spanish", latin: true },
  pt: { label: "Portuguese", latin: true },
  ja: { label: "Japanese", latin: false },
  ko: { label: "Korean", latin: false },
};

// Latin (scannable) languages listed first.
export const LANGS: LangInfo[] = [...DATA_PACK_LANGS]
  .map((code) => ({ code, ...LANG_META[code] }))
  .sort((a, b) => Number(b.latin) - Number(a.latin));

// Language codes with at least one installed name row — one indexed
// distinct-keys query instead of a count per language.
export async function installedLangs(): Promise<Set<string>> {
  const keys = await db.altNames.orderBy("lang").uniqueKeys();
  return new Set(keys.map(String));
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

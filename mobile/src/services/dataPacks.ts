import type { LimitRegEntry } from "@shared/datapacks/transform";
import { httpGetJson } from "./http";

// Downloads the repo's CI-built data packs (rolling `data-latest` release):
// tiny indices distilled from yaml-yugi that would be far too large to derive
// on-device. Public repo, so phones fetch the assets unauthenticated.

const BASE =
  "https://github.com/PhatBanana/Yugioh-Deck-builder/releases/download/data-latest";

export type { LimitRegEntry };

export async function fetchLimitRegs(): Promise<Record<string, LimitRegEntry>> {
  return httpGetJson<Record<string, LimitRegEntry>>(`${BASE}/limit-regs.json`);
}

export async function fetchYugipediaIds(): Promise<Record<string, number>> {
  return httpGetJson<Record<string, number>>(`${BASE}/yugipedia-ids.json`);
}

export async function fetchLangPack(lang: string): Promise<Record<string, string>> {
  return httpGetJson<Record<string, string>>(`${BASE}/langpack-${lang}.json`);
}

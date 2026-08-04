// Builds the app's "data packs" — tiny per-purpose indices distilled from
// yaml-yugi's aggregate card dump (which is far too large to parse on a
// phone). Run by .github/workflows/data-packs.yml on a schedule; outputs to
// dist-data/, which the workflow publishes on the rolling `data-latest`
// release. Requires Node ≥ 23 (native TypeScript type stripping for the
// shared transform import).

import { mkdir, writeFile } from "node:fs/promises";
import {
  buildLangPack,
  buildLimitRegs,
  buildYugipediaIds,
} from "../shared/datapacks/transform.ts";

const AGGREGATE_URL =
  "https://cdn.jsdelivr.net/gh/DawnbrandBots/yaml-yugi@aggregate/cards.json";
const OUT_DIR = "dist-data";
const LANGS = ["ja", "ko", "de", "fr", "it", "es", "pt"];

console.log(`Fetching ${AGGREGATE_URL} …`);
const res = await fetch(AGGREGATE_URL);
if (!res.ok) throw new Error(`aggregate fetch failed: HTTP ${res.status}`);
const cards = await res.json();
if (!Array.isArray(cards) || cards.length < 10000) {
  throw new Error(`aggregate looks wrong: ${Array.isArray(cards) ? cards.length : typeof cards} entries`);
}
console.log(`${cards.length} cards.`);

// ---- Schema check: fail LOUDLY if yaml-yugi moved the fields we read, so a
// scheduled run turns red instead of silently publishing empty packs. -------
const darkMagician = cards.find((c) => c?.password === 46986414);
if (!darkMagician) throw new Error("schema check: Dark Magician (46986414) not found by password");
if (typeof darkMagician.name?.en !== "string") {
  throw new Error("schema check: name.en missing — multi-language name shape changed?");
}
const withReg = cards.filter((c) => c?.limit_regulation && typeof c.limit_regulation === "object");
if (withReg.length < cards.length * 0.5) {
  throw new Error(`schema check: only ${withReg.length} cards carry limit_regulation`);
}
const withYp = cards.filter((c) => typeof c?.yugipedia_page_id === "number");
if (withYp.length < cards.length * 0.5) {
  throw new Error(`schema check: only ${withYp.length} cards carry yugipedia_page_id`);
}

// ---- Build + write ---------------------------------------------------------
await mkdir(OUT_DIR, { recursive: true });
const write = async (name, data) => {
  const json = JSON.stringify(data);
  await writeFile(`${OUT_DIR}/${name}`, json);
  console.log(`${name}: ${Object.keys(data).length} entries, ${(json.length / 1024).toFixed(0)} KB`);
};

const regs = buildLimitRegs(cards);
if (Object.keys(regs).length < 1000) {
  throw new Error(`limit-regs suspiciously small (${Object.keys(regs).length}) — MD/Speed fields moved?`);
}
await write("limit-regs.json", regs);
await write("yugipedia-ids.json", buildYugipediaIds(cards));
for (const lang of LANGS) {
  await write(`langpack-${lang}.json`, buildLangPack(cards, lang));
}
console.log("done.");

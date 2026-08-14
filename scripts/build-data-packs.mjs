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
  DATA_PACK_LANGS,
  langPackName,
  LIMIT_REGS_PACK,
  YUGIPEDIA_IDS_PACK,
} from "../shared/datapacks/transform.ts";

// The aggregate is ~94 MB, which is over jsDelivr's 20 MB cap for
// GitHub-hosted files (it answers 403). Nothing here runs in a browser — this
// is a CI-only script — so raw.githubusercontent.com is the right source and
// CORS is irrelevant.
const AGGREGATE_URL =
  "https://raw.githubusercontent.com/DawnbrandBots/yaml-yugi/aggregate/cards.json";
const OUT_DIR = "dist-data";

console.log(`Fetching ${AGGREGATE_URL} …`);
const res = await fetch(AGGREGATE_URL);
if (!res.ok) throw new Error(`aggregate fetch failed: HTTP ${res.status}`);
const cards = await res.json();
if (!Array.isArray(cards) || cards.length < 10000) {
  throw new Error(`aggregate looks wrong: ${Array.isArray(cards) ? cards.length : typeof cards} entries`);
}
console.log(`${cards.length} cards.`);

// ---- Schema check: fail LOUDLY if yaml-yugi moved the fields we read, so a
// scheduled run turns red instead of silently publishing empty packs. Every
// threshold below is anchored to what the live aggregate carried when this
// was written (12,928 cards), with slack for the DB growing. ---------------
const darkMagician = cards.find((c) => c?.password === 46986414);
if (!darkMagician) throw new Error("schema check: Dark Magician (46986414) not found by password");
if (typeof darkMagician.name?.en !== "string") {
  throw new Error("schema check: name.en missing — multi-language name shape changed?");
}
if (typeof darkMagician.limit_regulation?.tcg !== "string") {
  throw new Error("schema check: limit_regulation.tcg missing — regulation shape changed?");
}
const withYp = cards.filter((c) => typeof c?.yugipedia_page_id === "number");
if (withYp.length < cards.length * 0.5) {
  throw new Error(`schema check: only ${withYp.length} cards carry yugipedia_page_id`);
}
// Master Duel membership rides master_duel_rarity (N/R/SR/UR) — there is no
// upstream MD Forbidden/Limited list. ~12.4k of 12.9k cards carry one.
const inMd = cards.filter((c) => c?.master_duel_rarity != null);
if (inMd.length < cards.length * 0.5) {
  throw new Error(`schema check: only ${inMd.length} cards carry master_duel_rarity`);
}
// The Speed Duel pool is small and is defined purely by the presence of
// limit_regulation.speed (~1,221 cards). If this ever covers everything, the
// key stopped meaning "in the pool" and the Speed format would go wrong.
const inSpeed = cards.filter((c) => c?.limit_regulation?.speed !== undefined);
if (inSpeed.length < 200 || inSpeed.length > cards.length * 0.5) {
  throw new Error(
    `schema check: Speed pool is ${inSpeed.length} cards — limit_regulation.speed no longer marks pool membership?`
  );
}
console.log(`Master Duel pool: ${inMd.length}; Speed Duel pool: ${inSpeed.length}.`);

// ---- Build + write ---------------------------------------------------------
await mkdir(OUT_DIR, { recursive: true });
const write = async (name, data) => {
  const json = JSON.stringify(data);
  await writeFile(`${OUT_DIR}/${name}`, json);
  // Byte length, not string length — the CJK packs are ~45% bigger on the
  // wire than their character count suggests, and this number is what the
  // in-app download hint is written against.
  const kb = Buffer.byteLength(json, "utf8") / 1024;
  console.log(`${name}: ${Object.keys(data).length} entries, ${kb.toFixed(0)} KB`);
};

const regs = buildLimitRegs(cards);
if (Object.keys(regs).length < 1000) {
  throw new Error(`limit-regs suspiciously small (${Object.keys(regs).length}) — MD/Speed fields moved?`);
}
await write(LIMIT_REGS_PACK, regs);
await write(YUGIPEDIA_IDS_PACK, buildYugipediaIds(cards));
for (const lang of DATA_PACK_LANGS) {
  await write(langPackName(lang), buildLangPack(cards, lang));
}
console.log("done.");

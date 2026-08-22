// eBay real-photo harvester for the foil-classifier pre-training set.
//
// Uses eBay's OFFICIAL Browse API (free developer keyset; raw HTML scraping
// is against eBay's ToS and bot-walled — we don't do it). Listings are real
// photographs of real foil cards, which is exactly what the synthetic
// renderer can't provide. Same ground rule as synthetic data: PRE-TRAINING
// ONLY — evaluation uses phone captures exclusively (../README.md).
//
// The label-cleaning trick that makes seller data trustworthy: extract the
// SET CODE from the listing title and look it up in the YGOPRODeck catalog
// (same source as the app's offline rarity index). Keep a listing only when
//   - the code maps to exactly ONE printed rarity (a catalog fact), or
//   - the code maps to several and the title names exactly one of them.
// The seller's rarity *claim* is never the label — the catalog is.
//
// Known bias, accepted: valuable cards are photographed in sleeves and
// toploaders. Train-time cropping/augmentation has to deal with it, and
// if "toploader ⇒ rainbow" shortcut-learning shows up in the scorecard,
// this stratum gets down-weighted.
//
// Setup (once): https://developer.ebay.com → create account → create an app
// (production keyset) → put the two keys in training/harvest/.env:
//   EBAY_CLIENT_ID=YourAppI-D...
//   EBAY_CLIENT_SECRET=PRD-...
//
// Usage:
//   node ebay.mjs --check                 # offline self-test (no keys needed)
//   node ebay.mjs [--max 400] [--out ../dataset/web]

import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, "cache");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const CHECK = process.argv.includes("--check");
const MAX_PER_FAMILY = Number(arg("max", "400"));
const OUT = resolve(HERE, arg("out", "../dataset/web"));

// ---- Set-code + family logic ------------------------------------------------
// Mirrors shared/scan/setCode.ts (canonSetCode/extractSetCode) and the family
// mapping in shared/scan/trainingCapture.ts (foilFamilyFor). Kept in sync by
// the --check self-test's canned cases; if those files change, update here.

const REGIONS = new Set([
  "EN", "FR", "DE", "IT", "PT", "SP", "EU", "AE", "AU", "JP", "JA", "KR", "TC", "SC",
]);

function canonSetCode(code) {
  const up = code.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const dash = up.indexOf("-");
  if (dash <= 0) return up;
  const prefix = up.slice(0, dash);
  let rest = up.slice(dash + 1);
  const region = rest.match(/^([A-Z]{2})(?=[A-Z]?\d)/);
  if (region && REGIONS.has(region[1])) rest = rest.slice(2);
  rest = rest.replace(/\d+/, (d) => String(Number(d)));
  return `${prefix}-${rest}`;
}

function extractSetCode(text) {
  const re = /\b([A-Z0-9]{2,6})-([A-Z]{0,3}\d[A-Z0-9]{0,4})\b/;
  const m = text.toUpperCase().replace(/\s*-\s*/g, "-").match(re);
  return m ? `${m[1]}-${m[2]}` : null;
}

function foilFamilyFor(rarity) {
  const r = rarity.toLowerCase();
  if (/(starfoil|mosaic|shatterfoil|parallel|duel terminal)/.test(r)) return null;
  if (/(secret|starlight|ghost|collector|prismatic|quarter century)/.test(r)) return "rainbow";
  if (/ultimate/.test(r)) return "holo-art";
  if (/(ultra|gold)/.test(r)) return "gold-name";
  if (/super/.test(r)) return "holo-art";
  if (/(common|short print|normal)/.test(r)) return "matte";
  if (/^rare$/.test(r.trim())) return "holo-name";
  return null;
}

// When a code maps to several rarities, the title must name exactly one.
// Most-specific keyword first so "quarter century secret rare" doesn't match
// plain "secret".
const RARITY_KEYWORDS = [
  ["quarter century", /quarter\s*century/i],
  ["starlight", /starlight/i],
  ["collector", /collector'?s\s*rare/i],
  ["gold secret", /gold\s*secret/i],
  ["prismatic", /prismatic|platinum/i],
  ["ghost", /ghost\s*rare/i],
  ["ultimate", /ultimate/i],
  ["secret", /secret/i],
  ["ultra", /ultra/i],
  ["super", /super/i],
  ["gold", /gold\s*rare/i],
  ["common", /\bcommon\b|short\s*print/i],
  ["rare", /\brare\b/i],
];

function disambiguateByTitle(title, rarities) {
  for (const [key, re] of RARITY_KEYWORDS) {
    if (!re.test(title)) continue;
    const hits = rarities.filter((r) => r.toLowerCase().includes(key));
    return hits.length === 1 ? hits[0] : null; // ambiguous keyword → give up
  }
  return null;
}

// Resolves one listing title to a trusted (rarity, family) or null.
function labelFromTitle(title, codeMap) {
  const raw = extractSetCode(title);
  if (!raw) return null;
  const rarities = codeMap.get(canonSetCode(raw));
  if (!rarities || rarities.length === 0) return null;
  const distinct = [...new Set(rarities)];
  const rarity = distinct.length === 1 ? distinct[0] : disambiguateByTitle(title, distinct);
  if (!rarity) return null;
  const family = foilFamilyFor(rarity);
  return family ? { setCode: raw, rarity, family } : null;
}

// ---- Catalog (set code → printed rarities) -----------------------------------

async function buildCodeMap() {
  await mkdir(CACHE, { recursive: true });
  const cachePath = join(CACHE, "cardinfo.json");
  let json;
  if (existsSync(cachePath)) {
    json = JSON.parse(await readFile(cachePath, "utf8"));
  } else {
    console.log("Downloading the full YGOPRODeck card dump (~100 MB, one-time, cached)…");
    const res = await fetch("https://db.ygoprodeck.com/api/v7/cardinfo.php");
    if (!res.ok) throw new Error(`cardinfo.php HTTP ${res.status}`);
    const text = await res.text();
    await writeFile(cachePath, text);
    json = JSON.parse(text);
  }
  const map = new Map();
  for (const card of json.data ?? []) {
    for (const set of card.card_sets ?? []) {
      if (!set.set_code || !set.set_rarity) continue;
      const canon = canonSetCode(set.set_code);
      const list = map.get(canon) ?? [];
      list.push(set.set_rarity);
      map.set(canon, list);
    }
  }
  console.log(`Catalog: ${map.size.toLocaleString()} set codes.`);
  return map;
}

// ---- Self-test ----------------------------------------------------------------

const CANNED = [
  // [title, expected family or null]
  ["Yugioh Ash Blossom & Joyous Spring RA01-EN008 Quarter Century Secret Rare", "rainbow"],
  // Real code (Loptr), but the title claims a rarity that code was never
  // printed in — the cleaner must refuse rather than trust the seller.
  ["Yugioh Ash Blossom RA05-EN016 Quarter Century Secret Rare", null],
  ["YuGiOh Dark Magician SDY-006 Ultra Rare 1st Edition NM", "gold-name"],
  ["Blue-Eyes White Dragon LOB-EN001 Ultra Rare Heavily Played", "gold-name"],
  ["Yugioh Regulus HAC1-EN106 Duel Terminal Normal Parallel Rare", null], // variable finish
  ["Pot of Greed graded slab no set code", null], // no code
  ["Yugioh Mystical Space Typhoon MRL-047 Ultra Rare", "gold-name"],
];

async function selfTest() {
  const map = await buildCodeMap();
  let pass = 0;
  for (const [title, expected] of CANNED) {
    const got = labelFromTitle(title, map)?.family ?? null;
    const ok = got === expected;
    if (ok) pass++;
    console.log(`${ok ? "✓" : "✗"} ${title}\n    → ${got} (expected ${expected})`);
  }
  console.log(`${pass}/${CANNED.length} canned titles labelled as expected.`);
  if (pass !== CANNED.length) process.exit(1);
}

// ---- eBay Browse API -----------------------------------------------------------

async function loadEnv() {
  const envPath = join(HERE, ".env");
  if (existsSync(envPath)) {
    for (const line of (await readFile(envPath, "utf8")).split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
  const id = process.env.EBAY_CLIENT_ID;
  const secret = process.env.EBAY_CLIENT_SECRET;
  if (!id || !secret) {
    console.error(
      "Missing eBay keys. Create a free production keyset at https://developer.ebay.com\n" +
        "and put EBAY_CLIENT_ID / EBAY_CLIENT_SECRET in training/harvest/.env"
    );
    process.exit(1);
  }
  return { id, secret };
}

async function getToken({ id, secret }) {
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials&scope=" +
      encodeURIComponent("https://api.ebay.com/oauth/api_scope"),
  });
  if (!res.ok) throw new Error(`OAuth ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

// Searches biased toward each family. Titles are still label-cleaned against
// the catalog — the query only steers what comes back.
const QUERIES = {
  rainbow: [
    "yugioh quarter century secret rare",
    "yugioh starlight rare",
    "yugioh ghost rare",
    "yugioh prismatic secret rare",
    "yugioh secret rare 1st edition",
  ],
  "gold-name": ["yugioh ultra rare 1st edition", "yugioh gold rare"],
  "holo-art": ["yugioh super rare 1st edition", "yugioh ultimate rare"],
  "holo-name": ["yugioh rare 1st edition near mint"],
  matte: ["yugioh common 1st edition near mint"],
};

async function search(token, q, offset) {
  const url =
    "https://api.ebay.com/buy/browse/v1/item_summary/search?limit=200" +
    `&offset=${offset}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    },
  });
  if (res.status === 429) return { rateLimited: true, items: [] };
  if (!res.ok) throw new Error(`search ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return { items: json.itemSummaries ?? [], total: json.total ?? 0 };
}

// eBay serves several sizes off one URL; s-l1600 is the largest.
function hiRes(url) {
  return url.replace(/s-l\d+\./, "s-l1600.");
}

async function harvest() {
  const keys = await loadEnv();
  const codeMap = await buildCodeMap();
  const token = await getToken(keys);
  const manifestPath = join(OUT, "manifest.jsonl");
  const seenItems = new Set();
  const counts = Object.fromEntries(Object.keys(QUERIES).map((f) => [f, 0]));

  for (const [family, queries] of Object.entries(QUERIES)) {
    await mkdir(join(OUT, family), { recursive: true });
    for (const q of queries) {
      if (counts[family] >= MAX_PER_FAMILY) break;
      for (let offset = 0; offset < 1000 && counts[family] < MAX_PER_FAMILY; offset += 200) {
        const { items, rateLimited } = await search(token, q, offset);
        if (rateLimited) {
          console.warn("Rate limited — stopping this query.");
          break;
        }
        if (items.length === 0) break;
        for (const item of items) {
          if (counts[family] >= MAX_PER_FAMILY) break;
          if (!item.itemId || seenItems.has(item.itemId)) continue;
          seenItems.add(item.itemId);
          const img = item.image?.imageUrl;
          if (!img || !item.title) continue;
          const label = labelFromTitle(item.title, codeMap);
          // The query steered toward `family`, but the LABEL decides where it
          // files — a Super Rare surfacing in an "ultra" search files as
          // holo-art, and unlabellable listings are dropped.
          if (!label) continue;
          try {
            const res = await fetch(hiRes(img));
            if (!res.ok) continue;
            const file = `${label.family}/${item.itemId.replace(/[^A-Za-z0-9]/g, "_")}.jpg`;
            await writeFile(join(OUT, file), Buffer.from(await res.arrayBuffer()));
            await appendFile(
              manifestPath,
              JSON.stringify({
                file,
                family: label.family,
                rarity: label.rarity,
                set_code: label.setCode,
                source: "ebay",
                item_id: item.itemId,
                title: item.title,
              }) + "\n"
            );
            counts[label.family] = (counts[label.family] ?? 0) + 1;
          } catch {
            // One bad download is noise.
          }
          await new Promise((r) => setTimeout(r, 60));
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    console.log(`${family}: ${counts[family]} images`);
  }
  console.log(`Done → ${OUT}`);
  console.log(JSON.stringify(counts, null, 2));
}

if (CHECK) await selfTest();
else await harvest();

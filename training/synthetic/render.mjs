// Synthetic foil training-image renderer.
//
// Downloads catalog card images (YGOPRODeck), lays the app's own foil overlay
// CSS over each (harness.html imports mobile/src/foil.css verbatim), and
// screenshots one image per (card, family, variant) into
// ../dataset/synthetic/<family>/. Labels are perfect by construction; these
// images are PRE-TRAINING data only — evaluation uses real phone captures
// (see ../README.md).
//
// Per-variant jitter (sheen position, opacity, hue) varies what the overlay
// legitimately varies in real life: where the light band sits and how strong
// it reads. Camera realism (perspective, glare, backgrounds, JPEG mush) is
// deliberately NOT done here — that's train-time augmentation, applied to
// synthetic and real images alike.
//
// Usage: npm run render -- [--count 40] [--variants 2] [--out ../dataset/synthetic]

import { mkdir, writeFile, appendFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---- CLI ------------------------------------------------------------------

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const COUNT = Number(arg("count", "40"));
const VARIANTS = Number(arg("variants", "2"));
const OUT = resolve(HERE, arg("out", "../dataset/synthetic"));
const TMP = join(HERE, "tmp");

// The classifier's visual families and the app CSS class rendering each.
// "unclear" is absent by design: glare-blown examples come from train-time
// augmentation (and real captures), not from the clean renderer.
const FAMILIES = [
  { family: "matte", cls: null },
  { family: "holo-name", cls: "foil-silver" },
  { family: "holo-art", cls: "foil-holo" },
  { family: "gold-name", cls: "foil-gold" },
  { family: "rainbow", cls: "foil-rainbow" },
];

// ---- Card sampling ----------------------------------------------------------

// Grabs blocks of cards at random offsets from the full YGOPRODeck list —
// a handful of requests instead of one per card. Blocks are contiguous in
// the API's ordering, so several spread-out offsets keep art/frame variety.
async function sampleCards(count) {
  const cards = new Map();
  const blocks = Math.max(3, Math.ceil(count / 20));
  const per = Math.ceil(count / blocks);
  for (let b = 0; b < blocks && cards.size < count; b++) {
    const offset = Math.floor(Math.random() * 12000);
    const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?num=${per}&offset=${offset}`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = await res.json();
      for (const c of json.data ?? []) {
        const img = c.card_images?.[0]?.image_url;
        if (img && !cards.has(c.id)) cards.set(c.id, { id: c.id, name: c.name, img });
        if (cards.size >= count) break;
      }
    } catch {
      // One failed block is fine — others cover it.
    }
    await new Promise((r) => setTimeout(r, 150)); // stay well under rate limits
  }
  return [...cards.values()];
}

async function download(card) {
  const path = join(TMP, `${card.id}.jpg`);
  if (existsSync(path)) return path;
  const res = await fetch(card.img);
  if (!res.ok) throw new Error(`HTTP ${res.status} for card ${card.id}`);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
  return path;
}

// ---- Per-variant jitter ------------------------------------------------------

const rand = (lo, hi) => lo + Math.random() * (hi - lo);

// Style overrides for one variant of one family. Only jitters what the class
// itself positions: the name band's height, the art sheen's sweep, overall
// strength, and (rainbow) the glitter's hue.
function jitter(cls) {
  if (!cls) return {};
  switch (cls) {
    case "foil-silver":
      return {
        backgroundPosition: `0 ${rand(3.5, 6.5).toFixed(1)}%`,
        opacity: rand(0.65, 0.95).toFixed(2),
      };
    case "foil-holo":
      return {
        backgroundPosition: `${rand(30, 70).toFixed(0)}% 33%`,
        opacity: rand(0.4, 0.7).toFixed(2),
      };
    case "foil-gold":
      return {
        backgroundPosition: `0 ${rand(3.5, 6.5).toFixed(1)}%, ${rand(30, 70).toFixed(0)}% 33%`,
        opacity: rand(0.75, 1).toFixed(2),
      };
    case "foil-rainbow":
      return {
        filter: `hue-rotate(${rand(0, 45).toFixed(0)}deg)`,
        opacity: rand(0.35, 0.6).toFixed(2),
      };
    default:
      return {};
  }
}

// ---- Render loop -------------------------------------------------------------

async function main() {
  if (!Number.isFinite(COUNT) || COUNT < 1) throw new Error("--count must be >= 1");
  await mkdir(TMP, { recursive: true });
  for (const f of FAMILIES) await mkdir(join(OUT, f.family), { recursive: true });

  console.log(`Sampling ${COUNT} cards…`);
  const cards = await sampleCards(COUNT);
  if (cards.length === 0) throw new Error("No cards fetched — offline?");
  console.log(`Got ${cards.length}. Rendering ${FAMILIES.length} families × ${VARIANTS} variant(s)…`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 500, height: 750 } });
  await page.goto(pathToFileURL(join(HERE, "harness.html")).href);
  const stage = page.locator("#stage");

  const manifestPath = join(OUT, "manifest.jsonl");
  let rendered = 0;
  for (const card of cards) {
    let imgPath;
    try {
      imgPath = await download(card);
    } catch (err) {
      console.warn(`  skip ${card.id} (${err.message})`);
      continue;
    }
    await page.evaluate(async (src) => {
      const img = document.getElementById("card");
      img.src = src;
      await img.decode();
    }, pathToFileURL(imgPath).href);

    for (const { family, cls } of FAMILIES) {
      // Matte has nothing to jitter — extra variants would be duplicates.
      const variants = cls ? VARIANTS : 1;
      for (let v = 0; v < variants; v++) {
        const style = jitter(cls);
        await page.evaluate(
          ({ cls, style }) => {
            const overlay = document.getElementById("overlay");
            overlay.className = cls ? `foil ${cls}` : "foil";
            overlay.style.backgroundPosition = style.backgroundPosition ?? "";
            overlay.style.opacity = style.opacity ?? "";
            overlay.style.filter = style.filter ?? "";
          },
          { cls, style }
        );
        const file = `${card.id}-${v}.jpg`;
        await stage.screenshot({ path: join(OUT, family, file), type: "jpeg", quality: 90 });
        await appendFile(
          manifestPath,
          JSON.stringify({
            file: `${family}/${file}`,
            family,
            card_id: card.id,
            card_name: card.name,
            source: "synthetic",
            jitter: style,
          }) + "\n"
        );
        rendered++;
      }
    }
    if (rendered % 50 === 0) console.log(`  ${rendered} images…`);
  }

  await browser.close();
  await rm(TMP, { recursive: true, force: true });
  console.log(`Done: ${rendered} images → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

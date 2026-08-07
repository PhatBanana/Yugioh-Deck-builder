import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { formatUsd } from "../lib/util";
import type { EnrichedDeck, EnrichedDeckCard } from "./decks";

// Renders a deck to a shareable PNG — the visual half of deck sharing (the
// copy-paste code covers re-import; an image is what gets posted). Card art
// is fetched natively (CapacitorHttp, no CORS taint) and drawn as one grid
// per section, each copy shown like every deck-site image.

const CARD_W = 92;
const CARD_H = 134; // 59:86 card ratio
const GAP = 6;
const PER_ROW = 10;
const PAD = 28;
const WIDTH = PAD * 2 + PER_ROW * CARD_W + (PER_ROW - 1) * GAP;

// One art per unique card; failures return null and draw as a named placeholder.
async function loadArt(url: string): Promise<HTMLImageElement | null> {
  try {
    let src: string;
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({ url, responseType: "blob", readTimeout: 20000 });
      if (res.status >= 400 || typeof res.data !== "string") return null;
      src = `data:image/jpeg;base64,${res.data}`;
    } else {
      const res = await fetch(url);
      if (!res.ok) return null;
      src = URL.createObjectURL(await res.blob());
    }
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  } catch {
    return null;
  }
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  card: EnrichedDeckCard,
  art: HTMLImageElement | null,
  x: number,
  y: number
) {
  if (art) {
    ctx.drawImage(art, x, y, CARD_W, CARD_H);
  } else {
    // No art — a dark cell with the wrapped card name keeps the list readable.
    ctx.fillStyle = "#201b2a";
    ctx.fillRect(x, y, CARD_W, CARD_H);
    ctx.fillStyle = "#a3a3a3";
    ctx.font = "10px sans-serif";
    const words = card.name.split(" ");
    let line = "";
    let ty = y + 16;
    for (const w of words) {
      const probe = line ? `${line} ${w}` : w;
      if (ctx.measureText(probe).width > CARD_W - 8 && line) {
        ctx.fillText(line, x + 4, ty, CARD_W - 8);
        line = w;
        ty += 12;
        if (ty > y + CARD_H - 6) return;
      } else {
        line = probe;
      }
    }
    if (line) ctx.fillText(line, x + 4, ty, CARD_W - 8);
  }
}

function sectionRows(count: number): number {
  return Math.ceil(count / PER_ROW);
}

export async function renderDeckImage(enriched: EnrichedDeck): Promise<HTMLCanvasElement> {
  // Expand quantities: a 3-of appears three times, like real deck images.
  const bySection = (["main", "extra", "side"] as const).map((s) => ({
    section: s,
    cards: enriched.cards
      .filter((c) => c.section === s)
      .flatMap((c) => Array.from({ length: c.quantity }, () => c)),
  }));
  const present = bySection.filter((s) => s.cards.length > 0);

  const HEADER_H = 86;
  const SECTION_LABEL_H = 34;
  const height =
    HEADER_H +
    present.reduce(
      (h, s) => h + SECTION_LABEL_H + sectionRows(s.cards.length) * (CARD_H + GAP),
      0
    ) +
    PAD;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  ctx.fillStyle = "#0d0b12";
  ctx.fillRect(0, 0, WIDTH, height);

  // Header: name + composition + price.
  ctx.fillStyle = "#f5f5f5";
  ctx.font = "bold 26px sans-serif";
  ctx.fillText(enriched.deck.name, PAD, PAD + 22, WIDTH - PAD * 2);
  const price = enriched.cards.reduce((s, c) => s + (c.price ?? 0) * c.quantity, 0);
  const v = enriched.validation;
  ctx.fillStyle = "#a3a3a3";
  ctx.font = "14px sans-serif";
  ctx.fillText(
    `Main ${v.mainCount} · Extra ${v.extraCount} · Side ${v.sideCount}${price > 0 ? ` · ≈ ${formatUsd(price)}` : ""}`,
    PAD,
    PAD + 46
  );

  // Fetch each unique card's art once.
  const arts = new Map<number, HTMLImageElement | null>();
  await Promise.all(
    [...new Map(enriched.cards.map((c) => [c.cardId, c])).values()].map(async (c) => {
      arts.set(c.cardId, c.img ? await loadArt(c.img) : null);
    })
  );

  let y = HEADER_H;
  for (const s of present) {
    ctx.fillStyle = "#fcd34d";
    ctx.font = "bold 15px sans-serif";
    const label = s.section === "main" ? "Main Deck" : s.section === "extra" ? "Extra Deck" : "Side Deck";
    ctx.fillText(`${label} (${s.cards.length})`, PAD, y + 18);
    y += SECTION_LABEL_H;
    s.cards.forEach((card, i) => {
      const x = PAD + (i % PER_ROW) * (CARD_W + GAP);
      const cy = y + Math.floor(i / PER_ROW) * (CARD_H + GAP);
      drawCell(ctx, card, arts.get(card.cardId) ?? null, x, cy);
    });
    y += sectionRows(s.cards.length) * (CARD_H + GAP);
  }

  // Footer credit, small and out of the way.
  ctx.fillStyle = "#525252";
  ctx.font = "11px sans-serif";
  ctx.fillText("YGO Deck Builder", PAD, height - 10);

  return canvas;
}

// Renders and hands the PNG to the user: Android opens the share sheet, the
// browser downloads it.
export async function shareDeckImage(enriched: EnrichedDeck): Promise<"shared" | "failed"> {
  try {
    const canvas = await renderDeckImage(enriched);
    const dataUrl = canvas.toDataURL("image/png");
    const name = `${enriched.ydkName || "deck"}.png`;
    if (Capacitor.isNativePlatform()) {
      const file = await Filesystem.writeFile({
        path: name,
        data: dataUrl.split(",")[1], // base64 body — no encoding option = binary write
        directory: Directory.Cache,
      });
      await Share.share({ title: name, url: file.uri, dialogTitle: `Share ${name}` });
    } else {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = name;
      a.click();
    }
    return "shared";
  } catch (err) {
    // Dismissing the share sheet isn't a failure.
    if (err instanceof Error && /cancel/i.test(err.message)) return "shared";
    return "failed";
  }
}

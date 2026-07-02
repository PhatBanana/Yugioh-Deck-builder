import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCardById } from "../../../../lib/db/cardsRepo";
import { DATA_DIR } from "../../../../lib/paths";

export const runtime = "nodejs";

const IMAGE_DIR = path.join(DATA_DIR, "images");
const USER_AGENT = "ygoh-deck-recommender/1.0 (local hobby project; personal use)";

// Per YGOPRODeck's API policy, images must be downloaded and stored locally
// rather than hotlinked. This route caches each image on disk on first request
// and serves from disk thereafter.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid card id" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const size = searchParams.get("size") === "full" ? "full" : "small";

  const card = getCardById(id);
  const remoteUrl = size === "small" ? card?.image_url_small : card?.image_url;
  if (!card || !remoteUrl) {
    return NextResponse.json({ error: "Card or image not found" }, { status: 404 });
  }

  const filePath = path.join(IMAGE_DIR, `${id}_${size}.jpg`);

  if (!fs.existsSync(filePath)) {
    try {
      const res = await fetch(remoteUrl, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.mkdirSync(IMAGE_DIR, { recursive: true });
      // Write via temp file + rename so a failed download never leaves a
      // truncated image in the cache.
      const tmpPath = `${filePath}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(tmpPath, buf);
      fs.renameSync(tmpPath, filePath);
    } catch {
      // Last-resort fallback so the UI still renders if the download fails.
      return NextResponse.redirect(remoteUrl, 302);
    }
  }

  const body = fs.readFileSync(filePath);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

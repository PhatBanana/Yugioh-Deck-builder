#!/usr/bin/env node
// The file-moving half of the scan-lab in/out workflow. Serves scan-lab.html
// over http://127.0.0.1 and exposes a tiny API the page uses to read the
// inbox and file scans into per-rarity folders. All image logic stays in the
// page — this server never decodes a pixel, so there is no third copy of the
// foil math to drift out of sync. Rarity names aren't known in advance (any
// catalog string is valid — "Ultra Rare", "Quarter Century Secret Rare",
// "Short Print"…), so sorted/ and confirmed/ subfolders are created on demand
// rather than from a fixed list.
//
//   node tools/scan-lab-server.mjs [--root <dir>] [--port 8787] [--no-open]
//
// Folder layout under --root (created on start):
//   in/                  ← point the scanner software's output here
//   sorted/<rarity>/     ← machine's best guess at the printed rarity
//   confirmed/<rarity>/  ← a human tag or a set-code catalog fact — trusted
//   review/              ← no confident guess, needs a box, or didn't decode
//   manifest.jsonl       ← append-only log of every move + its readings

import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(HERE, "scan-lab.html");

const TOP_DIRS = ["in", "review", "sorted", "confirmed"];
const IMAGE_EXT = /\.(png|jpe?g|bmp|tiff?|webp)$/i;
const MIME = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".bmp": "image/bmp", ".tif": "image/tiff", ".tiff": "image/tiff",
  ".webp": "image/webp",
};

// --- args -------------------------------------------------------------------
const args = process.argv.slice(2);
const argVal = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
};
const root = path.resolve(argVal("--root") ?? path.join(HERE, "..", "training", "dataset", "flatbed"));
const port = Number(argVal("--port")) || 8787;
const noOpen = args.includes("--no-open");

for (const d of TOP_DIRS) fs.mkdirSync(path.join(root, d), { recursive: true });

// --- helpers ----------------------------------------------------------------
const safeName = (n) =>
  typeof n === "string" && n.length > 0 && !/[/\\]/.test(n) && !n.includes("..");
// "in" and "review" are fixed; sorted/<rarity> and confirmed/<rarity> accept
// any single path segment — rarity strings come straight from the YGOPRODeck
// catalog and aren't known ahead of time.
function validDir(d) {
  if (d === "in" || d === "review") return true;
  const m = /^(sorted|confirmed)\/(.+)$/.exec(d ?? "");
  return !!m && safeName(m[2]);
}

function json(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 2 * 1024 * 1024) throw new Error("body too large");
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function listImages(dir) {
  const entries = await fsp.readdir(path.join(root, dir), { withFileTypes: true }).catch(() => []);
  const out = [];
  for (const e of entries) {
    if (!e.isFile() || !IMAGE_EXT.test(e.name)) continue;
    const st = await fsp.stat(path.join(root, dir, e.name)).catch(() => null);
    if (st) out.push({ name: e.name, size: st.size, mtimeMs: st.mtimeMs });
  }
  return out.sort((a, b) => a.mtimeMs - b.mtimeMs);
}

// Every distinct rarity folder under sorted/ or confirmed/.
async function subfolders(base) {
  const entries = await fsp.readdir(path.join(root, base), { withFileTypes: true }).catch(() => []);
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

// Move with collision-safe renaming; returns the final file name. rename()
// covers the normal case, copy+unlink covers a --root on another drive.
async function moveFile(fromDir, toDir, name) {
  await fsp.mkdir(path.join(root, toDir), { recursive: true }); // rarity folders are made on demand
  const src = path.join(root, fromDir, name);
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  let final = name;
  for (let i = 2; ; i++) {
    const dst = path.join(root, toDir, final);
    try {
      await fsp.access(dst);
      final = `${base}-${i}${ext}`; // exists — try the next suffix
    } catch {
      try {
        await fsp.rename(src, dst);
      } catch (err) {
        if (err.code !== "EXDEV") throw err;
        await fsp.copyFile(src, dst);
        await fsp.unlink(src);
      }
      return final;
    }
  }
}

// --- server -----------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  try {
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/scan-lab.html")) {
      const html = await fsp.readFile(PAGE);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(html);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/state") {
      // Files still being written by the scanner shouldn't be picked up —
      // only list inbox files whose mtime has settled.
      const now = Date.now();
      const inbox = (await listImages("in")).filter((f) => now - f.mtimeMs > 1500);
      const countAll = async (base) => {
        const out = {};
        for (const rarity of await subfolders(base)) {
          out[rarity] = (await listImages(`${base}/${rarity}`)).length;
        }
        return out;
      };
      const [sorted, confirmed, review] = await Promise.all([
        countAll("sorted"), countAll("confirmed"), listImages("review"),
      ]);
      json(res, 200, { root, inbox, counts: { sorted, confirmed, review: review.length } });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/file") {
      const dir = url.searchParams.get("dir");
      const name = url.searchParams.get("name");
      if (!validDir(dir) || !safeName(name)) return json(res, 400, { error: "bad path" });
      const file = path.join(root, dir, name);
      const st = await fsp.stat(file).catch(() => null);
      if (!st?.isFile()) return json(res, 404, { error: "not found" });
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(name).toLowerCase()] ?? "application/octet-stream",
        "Content-Length": st.size,
      });
      fs.createReadStream(file).pipe(res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/move") {
      const { name, from, to, entry } = await readBody(req);
      if (!validDir(from) || !validDir(to) || !safeName(name)) {
        return json(res, 400, { error: "bad move" });
      }
      const final = await moveFile(from, to, name);
      const line = { at: new Date().toISOString(), file: final, from, to, ...(entry ?? {}) };
      await fsp.appendFile(path.join(root, "manifest.jsonl"), JSON.stringify(line) + "\n");
      json(res, 200, { name: final });
      return;
    }

    json(res, 404, { error: "not found" });
  } catch (err) {
    json(res, 500, { error: err?.message ?? "server error" });
  }
});

server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(`Scan lab workspace: ${root}`);
  console.log(`  point the scanner software at: ${path.join(root, "in")}`);
  console.log(`  open: ${url}`);
  if (!noOpen) {
    const cmd =
      process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin" ? ["open", [url]]
      : ["xdg-open", [url]];
    spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true }).on("error", () => {});
  }
});

import { db } from "../db";

export function getSyncMeta(key: string): string | null {
  const row = db.prepare("SELECT value FROM sync_meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSyncMeta(key: string, value: string): void {
  db.prepare(
    `INSERT INTO sync_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

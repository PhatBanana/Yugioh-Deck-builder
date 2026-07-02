import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { DATA_DIR } from "./paths";
import { migrate } from "./db/migrate";

const DB_PATH = path.join(DATA_DIR, "app.db");

declare global {
  var __ygohDb: DatabaseSync | undefined;
}

function createConnection(): DatabaseSync {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const database = new DatabaseSync(DB_PATH);
  // `next build` collects page data in parallel workers that each open this
  // DB and run migrations — wait out brief write locks instead of failing.
  database.exec("PRAGMA busy_timeout = 10000;");
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");
  migrate(database);
  return database;
}

// Cache the connection on `global` so Next.js dev-server hot reloads don't
// open a new SQLite handle (and re-run migrations) on every module reload.
export const db: DatabaseSync = global.__ygohDb ?? createConnection();
if (process.env.NODE_ENV !== "production") {
  global.__ygohDb = db;
}

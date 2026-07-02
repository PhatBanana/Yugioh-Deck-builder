// Folds any pending WAL writes into the main .db file so a file-level copy
// of app.db alone (without app.db-wal) contains all data.
// Usage: node scripts/checkpoint-db.mjs <path-to-app.db>
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2];
if (!dbPath) {
  console.error("Usage: node checkpoint-db.mjs <path-to-app.db>");
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
db.close();
console.log("Checkpointed", dbPath);

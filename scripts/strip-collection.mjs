// Removes the personal collection from a copied app.db so a shared copy
// starts empty. Card catalog, images and meta decks are left intact.
// Usage: node scripts/strip-collection.mjs <path-to-app.db>
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2];
if (!dbPath) {
  console.error("Usage: node strip-collection.mjs <path-to-app.db>");
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
db.exec("DELETE FROM user_collection");
// Fold the WAL into the main file so the copy is a single clean .db
db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
db.close();
console.log("Collection cleared from", dbPath);

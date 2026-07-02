import { syncMetaDecks } from "../lib/sync/metaDecks";

async function main() {
  console.log("Syncing meta decks from YGOPRODeck...");
  const result = await syncMetaDecks();
  console.log(`Source: ${result.source}, decks stored: ${result.deckCount}`);
}

main().catch((err) => {
  console.error("Meta deck sync failed:", err);
  process.exit(1);
});

import { syncCards } from "../lib/sync/cards";

async function main() {
  const force = process.argv.includes("--force");
  console.log("Syncing card database from YGOPRODeck...");
  const result = await syncCards({ force });
  if (result.skipped) {
    console.log(`Skipped: already up to date (version ${result.databaseVersion}).`);
  } else {
    console.log(`Upserted ${result.cardsUpserted} cards (version ${result.databaseVersion}).`);
  }
}

main().catch((err) => {
  console.error("Card sync failed:", err);
  process.exit(1);
});

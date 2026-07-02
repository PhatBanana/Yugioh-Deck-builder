import path from "node:path";

// All app data (SQLite DB, cached card images, bundled deck snapshot) lives in
// one folder. In dev that's <project>/data; the portable launcher (launch.bat)
// sets YGOH_DATA_DIR to the folder next to itself, because the Next.js
// standalone server chdirs into .next/standalone and process.cwd() would
// otherwise point inside the build output.
export const DATA_DIR = process.env.YGOH_DATA_DIR ?? path.join(process.cwd(), "data");

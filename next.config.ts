import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces .next/standalone with a self-contained server.js + minimal
  // node_modules, so the app runs without `npm install` (see launch.bat).
  output: "standalone",
  // Don't let file tracing copy the SQLite DB / image cache into the build
  // output — the launcher points YGOH_DATA_DIR at the real ./data folder.
  outputFileTracingExcludes: { "*": ["./data/**"] },
};

export default nextConfig;

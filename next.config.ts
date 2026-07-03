import type { NextConfig } from "next";
import withPWA from "next-pwa";

const nextConfig: NextConfig = {
  // Produces .next/standalone with a self-contained server.js + minimal
  // node_modules, so the app runs without `npm install` (see launch.bat).
  output: "standalone",
  // Don't let file tracing copy the SQLite DB / image cache into the build
  // output — the launcher points YGOH_DATA_DIR at the real ./data folder.
  outputFileTracingExcludes: { "*": ["./data/**"] },

  // PWA configuration
  pwa: {
    dest: "public",
    disable: process.env.NODE_ENV === "development",
    register: true,
    skipWaiting: true,
  },

  // Turbopack must be explicitly enabled/disabled to avoid the default
  // webpack‑to‑Turbopack inference error.
  turbopack: {}
};

export default withPWA(nextConfig);
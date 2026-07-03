import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Core logic shared with the desktop app at the repo root.
      "@shared": path.resolve(__dirname, "../shared"),
      "@data": path.resolve(__dirname, "../data"),
    },
  },
  server: {
    fs: {
      // Allow importing ../shared and ../data from outside the vite root.
      allow: [path.resolve(__dirname, "..")],
    },
  },
});

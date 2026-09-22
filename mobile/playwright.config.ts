import { defineConfig, devices } from "@playwright/test";

// Headless smoke tests of the real app — the built bundle served by `vite
// preview`, with every network call answered from e2e/fixtures (see
// e2e/stubs.ts). They exist because the unit tests only reach `shared/`: the
// pages and sheets had no automated coverage at all, and device testing is
// the slow, scarce resource.
//
// Locally, point PW_CHROMIUM at an installed Chromium to skip the download;
// CI installs Playwright's own.
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    // A phone-shaped viewport: the app is designed for one, and the sheet
    // layout bugs we've hit (cut-off settings) only show at this width.
    ...devices["Pixel 7"],
    launchOptions: executablePath ? { executablePath } : {},
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

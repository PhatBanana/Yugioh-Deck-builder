import { defineConfig } from "vitest/config";

// The root suite is the unit tests for shared/, under tests/ — nothing else.
// Without this, vitest's default pattern also collects mobile/e2e/*.spec.ts:
// those are Playwright tests, and in CI's root-only install @playwright/test
// isn't present, so the whole unit job failed on import. (Locally it slipped
// through because mobile/node_modules happened to have it.)
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});

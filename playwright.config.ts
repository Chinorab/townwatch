import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3747",
    // A locally installed Chromium can be reused when the bundled build is missing.
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev -- --port 3747", url: "http://localhost:3747", reuseExistingServer: true, timeout: 120_000 },
});

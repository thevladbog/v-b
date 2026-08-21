import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "email-acceptance.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "../../.superpowers/sdd/2026-08-20-vbtech-contact-pipeline/task-7-playwright-results",
  use: {
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
  },
});

import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const baseURL = "http://127.0.0.1:43219";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/contact.spec.ts",
  outputDir: join(tmpdir(), "vbtech-contact-fixture-playwright"),
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  timeout: 30_000,
  expect: { timeout: 7_500 },
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "Desktop Chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "Pixel 7", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command:
      "corepack pnpm --dir ../../apps/web build:contact-fixture && corepack pnpm --dir ../../apps/web preview:contact-fixture",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});

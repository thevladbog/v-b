import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const baseURL = "http://127.0.0.1:43229";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/contact-active.spec.ts",
  outputDir: join(tmpdir(), "vbtech-contact-active-playwright"),
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
      "cd ../../apps/web && VBTECH_PRIVATE_ACTIVE_LEGAL_ARTIFACT=1 node_modules/.bin/astro build --config test-active/astro.config.mjs && VBTECH_PRIVATE_ACTIVE_LEGAL_ARTIFACT=1 node_modules/.bin/astro preview --config test-active/astro.config.mjs --host 127.0.0.1 --port 43229",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});

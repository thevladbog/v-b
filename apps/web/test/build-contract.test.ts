import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import config from "../astro.config.mjs";

describe("Astro build contract", () => {
  it("uses static output and the production site URL", async () => {
    const source = await readFile(new URL("../astro.config.mjs", import.meta.url), "utf8");
    expect(source).toContain('site: "https://v-b.tech"');
    expect(source).toContain('output: "static"');
  });

  it("defines a public client boolean contact flag that defaults false", () => {
    const field = config.env?.schema?.PUBLIC_CONTACT_SUBMISSION_ENABLED;

    expect(field).toMatchObject({
      type: "boolean",
      context: "client",
      access: "public",
      default: false,
    });
  });
});

describe("root acceptance gate contract", () => {
  it("runs the unit graph before the browser gate without a concurrent dist race", async () => {
    const rootPackage = JSON.parse(
      await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(rootPackage.scripts?.["test:unit"]).toBe(
      "turbo run test --filter='!@vbtech/browser'",
    );
    expect(rootPackage.scripts?.test).toBe(
      "corepack pnpm run test:unit && corepack pnpm --dir tools/browser test",
    );
  });

  it("keeps the browser core matrix on every HTML route, explicit theme, and WCAG 2.2", async () => {
    const source = await readFile(
      new URL("../../../tools/browser/tests/accessibility.spec.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain('const explicitThemes = ["light", "dark"] as const');
    expect(source).toContain("for (const path of allHtmlRoutes)");
    expect(source).toContain("for (const theme of explicitThemes)");
    expect(source).toContain('"wcag22a"');
    expect(source).toContain('"wcag22aa"');
    expect(source).toContain("assertSharedChromeStyles");
    expect(source).toContain("assertLocalRequests");
  });

  it("keeps enabled contact contours private, loopback-only, and outside deploy output", async () => {
    const [fixtureConfig, fixturePage, activeConfig, webPackage, browserPackage] = await Promise.all([
      readFile(new URL("../test-fixture/astro.config.mjs", import.meta.url), "utf8"),
      readFile(new URL("../test-fixture/src/FixturePage.astro", import.meta.url), "utf8"),
      readFile(new URL("../test-active/astro.config.mjs", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(new URL("../../../tools/browser/package.json", import.meta.url), "utf8"),
    ]);

    expect(fixtureConfig).toContain('process.env.VBTECH_INTERNAL_CONTACT_FIXTURE !== "1"');
    expect(fixtureConfig).toContain('outDir: join(tmpdir(), "vbtech-contact-fixture-dist")');
    expect(fixtureConfig).toContain('site: "http://127.0.0.1:43219"');
    expect(fixturePage).toContain('siteKey: "vbtech-internal-fixture-site-key"');
    expect(activeConfig).toContain('process.env.VBTECH_PRIVATE_ACTIVE_LEGAL_ARTIFACT !== "1"');
    expect(activeConfig).toContain('join(tmpdir(), "vbtech-contact-active-dist")');
    expect(activeConfig).toContain('const activeOrigin = "http://127.0.0.1:43229"');
    expect(activeConfig).toContain('String(config.site).replace(/\\/$/, "") !== activeOrigin');
    expect(JSON.parse(webPackage).scripts).toMatchObject({
      build: "astro build",
      "build:contact-fixture": "VBTECH_INTERNAL_CONTACT_FIXTURE=1 astro build --config test-fixture/astro.config.mjs",
      "build:contact-active": "VBTECH_PRIVATE_ACTIVE_LEGAL_ARTIFACT=1 astro build --config test-active/astro.config.mjs",
    });
    expect(JSON.parse(browserPackage).scripts.test).toBe(
      "playwright test --config playwright.config.ts && playwright test --config contact.playwright.config.ts && playwright test --config contact-active.playwright.config.ts",
    );
  });
});

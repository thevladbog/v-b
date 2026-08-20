import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  DRAFT_LEGAL_ROUTES,
  PUBLIC_ROUTES,
} from "../src/lib/route-inventory.js";

const readText = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const publicOrigin = "https://v-b.tech";
const expectedPublicRoutes = ["/", "/en/"] as const;
const expectedDraftLegalRoutes = [
  "/legal/",
  "/privacy/",
  "/personal-data-consent/",
  "/en/legal/",
  "/en/privacy/",
  "/en/personal-data-consent/",
] as const;

describe("public route inventory", () => {
  it("keeps one stable inventory of indexable routes", () => {
    expect(PUBLIC_ROUTES).toEqual(expectedPublicRoutes);
  });

  it("keeps reachable draft legal routes out of the indexable inventory", () => {
    expect(DRAFT_LEGAL_ROUTES).toEqual(expectedDraftLegalRoutes);
    expect(PUBLIC_ROUTES).not.toContain("/privacy/");
    expect(PUBLIC_ROUTES).not.toContain("/en/privacy/");
  });
});

describe("generated discovery artifacts", () => {
  it("publishes an exact robots policy with the canonical sitemap", async () => {
    await expect(readText("dist/robots.txt")).resolves.toBe(
      "User-agent: *\nAllow: /\nSitemap: https://v-b.tech/sitemap.xml\n",
    );
  });

  it("publishes only central indexable routes in stable sitemap order", async () => {
    const expectedLocations = expectedPublicRoutes
      .map((path) => `  <url><loc>${new URL(path, publicOrigin).toString()}</loc></url>`)
      .join("\n");

    await expect(readText("dist/sitemap.xml")).resolves.toBe(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${expectedLocations}\n</urlset>\n`,
    );
  });

  it("publishes bounded llms text from existing public claims and legal links", async () => {
    const text = await readText("dist/llms.txt");

    expect(text).toContain("# v-b.tech — Vlad Bogatyrev");
    expect(text).toContain("- Russian: https://v-b.tech/");
    expect(text).toContain("- English: https://v-b.tech/en/");
    expect(text).toContain("- Privacy draft: https://v-b.tech/privacy/");
    expect(text).toContain("- Personal data consent draft: https://v-b.tech/personal-data-consent/");
    expect(text).not.toMatch(/\/api\/contact|captcha|analytics|cookie/i);
  });

  it("does not leak draft, private, or nonexistent routes into the sitemap", async () => {
    const sitemap = await readText("dist/sitemap.xml");

    for (const route of expectedDraftLegalRoutes) {
      expect(sitemap).not.toContain(new URL(route, publicOrigin).toString());
    }
    expect(sitemap).not.toMatch(/\/api\/|\/admin\/|\/draft\/|\/404\/?</);
  });

  it("generates a noindex 404 artifact with useful localized links", async () => {
    const html = await readText("dist/404.html");

    expect(html).toContain('<meta name="robots" content="noindex,nofollow">');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/en/"');
    expect(html).toContain('href="/#contact"');
    expect(html).toContain('href="/en/#contact"');
  });
});

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  DRAFT_LEGAL_ROUTES,
  PUBLIC_ROUTES,
} from "../src/lib/route-inventory.js";
import { serializeLlmsText } from "../src/lib/llms.js";

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
const expectedLlmsText = `# v-b.tech — Vlad Bogatyrev

I design and build complex digital products from workflows and interfaces to infrastructure, launch, and production operations.

## Canonical pages

- Russian: https://v-b.tech/
- English: https://v-b.tech/en/

## Services

- Complete product: Discovery, workflows, interface, architecture, implementation, launch, and iteration.
- Complex web systems: Customer accounts, internal tools, real-time interfaces, and layered permissions.
- Offline-first: Local operation, sync queues, conflict resolution, and recovery.
- Hardware integration: Kiosks, scanners, printers, handheld terminals, displays, and desktop agents.
- Contracts and data: APIs, schemas, migrations, operational audit, and reproducible integrations.
- Production ownership: Observability, CI/CD, diagnosis, and treating failure as a designed scenario.

## Selected projects

- Markiro: Operations continue locally, conflicts stay visible, and reconnecting becomes a rehearsed recovery path. https://markiro.app
- Idento: The event team gets one coherent operating tool instead of a collection of utilities. https://github.com/thevladbog/idento
- QuokkaQ: The queue becomes a managed visitor experience and an operating system for the branch. https://github.com/thevladbog/quokkaq

## Legal drafts

- Legal register: https://v-b.tech/legal/
- Privacy draft: https://v-b.tech/privacy/
- Personal data consent draft: https://v-b.tech/personal-data-consent/
- English legal register: https://v-b.tech/en/legal/
- English privacy draft: https://v-b.tech/en/privacy/
- English personal data consent draft: https://v-b.tech/en/personal-data-consent/
`;

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

  it("publishes the complete bounded llms artifact in stable order", async () => {
    await expect(readText("dist/llms.txt")).resolves.toBe(expectedLlmsText);
  });

  it("serializes an independently supplied llms contract deterministically", () => {
    expect(
      serializeLlmsText({
        title: "Example",
        description: "Bounded description.",
        canonicalPages: [{ label: "Primary", href: "https://example.test/" }],
        services: [{ title: "Service", description: "Service description." }],
        projects: [{ name: "Project", outcome: "Project outcome.", href: "https://example.test/project" }],
        legalDrafts: [{ label: "Legal", href: "https://example.test/legal/" }],
      }),
    ).toBe(`# Example

Bounded description.

## Canonical pages

- Primary: https://example.test/

## Services

- Service: Service description.

## Selected projects

- Project: Project outcome. https://example.test/project

## Legal drafts

- Legal: https://example.test/legal/
`);
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
    const header = html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
    expect(header).toContain('href="/#work"');
    expect(header).toContain('href="/#expertise"');
    expect(header).toContain('href="/#approach"');
    expect(header).toContain('href="/#about"');
    expect(header).toContain('href="/#contact"');
    expect(header).not.toMatch(/href="#(?:work|expertise|approach|about|contact)"/);
  });
});

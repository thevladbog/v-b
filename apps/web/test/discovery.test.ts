import { readFile } from "node:fs/promises";
import { parse } from "parse5";
import { describe, expect, it } from "vitest";
import {
  DRAFT_LEGAL_ROUTES,
  PUBLIC_ROUTES,
  REACHABLE_HTML_ROUTES,
} from "../src/lib/route-inventory.js";
import { serializeLlmsText } from "../src/lib/llms.js";

const readText = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readBytes = (path: string) => readFile(new URL(`../${path}`, import.meta.url));
const charsetDeclaration = Buffer.from('<meta charset="utf-8">', "utf8");

const artifactPath = (route: string): string =>
  route === "/404.html" ? "dist/404.html" : `dist${route}index.html`;

const charsetDeclarationOffsets = (html: Buffer): number[] => {
  const offsets: number[] = [];
  let offset = html.indexOf(charsetDeclaration);
  while (offset !== -1) {
    offsets.push(offset);
    offset = html.indexOf(charsetDeclaration, offset + charsetDeclaration.byteLength);
  }
  return offsets;
};

interface HtmlNode {
  nodeName: string;
  tagName?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: HtmlNode[];
  value?: string;
}

const attr = (node: HtmlNode, name: string) =>
  node.attrs?.find((attribute) => attribute.name === name)?.value;

const findElement = (root: HtmlNode, predicate: (node: HtmlNode) => boolean): HtmlNode | undefined => {
  if (root.tagName && predicate(root)) return root;
  for (const child of root.childNodes ?? []) {
    const match = findElement(child, predicate);
    if (match) return match;
  }
  return undefined;
};

const inheritedLanguageOfText = (
  root: HtmlNode,
  needle: string,
  inheritedLanguage?: string,
): string | undefined => {
  let result: string | undefined;
  const visit = (node: HtmlNode, inheritedLanguage?: string): void => {
    if (result) return;
    const language = attr(node, "lang") ?? inheritedLanguage;
    if (node.nodeName === "#text" && node.value?.includes(needle)) {
      result = language;
      return;
    }
    node.childNodes?.forEach((child) => visit(child, language));
  };
  visit(root, inheritedLanguage);
  return result;
};

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

describe("generated HTML artifacts", () => {
  it.each([...REACHABLE_HTML_ROUTES, "/404.html"])(
    "declares one complete UTF-8 charset within the first 1024 bytes for %s",
    async (route) => {
      const html = await readBytes(artifactPath(route));
      const offsets = charsetDeclarationOffsets(html);

      expect(offsets).toHaveLength(1);
      expect(offsets[0]! + charsetDeclaration.byteLength).toBeLessThanOrEqual(1024);
    },
  );

  it("measures the charset boundary in UTF-8 bytes rather than JavaScript characters", () => {
    const prefix = "я".repeat(510);
    const fixture = Buffer.from(`${prefix}<meta charset="utf-8">`, "utf8");
    const characterEnd = prefix.length + '<meta charset="utf-8">'.length;
    const [byteOffset] = charsetDeclarationOffsets(fixture);

    expect(characterEnd).toBeLessThanOrEqual(1024);
    expect(byteOffset! + charsetDeclaration.byteLength).toBeGreaterThan(1024);
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
    const document = parse(html) as unknown as HtmlNode;
    const htmlElement = findElement(document, (node) => node.tagName === "html");
    const notFound = findElement(document, (node) => attr(node, "class")?.split(/\s+/).includes("not-found") ?? false);

    expect(html).toContain('<meta name="robots" content="noindex,nofollow">');
    expect(html).not.toContain('<link rel="canonical"');
    expect(html).not.toContain('<link rel="alternate"');
    expect(html).not.toContain('<meta property="og:url"');
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
    expect(attr(htmlElement!, "lang")).toBe("ru");
    expect(notFound).toBeDefined();
    const documentLanguage = attr(htmlElement!, "lang");
    expect(inheritedLanguageOfText(notFound!, "Страница не найдена.", documentLanguage)).toBe("ru");
    for (const englishText of [
      "not found",
      "Page not found.",
      "Check the address or return to a localized home page.",
      "English home",
      "Contact",
    ]) {
      expect(inheritedLanguageOfText(notFound!, englishText, documentLanguage), englishText).toBe("en");
    }
  });
});

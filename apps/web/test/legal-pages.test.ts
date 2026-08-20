import { readdir, readFile } from "node:fs/promises";
import { parse } from "parse5";
import { describe, expect, it } from "vitest";
import {
  listGeneratedLegalRoutes,
  validateLegalPageContract,
  type LegalPageContract,
} from "./helpers/legal-page-contract.js";

interface HtmlAttribute { name: string; value: string; }
interface HtmlNode {
  nodeName: string;
  tagName?: string;
  attrs?: HtmlAttribute[];
  childNodes?: HtmlNode[];
}

const pages = [
  {
    locale: "ru",
    route: "/legal/",
    file: "dist/legal/index.html",
    pair: "/en/legal/",
    pairFile: "dist/en/legal/index.html",
    title: "Правовые документы v-b.tech — проекты",
    description: "Реестр проектов документов v-b.tech: политика обработки персональных данных и согласие для будущей формы обращения.",
    identity: "VBT-PD-01/DRAFT",
    back: null,
  },
  {
    locale: "ru",
    route: "/privacy/",
    file: "dist/privacy/index.html",
    pair: "/en/privacy/",
    pairFile: "dist/en/privacy/index.html",
    title: "Политика обработки персональных данных — проект | v-b.tech",
    description: "Проект политики обработки персональных данных для узкой формы обращения на сайте v-b.tech; документ не вступил в силу.",
    identity: "VBT-PD-01/DRAFT",
    back: "/legal/",
  },
  {
    locale: "ru",
    route: "/personal-data-consent/",
    file: "dist/personal-data-consent/index.html",
    pair: "/en/personal-data-consent/",
    pairFile: "dist/en/personal-data-consent/index.html",
    title: "Согласие на обработку персональных данных — проект | v-b.tech",
    description: "Проект согласия для будущей формы обращения v-b.tech; принять его нельзя, онлайн-отправка отключена.",
    identity: "VBT-PD-02/DRAFT",
    back: "/legal/",
  },
  {
    locale: "en",
    route: "/en/legal/",
    file: "dist/en/legal/index.html",
    pair: "/legal/",
    pairFile: "dist/legal/index.html",
    title: "v-b.tech legal documents — drafts",
    description: "Register of v-b.tech draft documents: the personal data processing policy and consent for the future enquiry form.",
    identity: "VBT-PD-01/DRAFT",
    back: null,
  },
  {
    locale: "en",
    route: "/en/privacy/",
    file: "dist/en/privacy/index.html",
    pair: "/privacy/",
    pairFile: "dist/privacy/index.html",
    title: "Personal Data Processing Policy — Draft | v-b.tech",
    description: "Draft personal data processing policy for the narrow v-b.tech enquiry form; the document is not in force.",
    identity: "VBT-PD-01/DRAFT",
    back: "/en/legal/",
  },
  {
    locale: "en",
    route: "/en/personal-data-consent/",
    file: "dist/en/personal-data-consent/index.html",
    pair: "/personal-data-consent/",
    pairFile: "dist/personal-data-consent/index.html",
    title: "Consent to Personal Data Processing — Draft | v-b.tech",
    description: "Draft consent for the future v-b.tech enquiry form; it cannot be accepted while online submission is disabled.",
    identity: "VBT-PD-02/DRAFT",
    back: "/en/legal/",
  },
] as const;

const readBuilt = (file: string) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const attr = (node: HtmlNode, name: string) => node.attrs?.find((item) => item.name === name)?.value;
const elements = (root: HtmlNode, tag?: string): HtmlNode[] => {
  const found: HtmlNode[] = [];
  const visit = (node: HtmlNode) => {
    if (node.tagName && (!tag || node.tagName === tag)) found.push(node);
    node.childNodes?.forEach(visit);
  };
  visit(root);
  return found;
};
const text = (node: HtmlNode): string =>
  node.nodeName === "#text"
    ? (node as HtmlNode & { value?: string }).value ?? ""
    : (node.childNodes ?? []).map(text).join(" ").replace(/\s+/g, " ").trim();

const linkedStyles = async (html: string) => {
  const document = parse(html) as unknown as HtmlNode;
  const hrefs = elements(document, "link")
    .filter((node) => attr(node, "rel") === "stylesheet")
    .map((node) => attr(node, "href"))
    .filter((href): href is string => Boolean(href));
  return {
    hrefs,
    css: (await Promise.all(
      hrefs.map((href) => readFile(new URL(`../dist${href}`, import.meta.url), "utf8")),
    )).join("\n"),
  };
};

const DEVELOPER_HOME_PATH = /(?:\/Users\/[^/]+|\/home\/[^/]+|[A-Z]:\\Users\\[^\\]+)/i;
const TEXT_OUTPUT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".mjs", ".svg", ".txt", ".xml"]);

const listTextOutputFiles = async (directory: URL): Promise<URL[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const target = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) return listTextOutputFiles(target);
    const extension = entry.name.slice(entry.name.lastIndexOf("."));
    return TEXT_OUTPUT_EXTENSIONS.has(extension) ? [target] : [];
  }));
  return files.flat();
};

const fixtureContract: LegalPageContract = {
  locale: "ru",
  route: "/legal/",
  pairedRoute: "/en/legal/",
  title: "Правовые документы v-b.tech — проекты",
  description: "Описание проекта реестра.",
  draftBanner:
    "Проект. Документ не вступил в силу. Дата вступления в силу отсутствует. Отправка формы отключена.",
};

const validLegalFixture = `<!doctype html>
<html lang="ru">
  <head>
    <title>${fixtureContract.title}</title>
    <meta name="description" content="${fixtureContract.description}">
    <meta name="robots" content="noindex,nofollow">
    <link rel="canonical" href="https://v-b.tech/legal/">
    <link rel="alternate" hreflang="ru" href="https://v-b.tech/legal/">
    <link rel="alternate" hreflang="en" href="https://v-b.tech/en/legal/">
    <link rel="alternate" hreflang="x-default" href="https://v-b.tech/legal/">
  </head>
  <body>
    <nav class="locale-links" aria-label="Язык">
      <a href="/legal/" aria-current="page">RU</a>
      <a href="/en/legal/">EN</a>
    </nav>
    <main><aside class="legal-draft-banner">${fixtureContract.draftBanner}</aside><h1>Правовые документы</h1><p>Безопасный текст</p></main>
  </body>
</html>`;

describe("draft legal pages", () => {
  it("builds exactly the six canonical legal route files", async () => {
    const generatedRoutes = await listGeneratedLegalRoutes(new URL("../dist/", import.meta.url));
    expect(generatedRoutes).toEqual(pages.map(({ route }) => route).sort());
    expect(generatedRoutes).not.toContain("/");
    expect(generatedRoutes).not.toContain("/en/");
  });

  it("keeps generated text and client output free of developer-home absolute paths", async () => {
    const files = await listTextOutputFiles(new URL("../dist/", import.meta.url));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(await readFile(file, "utf8"), file.pathname).not.toMatch(DEVELOPER_HOME_PATH);
    }
  });

  it.each(pages)("renders metadata and draft boundary for $route", async (page) => {
    const html = await readBuilt(page.file);
    const document = parse(html) as unknown as HtmlNode;
    expect(validateLegalPageContract(html, {
      locale: page.locale,
      route: page.route,
      pairedRoute: page.pair,
      title: page.title,
      description: page.description,
      draftBanner:
        page.locale === "ru"
          ? "Проект. Документ не вступил в силу. Дата вступления в силу отсутствует. Отправка формы отключена."
          : "Draft. This document is not in force. No effective date. Submission is disabled.",
    })).toEqual([]);
    expect(text(document)).toContain(page.identity);
    expect(text(document)).toMatch(
      page.locale === "ru"
        ? /Проект.*не вступил в силу.*Дата вступления в силу отсутствует.*Отправка формы отключена/i
        : /Draft.*not in force.*No effective date.*Submission is disabled/i,
    );
    expect(html).toMatch(new RegExp(`<a[^>]+href="${page.pair.replaceAll("/", "\\/")}"[^>]*>\\s*(?:RU|EN)\\s*<\\/a>`));
    expect(await readBuilt(page.pairFile)).toBeTruthy();
  });

  it("accepts a complete reusable legal-page fixture", () => {
    expect(validateLegalPageContract(validLegalFixture, fixtureContract)).toEqual([]);
  });

  it.each([
    ["wrong canonical", validLegalFixture.replace("https://v-b.tech/legal/\">", "https://v-b.tech/wrong/\">"), /canonical/i],
    ["missing canonical", validLegalFixture.replace(/\s*<link rel="canonical"[^>]+>/, ""), /canonical/i],
    ["missing reciprocal alternate", validLegalFixture.replace(/\s*<link rel="alternate" hreflang="en"[^>]+>/, ""), /alternate.*en/i],
    ["wrong x-default", validLegalFixture.replace('hreflang="x-default" href="https://v-b.tech/legal/"', 'hreflang="x-default" href="https://v-b.tech/en/legal/"'), /x-default/i],
    ["missing noindex", validLegalFixture.replace(/\s*<meta name="robots"[^>]+>/, ""), /noindex/i],
    ["indexable robots", validLegalFixture.replace("noindex,nofollow", "index,follow"), /noindex/i],
    ["missing main", validLegalFixture.replace(/<main>[\s\S]*?<\/main>/, "<div><h1>Правовые документы</h1></div>"), /exactly one main/i],
    ["duplicate main", validLegalFixture.replace("</main>", "</main><main><p>duplicate</p></main>"), /exactly one main/i],
    ["missing h1", validLegalFixture.replace("<h1>Правовые документы</h1>", "<h2>Правовые документы</h2>"), /exactly one h1/i],
    ["duplicate h1", validLegalFixture.replace("</h1>", "</h1><h1>duplicate</h1>"), /exactly one h1/i],
    ["wrong paired locale href", validLegalFixture.replace('href="/en/legal/">EN', 'href="/en/">EN'), /paired locale/i],
    ["missing draft banner", validLegalFixture.replace(/<aside class="legal-draft-banner">[\s\S]*?<\/aside>/, ""), /draft banner/i],
    ["hidden draft banner", validLegalFixture.replace('class="legal-draft-banner"', 'class="legal-draft-banner" hidden'), /visible draft banner/i],
    ["unsafe script in legal main", validLegalFixture.replace("<p>Безопасный текст</p>", "<script>alert(1)</script>"), /unsafe legal markup/i],
    ["unsafe event handler", validLegalFixture.replace("<p>Безопасный текст</p>", '<p onclick="alert(1)">Безопасный текст</p>'), /unsafe legal markup/i],
  ])("rejects malformed fixture: %s", (_label, html, expected) => {
    expect(validateLegalPageContract(html, fixtureContract)).toEqual(
      expect.arrayContaining([expect.stringMatching(expected)]),
    );
  });

  it.each(pages.filter(({ back }) => back !== null))(
    "renders semantic typed document blocks for $route",
    async (page) => {
      const html = await readBuilt(page.file);
      const document = parse(html) as unknown as HtmlNode;
      expect(elements(document, "section").length).toBeGreaterThanOrEqual(6);
      expect(elements(document, "h2").length).toBeGreaterThanOrEqual(6);
      expect(elements(document, "ul").length + elements(document, "ol").length).toBeGreaterThan(0);
      if (page.route.includes("privacy")) expect(elements(document, "dl").length).toBeGreaterThan(0);
      expect(elements(document, "a").some((node) => attr(node, "href") === page.back)).toBe(true);
    },
  );

  it.each(pages.filter(({ back }) => back === null))(
    "lists both current draft candidates in $route",
    async ({ file, locale }) => {
      const html = await readBuilt(file);
      const document = parse(html) as unknown as HtmlNode;
      expect(text(document)).toContain("VBT-PD-01/DRAFT");
      expect(text(document)).toContain("VBT-PD-02/DRAFT");
      expect(text(document)).toMatch(locale === "ru" ? /Статус:\s*проект/i : /Status:\s*draft/i);
      const hrefs = elements(document, "a").map((node) => attr(node, "href"));
      expect(hrefs).toContain(locale === "ru" ? "/privacy/" : "/en/privacy/");
      expect(hrefs).toContain(locale === "ru" ? "/personal-data-consent/" : "/en/personal-data-consent/");
    },
  );

  it.each(pages)("uses localized home fragments and deterministic footer routes on $route", async (page) => {
    const html = await readBuilt(page.file);
    const home = page.locale === "ru" ? "/" : "/en/";
    for (const fragment of ["work", "expertise", "approach", "about", "contact"]) {
      expect(html).toContain(`href="${home}#${fragment}"`);
    }
    for (const route of page.locale === "ru"
      ? ["/legal/", "/privacy/", "/personal-data-consent/"]
      : ["/en/legal/", "/en/privacy/", "/en/personal-data-consent/"]) {
      expect(html).toContain(`href="${route}"`);
    }
  });

  it.each(pages)("loads shared site chrome without landing composition on $route", async (page) => {
    const html = await readBuilt(page.file);
    const document = parse(html) as unknown as HtmlNode;
    const { hrefs, css } = await linkedStyles(html);

    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.every((href) => href.startsWith("/"))).toBe(true);
    expect(css).toMatch(/@font-face/);
    for (const selector of [
      ".shell",
      ".skip-link",
      ".wordmark",
      ".site-header",
      ".site-navigation",
      ".locale-links",
      ".theme-control",
      ".site-footer",
      ".footer-grid",
      ".footer-legal",
      ".footer-actions",
      ".footer-bars",
    ]) {
      expect(css).toContain(selector);
    }
    for (const declaration of [
      /@font-face\{[^}]*font-family:IBM Plex Sans[^}]*url\(\/fonts\/ibm-plex-sans-latin1-400\.woff2\)/,
      /\.shell\{[^}]*width:min\(/,
      /\.skip-link\{[^}]*position:fixed/,
      /\.site-header\{[^}]*position:sticky/,
      /\.site-navigation[^{}]*\{[^}]*display:flex/,
      /\.locale-links[^{}]*\{[^}]*display:flex/,
      /\.theme-control button\{[^}]*min-height:2\.75rem/,
      /\.site-footer\{[^}]*border-top:/,
      /\.footer-grid\{[^}]*display:grid/,
    ]) {
      expect(css).toMatch(declaration);
    }
    for (const landingSelector of [
      ".hero-grid",
      ".signal-field",
      ".case-visual",
      ".expertise-grid",
      ".approach-list",
      ".contact-panel",
    ]) {
      expect(css).not.toContain(landingSelector);
    }
    const cssUrls = [...css.matchAll(/url\((?:"|')?([^"')]+)(?:"|')?\)/g)]
      .map((match) => match[1]!);
    expect(cssUrls.length).toBeGreaterThan(0);
    expect(cssUrls.every((url) => url.startsWith("/fonts/"))).toBe(true);

    const fetchedLinks = elements(document, "link").filter((node) =>
      ["stylesheet", "preload", "modulepreload"].includes(attr(node, "rel") ?? ""),
    );
    expect(fetchedLinks.every((node) => (attr(node, "href") ?? "").startsWith("/"))).toBe(true);
    expect(elements(document, "script")
      .map((node) => attr(node, "src"))
      .filter((src): src is string => Boolean(src))
      .every((src) => src.startsWith("/"))).toBe(true);
  });

  it("keeps shared chrome owned by BaseLayout and landing composition isolated", async () => {
    const [baseLayout, landingStyles] = await Promise.all([
      readFile(new URL("../src/layouts/BaseLayout.astro", import.meta.url), "utf8"),
      readFile(new URL("../src/styles/landing.css", import.meta.url), "utf8"),
    ]);
    expect(baseLayout).toContain('../styles/site-chrome.css');
    expect(landingStyles).not.toMatch(/@font-face|\.site-header|\.site-footer|\.skip-link/);
    expect(landingStyles).toMatch(/\.hero-grid|\.signal-field|\.case-visual/);
  });

  it("keeps both landing roots indexable with unchanged home locale links", async () => {
    for (const [file, pair] of [["dist/index.html", "/en/"], ["dist/en/index.html", "/"]] as const) {
      const html = await readBuilt(file);
      expect(html).not.toMatch(/<meta name="robots" content="[^"]*noindex/i);
      expect(html).toContain(`href="${pair}"`);
    }
  });

  it("renders legal blocks without raw HTML interpolation", async () => {
    const source = await readFile(new URL("../src/components/LegalDocument.astro", import.meta.url), "utf8");
    expect(source).not.toContain("set:html");
    expect(source).not.toContain("innerHTML");
  });
});

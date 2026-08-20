import { access, readFile } from "node:fs/promises";
import { parse } from "parse5";
import { describe, expect, it } from "vitest";

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

describe("draft legal pages", () => {
  it("builds exactly the six canonical legal route files", async () => {
    await Promise.all(pages.map(({ file }) => access(new URL(`../${file}`, import.meta.url))));
    expect(new Set(pages.map(({ route }) => route)).size).toBe(6);
    expect(new Set(pages.map(({ file }) => file).filter((file) => !file.includes("/legal/"))).size).toBe(4);
  });

  it.each(pages)("renders metadata and draft boundary for $route", async (page) => {
    const html = await readBuilt(page.file);
    const document = parse(html) as unknown as HtmlNode;
    expect(html).toContain(`<title>${page.title}</title>`);
    expect(html).toContain(`<meta name="description" content="${page.description}">`);
    expect(html).toContain(`<link rel="canonical" href="https://v-b.tech${page.route}">`);
    expect(html).toContain(`<link rel="alternate" hreflang="ru" href="https://v-b.tech${page.locale === "ru" ? page.route : page.pair}">`);
    expect(html).toContain(`<link rel="alternate" hreflang="en" href="https://v-b.tech${page.locale === "en" ? page.route : page.pair}">`);
    expect(html).toContain(`<link rel="alternate" hreflang="x-default" href="https://v-b.tech${page.locale === "ru" ? page.route : page.pair}">`);
    expect(html).toContain('<meta name="robots" content="noindex,nofollow">');
    expect(elements(document, "main")).toHaveLength(1);
    expect(elements(document, "h1")).toHaveLength(1);
    expect(text(document)).toContain(page.identity);
    expect(text(document)).toMatch(
      page.locale === "ru"
        ? /Проект.*не вступил в силу.*Дата вступления в силу отсутствует.*Отправка формы отключена/i
        : /Draft.*not in force.*No effective date.*Submission is disabled/i,
    );
    expect(html).toMatch(new RegExp(`<a[^>]+href="${page.pair.replaceAll("/", "\\/")}"[^>]*>\\s*(?:RU|EN)\\s*<\\/a>`));
    expect(await readBuilt(page.pairFile)).toBeTruthy();
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

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const productionOrigin = "https://v-b.tech";

const pages = [
  {
    locale: "ru",
    file: "dist/index.html",
    canonical: "https://v-b.tech/",
    languageHref: "/en/",
    title: "Влад Богатырев — продуктовый инженер полного цикла",
    description:
      "Проектирую и разрабатываю сложные цифровые продукты — от воркфлоу и интерфейса до инфраструктуры, запуска и эксплуатации.",
    personName: "Влад Богатырев",
    alternateName: "Vlad Bogatyrev",
    ogLocale: "ru_RU",
  },
  {
    locale: "en",
    file: "dist/en/index.html",
    canonical: "https://v-b.tech/en/",
    languageHref: "/",
    title: "Vlad Bogatyrev — End-to-End Product Engineer",
    description:
      "I design and build complex digital products from workflows and interfaces to infrastructure, launch, and production operations.",
    personName: "Vlad Bogatyrev",
    alternateName: "Влад Богатырев",
    ogLocale: "en_US",
  },
] as const;

const jsonLd = (html: string) => {
  const match = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
  );

  if (!match) {
    throw new Error("Missing Person JSON-LD");
  }

  return JSON.parse(match[1]) as Record<string, unknown>;
};

describe("production SEO", () => {
  it.each(pages)(
    "renders absolute canonical and reciprocal alternates for $locale",
    async ({ file, canonical }) => {
      const html = await readFile(new URL(`../${file}`, import.meta.url), "utf8");

      expect(html).toContain(`<link rel="canonical" href="${canonical}">`);
      expect(html).toContain(
        '<link rel="alternate" hreflang="ru" href="https://v-b.tech/">',
      );
      expect(html).toContain(
        '<link rel="alternate" hreflang="en" href="https://v-b.tech/en/">',
      );
      expect(html).toContain(
        '<link rel="alternate" hreflang="x-default" href="https://v-b.tech/">',
      );
      expect(html).not.toContain("localhost");
    },
  );

  it.each(pages)(
    "renders a localized ordinary language link for $locale",
    async ({ file, languageHref }) => {
      const html = await readFile(new URL(`../${file}`, import.meta.url), "utf8");

      expect(html).toMatch(
        new RegExp(`<a[^>]+href="${languageHref}"[^>]*>\\s*(?:RU|EN)\\s*</a>`),
      );
    },
  );

  it.each(pages)(
    "renders localized Open Graph, Twitter, and Person metadata for $locale",
    async ({
      file,
      canonical,
      title,
      description,
      personName,
      alternateName,
      ogLocale,
    }) => {
      const html = await readFile(new URL(`../${file}`, import.meta.url), "utf8");

      expect(html).toContain(`<meta property="og:type" content="website">`);
      expect(html).toContain(`<meta property="og:url" content="${canonical}">`);
      expect(html).toContain(`<meta property="og:title" content="${title}">`);
      expect(html).toContain(
        `<meta property="og:description" content="${description}">`,
      );
      expect(html).toContain(`<meta property="og:locale" content="${ogLocale}">`);
      expect(html).toContain('<meta name="twitter:card" content="summary">');
      expect(html).toContain(`<meta name="twitter:title" content="${title}">`);
      expect(html).toContain(
        `<meta name="twitter:description" content="${description}">`,
      );

      expect(jsonLd(html)).toMatchObject({
        "@context": "https://schema.org",
        "@type": "Person",
        name: personName,
        alternateName,
        url: productionOrigin,
        sameAs: ["https://github.com/thevladbog", "https://t.me/thevladbog"],
      });
    },
  );
});

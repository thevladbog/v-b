import { access, readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const pages = ["dist/index.html", "dist/en/index.html"] as const;
const caseIds = ["markiro", "idento", "quokkaq"] as const;
const sectionIds = ["work", "expertise", "approach", "about", "contact"] as const;
const contentOrder = [
  "hero",
  "proof",
  "work",
  "manifest",
  "expertise",
  "approach",
  "about",
  "contact",
] as const;
const fontFiles = [
  "ibm-plex-sans-latin1-400.woff2",
  "ibm-plex-sans-cyrillic-400.woff2",
  "ibm-plex-sans-latin1-600.woff2",
  "ibm-plex-sans-cyrillic-600.woff2",
  "ibm-plex-mono-latin1-500.woff2",
  "ibm-plex-mono-cyrillic-500.woff2",
] as const;

const readBuilt = (file: string) =>
  readFile(new URL(`../${file}`, import.meta.url), "utf8");

const attributeValues = (html: string, attribute: string) =>
  [...html.matchAll(new RegExp(`\\b${attribute}="([^"]+)"`, "g"))].map(
    (match) => match[1],
  );

describe("production landing structure", () => {
  it.each(pages)("renders the single-page semantic contract in %s", async (file) => {
    const html = await readBuilt(file);

    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(attributeValues(html, "data-case")).toEqual(caseIds);

    for (const id of caseIds) {
      const article = html.match(
        new RegExp(`<article[^>]+data-case="${id}"[\\s\\S]*?<\\/article>`),
      )?.[0];

      expect(article, `missing ${id} case article`).toBeDefined();
      expect(article).toMatch(/<dl\b[\s\S]*?<\/dl>/);
      expect(article?.match(/<dt\b/g)).toHaveLength(4);
      expect(article?.match(/<dd\b/g)).toHaveLength(4);
      expect(article).toMatch(
        /<figure[^>]+data-illustration[^>]*>[\s\S]*?<figcaption\b[^>]*>[\s\S]*?(?:illustration|иллюстрация)[\s\S]*?<\/figcaption>/i,
      );
    }
  });

  it.each(pages)("keeps stable unique anchors and approved order in %s", async (file) => {
    const html = await readBuilt(file);
    const ids = attributeValues(html, "id");

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of sectionIds) {
      expect(html).toMatch(new RegExp(`<section[^>]+id="${id}"`));
    }

    const positions = contentOrder.map((section) =>
      html.indexOf(`data-section="${section}"`),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it.each(pages)("uses only local production assets in %s", async (file) => {
    const html = await readBuilt(file);
    const remoteAsset =
      /<(?:img|script)[^>]+src="https?:\/\/[^\"]+"|<link[^>]+rel="(?:stylesheet|preload|icon)"[^>]+href="https?:\/\/[^\"]+"|url\(["']?https?:\/\//i;

    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/i);
    expect(html).not.toMatch(remoteAsset);

    for (const asset of attributeValues(html, "src").filter((value) =>
      value.startsWith("/assets/") && value.endsWith(".svg"),
    )) {
      await expect(access(new URL(`../dist${asset}`, import.meta.url))).resolves.toBeUndefined();
    }
  });
});

describe("self-hosted font contract", () => {
  it("ships the official license and exact Latin/Cyrillic WOFF2 set", async () => {
    const fontDirectory = new URL("../public/fonts/", import.meta.url);
    const shipped = (await readdir(fontDirectory)).sort();

    expect(shipped).toEqual([...fontFiles, "OFL.txt"].sort());
    await expect(access(new URL("OFL.txt", fontDirectory))).resolves.toBeUndefined();
  });

  it("declares only used weights with swap and no remote CSS assets", async () => {
    const cssDirectory = new URL("../dist/_astro/", import.meta.url);
    const cssFiles = (await readdir(cssDirectory)).filter((file) => file.endsWith(".css"));
    const css = (
      await Promise.all(cssFiles.map((file) => readFile(new URL(file, cssDirectory), "utf8")))
    ).join("\n");
    const faces = [...css.matchAll(/@font-face\s*{([^}]+)}/g)].map((match) => match[1]);

    expect(faces).toHaveLength(fontFiles.length);
    expect(faces.every((face) => /font-display:\s*swap/.test(face))).toBe(true);
    expect(
      faces.map((face) => face.match(/font-weight:\s*(\d+)/)?.[1]).sort(),
    ).toEqual(["400", "400", "500", "500", "600", "600"]);
    for (const font of fontFiles) {
      expect(css).toContain(`/fonts/${font}`);
    }
    expect(css).not.toMatch(/url\(["']?https?:\/\//i);
  });

  it.each(pages)("preloads the primary Latin and Cyrillic body fonts in %s", async (file) => {
    const html = await readBuilt(file);

    for (const font of fontFiles.slice(0, 2)) {
      expect(html).toMatch(
        new RegExp(
          `<link[^>]+rel="preload"[^>]+href="/fonts/${font}"[^>]+as="font"[^>]+type="font/woff2"[^>]+crossorigin`,
        ),
      );
    }
  });
});

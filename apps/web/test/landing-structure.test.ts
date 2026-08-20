import { access, readFile, readdir } from "node:fs/promises";
import { parse } from "parse5";
import { describe, expect, it } from "vitest";

interface HtmlAttribute {
  name: string;
  value: string;
  prefix?: string;
}

interface HtmlNode {
  nodeName: string;
  tagName?: string;
  namespaceURI?: string;
  attrs?: HtmlAttribute[];
  childNodes?: HtmlNode[];
  parentNode?: HtmlNode;
}

const pages = [
  {
    file: "dist/index.html",
    locale: "ru",
    signature: "Влад Богатырев — продуктовая инженерия и эксплуатация",
    newTabDisclosure: "откроется в новой вкладке",
    newTabLabel: "Написать Владу в Telegram (откроется в новой вкладке)",
    pathname: "/",
    cyrillicPreload: true,
  },
  {
    file: "dist/en/index.html",
    locale: "en",
    signature: "Vlad Bogatyrev — product engineering and operations",
    newTabDisclosure: "opens in a new tab",
    newTabLabel: "Message Vlad on Telegram (opens in a new tab)",
    pathname: "/en/",
    cyrillicPreload: false,
  },
] as const;
const caseIds = ["markiro", "idento", "quokkaq"] as const;
const caseNumbers = ["case-001", "case-002", "case-003"] as const;
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

const readBuiltCss = async () => {
  const directory = new URL("../dist/_astro/", import.meta.url);
  const files = (await readdir(directory)).filter((file) => file.endsWith(".css"));
  return (
    await Promise.all(files.map((file) => readFile(new URL(file, directory), "utf8")))
  ).join("\n");
};

const documentFor = (html: string) => parse(html) as unknown as HtmlNode;

const elements = (
  root: HtmlNode,
  predicate: (node: HtmlNode) => boolean = () => true,
): HtmlNode[] => {
  const found: HtmlNode[] = [];
  const visit = (node: HtmlNode) => {
    if (node.tagName && predicate(node)) found.push(node);
    node.childNodes?.forEach(visit);
  };
  visit(root);
  return found;
};

const descendants = (root: HtmlNode, tagName?: string) =>
  elements(root, (node) => !tagName || node.tagName === tagName);

const attr = (node: HtmlNode, name: string) => {
  const [prefix, localName] = name.includes(":") ? name.split(":", 2) : [];
  return node.attrs?.find((attribute) =>
    attribute.name === name ||
    (prefix && attribute.prefix === prefix && attribute.name === localName)
  )?.value;
};

const text = (node: HtmlNode): string =>
  node.nodeName === "#text"
    ? (node as HtmlNode & { value?: string }).value ?? ""
    : (node.childNodes ?? []).map(text).join("").replace(/\s+/g, " ").trim();

const accessibleText = (node: HtmlNode): string =>
  attr(node, "aria-hidden") === "true"
    ? ""
    : node.nodeName === "#text"
      ? (node as HtmlNode & { value?: string }).value ?? ""
      : (node.childNodes ?? []).map(accessibleText).join(" ").replace(/\s+/g, " ").trim();

const normalizedText = (value: string) => value.replace(/\s+/g, " ").trim();

const effectiveAccessibleName = (
  document: HtmlNode,
  node: HtmlNode,
  visited: ReadonlySet<HtmlNode> = new Set(),
): string => {
  if (visited.has(node)) return "";
  const activePath = new Set(visited).add(node);
  const labelledBy = attr(node, "aria-labelledby")?.trim().split(/\s+/).filter(Boolean) ?? [];
  const referenced = labelledBy.flatMap((id) =>
    elements(document, (candidate) => attr(candidate, "id") === id)
  );
  if (referenced.length > 0) {
    return normalizedText(
      referenced.map((candidate) =>
        effectiveAccessibleName(document, candidate, activePath)
      ).join(" "),
    );
  }

  const ariaLabel = attr(node, "aria-label");
  if (ariaLabel?.trim()) return normalizedText(ariaLabel);
  return normalizedText(accessibleText(node));
};

const isEffectivelyHidden = (node: HtmlNode) => {
  for (let current: HtmlNode | undefined = node; current; current = current.parentNode) {
    if (attr(current, "aria-hidden")?.trim().toLowerCase() === "true") return true;
    if (attr(current, "hidden") !== undefined || attr(current, "inert") !== undefined) return true;
    const style = attr(current, "style") ?? "";
    if (/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i.test(style)) {
      return true;
    }
  }
  return false;
};

const visibleText = (node: HtmlNode): string => {
  if (isEffectivelyHidden(node)) return "";
  if (node.nodeName === "#text") {
    return (node as HtmlNode & { value?: string }).value ?? "";
  }
  return normalizedText((node.childNodes ?? []).map(visibleText).join(" "));
};

const elementById = (document: HtmlNode, id: string) =>
  elements(document, (node) => attr(node, "id") === id)[0];

const cssDeclaration = (css: string, selector: string, property: string) => {
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)}/g)) {
    if (!match[1].split(",").map((item) => item.trim()).includes(selector)) continue;
    const declaration = match[2]
      .split(";")
      .map((item) => item.split(/:(.*)/s))
      .find(([name]) => name?.trim() === property);
    if (declaration) return declaration[1]?.trim();
  }
  return undefined;
};

const relativeLuminance = (hex: string) => {
  const channels = hex
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );
  if (!channels || channels.length !== 3) throw new Error(`Invalid hex color: ${hex}`);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrastRatio = (first: string, second: string) => {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
};

const rootTokenSets = (css: string) => {
  const sets = new Map<string, Map<string, string>>();
  for (const match of css.matchAll(/(:root(?:\[data-theme="dark"\])?)\s*\{([^}]*)}/g)) {
    const tokens = new Map<string, string>();
    for (const declaration of match[2].split(";")) {
      const [name, value] = declaration.split(/:(.*)/s);
      if (name?.trim().startsWith("--") && value) tokens.set(name.trim(), value.trim());
    }
    sets.set(match[1], tokens);
  }
  return sets;
};

const quotedCssValue = (css: string, quoteIndex: number) => {
  const quote = css[quoteIndex];
  let value = "";
  for (let index = quoteIndex + 1; index < css.length; index += 1) {
    if (css[index] === "\\" && index + 1 < css.length) {
      value += css[index] + css[index + 1];
      index += 1;
      continue;
    }
    if (css[index] === quote) return { end: index + 1, value };
    value += css[index];
  }
  return undefined;
};

const cssAssetUrls = (css: string) => {
  const urls: string[] = [];
  const commentEnd = (index: number) => {
    const end = css.indexOf("*/", index + 2);
    return end < 0 ? css.length : end + 2;
  };
  const skipTrivia = (start: number) => {
    let index = start;
    while (index < css.length) {
      if (/\s/.test(css[index] ?? "")) {
        index += 1;
        continue;
      }
      if (css.startsWith("/*", index)) {
        index = commentEnd(index);
        continue;
      }
      break;
    }
    return index;
  };
  const urlFunction = (start: number) => {
    if (css.slice(start, start + 3).toLowerCase() !== "url") return undefined;
    if (start > 0 && /[\w-]/.test(css[start - 1])) return undefined;
    let index = skipTrivia(start + 3);
    if (css[index] !== "(") return undefined;
    index = skipTrivia(index + 1);
    if (css[index] === '"' || css[index] === "'") {
      const quoted = quotedCssValue(css, index);
      if (!quoted) return undefined;
      index = skipTrivia(quoted.end);
      if (css[index] !== ")") return undefined;
      return { end: index + 1, value: quoted.value.trim() };
    }
    const close = css.indexOf(")", index);
    if (close < 0) return undefined;
    return { end: close + 1, value: css.slice(index, close).trim() };
  };

  for (let index = 0; index < css.length;) {
    if (css.startsWith("/*", index)) {
      index = commentEnd(index);
      continue;
    }
    if (css[index] === '"' || css[index] === "'") {
      index = quotedCssValue(css, index)?.end ?? css.length;
      continue;
    }
    if (
      css.slice(index, index + 7).toLowerCase() === "@import" &&
      !/[\w-]/.test(css[index + 7] ?? "")
    ) {
      const valueStart = skipTrivia(index + 7);
      const importedUrl = urlFunction(valueStart);
      if (importedUrl) {
        if (importedUrl.value) urls.push(importedUrl.value);
        index = importedUrl.end;
        continue;
      }
      if (css[valueStart] === '"' || css[valueStart] === "'") {
        const quoted = quotedCssValue(css, valueStart);
        if (quoted?.value.trim()) urls.push(quoted.value.trim());
        index = quoted?.end ?? css.length;
        continue;
      }
    }
    const fetchedUrl = urlFunction(index);
    if (fetchedUrl) {
      if (fetchedUrl.value) urls.push(fetchedUrl.value);
      index = fetchedUrl.end;
      continue;
    }
    index += 1;
  }
  return urls;
};

const assetUrls = (document: HtmlNode) => {
  const urls: string[] = [];
  const pushUrl = (value: string | undefined) => {
    const normalized = value?.trim();
    if (normalized) urls.push(normalized);
  };
  const srcElements = new Set([
    "audio", "embed", "iframe", "img", "input", "script", "source", "track", "video",
  ]);
  const assetLinkRels = new Set([
    "apple-touch-icon", "dns-prefetch", "icon", "manifest", "mask-icon", "modulepreload",
    "preconnect", "prefetch", "preload", "prerender", "stylesheet",
  ]);
  const svgPresentationUrlAttributes = [
    "filter", "mask", "clip-path", "fill", "stroke", "marker-start", "marker-mid",
    "marker-end", "cursor",
  ] as const;

  for (const node of elements(document)) {
    const tagName = node.tagName?.toLowerCase() ?? "";
    if (srcElements.has(tagName)) {
      pushUrl(attr(node, "src"));
    }
    for (const responsiveSource of [attr(node, "srcset"), attr(node, "imagesrcset")]) {
      if (responsiveSource) {
        for (const item of responsiveSource.split(",")) pushUrl(item.trim().split(/\s+/)[0]);
      }
    }
    if (tagName === "video") {
      pushUrl(attr(node, "poster"));
    }
    if (tagName === "object") {
      pushUrl(attr(node, "data"));
    }
    if (tagName === "link") {
      const relations = new Set((attr(node, "rel") ?? "").toLowerCase().split(/\s+/));
      const href = attr(node, "href");
      if ([...relations].some((relation) => assetLinkRels.has(relation))) pushUrl(href);
    }
    if (node.namespaceURI === "http://www.w3.org/2000/svg" && tagName !== "a") {
      const href = attr(node, "href") ?? attr(node, "xlink:href");
      pushUrl(href);
      for (const attributeName of svgPresentationUrlAttributes) {
        const value = attr(node, attributeName);
        if (value) urls.push(...cssAssetUrls(value));
      }
    }
    const style = attr(node, "style");
    if (style) urls.push(...cssAssetUrls(style));
  }

  for (const style of elements(document, (node) => node.tagName === "style")) {
    urls.push(...cssAssetUrls(text(style)));
  }
  return urls;
};

type PageLocale = (typeof pages)[number]["locale"];

const sameDocumentFragmentProblems = (document: HtmlNode, pathname: string) => {
  const baseUrl = new URL(pathname, "https://v-b.tech");
  const targets = new Map<string, number>();
  for (const node of elements(document)) {
    const id = attr(node, "id");
    if (id !== undefined) targets.set(id, (targets.get(id) ?? 0) + 1);
  }

  const problems: string[] = [];
  for (const anchor of elements(document, (node) => node.tagName === "a")) {
    const href = attr(anchor, "href");
    if (!href?.includes("#")) continue;

    let destination: URL;
    try {
      destination = new URL(href, baseUrl);
    } catch {
      problems.push(`${href}: invalid same-document URL`);
      continue;
    }
    if (
      destination.origin !== baseUrl.origin ||
      destination.pathname !== baseUrl.pathname ||
      destination.search !== baseUrl.search
    ) continue;

    const rawFragment = href.slice(href.indexOf("#"));
    let id: string;
    try {
      id = decodeURIComponent(rawFragment.slice(1));
    } catch {
      problems.push(`${rawFragment}: invalid fragment encoding`);
      continue;
    }
    const matches = targets.get(id) ?? 0;
    if (matches === 0) problems.push(`${rawFragment}: missing target`);
    if (matches > 1) problems.push(`${rawFragment}: ambiguous target (${matches} matches)`);
  }
  return problems;
};

const figureContracts = {
  ru: {
    markiro: {
      label: "Markiro — иллюстрация концепции продуктового интерфейса",
      disclosure: "иллюстрация / концепция, не снимок продукта",
    },
    idento: {
      label: "Idento — иллюстрация концепции продуктового интерфейса",
      disclosure: "иллюстрация / концепция, не снимок продукта",
    },
    quokkaq: {
      label: "QuokkaQ — иллюстрация концепции продуктового интерфейса",
      disclosure: "иллюстрация / концепция, не снимок продукта",
    },
  },
  en: {
    markiro: {
      label: "Markiro — product interface concept illustration",
      disclosure: "illustration / concept, not a product capture",
    },
    idento: {
      label: "Idento — product interface concept illustration",
      disclosure: "illustration / concept, not a product capture",
    },
    quokkaq: {
      label: "QuokkaQ — product interface concept illustration",
      disclosure: "illustration / concept, not a product capture",
    },
  },
} as const;

const figureContractProblems = (document: HtmlNode, locale: PageLocale) => {
  const problems: string[] = [];
  const articles = elements(document, (node) =>
    node.tagName === "article" && Boolean(attr(node, "data-case"))
  );
  for (const article of articles) {
    const caseId = attr(article, "data-case") as keyof typeof figureContracts[PageLocale];
    const expected = figureContracts[locale][caseId];
    if (!expected) continue;
    const figure = descendants(article, "figure")[0];
    const roles = new Set(
      (figure && attr(figure, "role")?.trim().toLowerCase().split(/\s+/)) || [],
    );
    if (
      !figure ||
      isEffectivelyHidden(figure) ||
      roles.has("none") ||
      roles.has("presentation")
    ) {
      problems.push(`${caseId}: figure is effectively hidden or presentational`);
    }
    if (!figure || effectiveAccessibleName(document, figure) !== expected.label) {
      problems.push(`${caseId}: accessible figure label is not exact`);
    }
    const caption = figure && descendants(figure, "figcaption")[0];
    const disclosureNodes = caption
      ? [caption, ...descendants(caption)].filter((node) =>
          !isEffectivelyHidden(node) && normalizedText(visibleText(node)) === expected.disclosure
        )
      : [];
    if (!caption || isEffectivelyHidden(caption) || disclosureNodes.length === 0) {
      problems.push(`${caseId}: visible disclosure is not exact`);
    }
  }
  return problems;
};

const browsingContextProblems = (document: HtmlNode, locale: PageLocale) => {
  const disclosure = pages.find((page) => page.locale === locale)?.newTabDisclosure ?? "";
  const problems: string[] = [];
  const targetElements = new Set(["a", "area", "base", "form"]);
  for (const link of elements(document, (node) =>
    targetElements.has(node.tagName ?? "") && attr(node, "target") !== undefined
  )) {
    const tagName = link.tagName ?? "";
    const target = attr(link, "target") ?? "";
    const targetKeyword = target.toLowerCase();
    const visiblePurpose = normalizedText(accessibleText(link));
    const destination = (tagName === "form" ? attr(link, "action") : attr(link, "href"))?.trim();
    const identifier = tagName === "a"
      ? visiblePurpose || destination || "unnamed link"
      : `${tagName} ${destination || "(no destination)"}`;
    if (target !== target.trim()) {
      problems.push(`${identifier}: target has leading or trailing whitespace`);
      continue;
    }
    if (targetKeyword === "_self") continue;
    if (tagName !== "a" || targetKeyword !== "_blank") {
      problems.push(`${identifier}: target ${target || "(empty)"} opens an unsupported browsing context`);
      continue;
    }

    const relTokens = (attr(link, "rel") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => token.toLowerCase())
      .sort();
    if (relTokens.join(" ") !== "noopener noreferrer") {
      problems.push(`${identifier}: new-tab rel must be exactly noopener noreferrer`);
    }
    const label = effectiveAccessibleName(document, link);
    if (!label.toLocaleLowerCase(locale).includes(disclosure.toLocaleLowerCase(locale))) {
      problems.push(`${identifier}: new-tab label lacks localized disclosure`);
      continue;
    }
    const purpose = label.toLocaleLowerCase(locale)
      .replace(disclosure.toLocaleLowerCase(locale), "")
      .replace(/[\s()[\].,:;—–-]+/g, "")
      .trim();
    const visibleTokens = visiblePurpose.toLocaleLowerCase(locale)
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((token) => token.length >= 3) ?? [];
    const normalizedLabel = label.toLocaleLowerCase(locale);
    if (!purpose || (visibleTokens.length > 0 && !visibleTokens.some((token) => normalizedLabel.includes(token)))) {
      problems.push(`${identifier}: new-tab label does not include its purpose`);
    }
  }
  return problems;
};

const productionOrigin = "https://v-b.tech";

const remoteAssetProblems = (document: HtmlNode, css: string, pathname: string) => {
  const canonicalBase = new URL(pathname, productionOrigin);
  const problems: string[] = [];
  let effectiveBase = canonicalBase;
  const bases = elements(document, (node) =>
    node.tagName === "base" && Boolean(attr(node, "href")?.trim())
  );
  bases.forEach((base, index) => {
    const href = attr(base, "href")?.trim() ?? "";
    let resolved: URL;
    try {
      resolved = new URL(href, canonicalBase);
    } catch {
      problems.push(`base href ${href}: is invalid`);
      return;
    }
    if (index === 0) effectiveBase = resolved;
    if (resolved.origin !== canonicalBase.origin) {
      problems.push(`base href ${resolved.href}: resolves outside ${canonicalBase.origin}`);
    }
  });

  const inspect = (rawValue: string, base: URL) => {
    const value = rawValue.trim();
    if (!value) return;
    let resolved: URL;
    try {
      resolved = new URL(value, base);
    } catch {
      problems.push(`${value}: is not a valid asset URL`);
      return;
    }
    const hostname = resolved.hostname.replace(/\.$/, "");
    if (["fonts.googleapis.com", "fonts.gstatic.com"].includes(hostname)) {
      problems.push(`${value}: Google Fonts fetch host is forbidden`);
      return;
    }
    if (["http:", "https:"].includes(resolved.protocol) && resolved.origin !== canonicalBase.origin) {
      problems.push(`${value}: resolves to remote asset ${resolved.href}`);
    }
  };

  for (const url of assetUrls(document)) inspect(url, effectiveBase);
  for (const url of cssAssetUrls(css)) inspect(url, canonicalBase);
  return problems;
};

describe("negative structural guard fixtures", () => {
  it("catches unresolved and ambiguous fragments outside the header", () => {
    const document = documentFor(`
      <header><a href="#work">Work</a></header>
      <main><a href="#missing">Missing CTA</a><a href="#duplicate">Ambiguous CTA</a></main>
      <section id="work"></section><div id="duplicate"></div><div id="duplicate"></div>
    `);

    expect(sameDocumentFragmentProblems(document, "/")).toEqual([
      "#missing: missing target",
      "#duplicate: ambiguous target (2 matches)",
    ]);
  });

  it("catches a wrong case name and an extended disclosure substring", () => {
    const document = documentFor(`
      <article data-case="markiro">
        <figure aria-label="Wrong product — product interface concept illustration">
          <figcaption><span>markiro · v-b.tech</span><span>illustration / concept, not a product capture eventually</span></figcaption>
        </figure>
      </article>
    `);

    expect(figureContractProblems(document, "en")).toEqual([
      "markiro: accessible figure label is not exact",
      "markiro: visible disclosure is not exact",
    ]);
  });

  it("uses aria-labelledby before aria-label for the effective figure name", () => {
    const document = documentFor(`
      <article data-case="markiro">
        <span id="wrong-figure-name">Wrong figure name</span>
        <figure aria-labelledby="wrong-figure-name" aria-label="Markiro — product interface concept illustration">
          <figcaption><span>illustration / concept, not a product capture</span></figcaption>
        </figure>
      </article>
    `);

    expect(figureContractProblems(document, "en")).toEqual([
      "markiro: accessible figure label is not exact",
    ]);
  });

  it("recursively resolves aria-labelledby overrides for the effective figure name", () => {
    const document = documentFor(`
      <article data-case="markiro">
        <span id="figure-name" aria-label="Wrong effective figure name">Markiro — product interface concept illustration</span>
        <figure aria-labelledby="figure-name">
          <figcaption><span>illustration / concept, not a product capture</span></figcaption>
        </figure>
      </article>
    `);

    expect(figureContractProblems(document, "en")).toEqual([
      "markiro: accessible figure label is not exact",
    ]);
  });

  it("protects recursive aria-labelledby resolution from cycles", () => {
    const document = documentFor(`
      <article data-case="markiro">
        <span id="figure-name" aria-labelledby="figure-name-override">Markiro — product interface concept illustration</span>
        <span id="figure-name-override" aria-labelledby="figure-name" aria-label="Wrong cycle name">Wrong cycle name</span>
        <figure aria-labelledby="figure-name">
          <figcaption><span>illustration / concept, not a product capture</span></figcaption>
        </figure>
      </article>
    `);

    expect(figureContractProblems(document, "en")).toEqual([
      "markiro: accessible figure label is not exact",
    ]);
  });

  it("rejects a presentational figure even when its label and caption match", () => {
    const document = documentFor(`
      <article data-case="markiro">
        <figure role="presentation" aria-label="Markiro — product interface concept illustration">
          <figcaption><span>illustration / concept, not a product capture</span></figcaption>
        </figure>
      </article>
    `);

    expect(figureContractProblems(document, "en")).toEqual([
      "markiro: figure is effectively hidden or presentational",
    ]);
  });

  it("rejects a matching disclosure under a hidden ancestor", () => {
    const document = documentFor(`
      <article data-case="markiro">
        <figure aria-label="Markiro — product interface concept illustration">
          <div inert><figcaption><span>illustration / concept, not a product capture</span></figcaption></div>
        </figure>
      </article>
    `);

    expect(figureContractProblems(document, "en")).toEqual([
      "markiro: visible disclosure is not exact",
    ]);
  });

  it("rejects a disclosure that exists only in a hidden figcaption descendant", () => {
    const document = documentFor(`
      <article data-case="markiro">
        <figure aria-label="Markiro — product interface concept illustration">
          <figcaption><span hidden>illustration / concept, not a product capture</span><span aria-hidden="true"></span></figcaption>
        </figure>
      </article>
    `);

    expect(figureContractProblems(document, "en")).toEqual([
      "markiro: visible disclosure is not exact",
    ]);
  });

  it("catches named targets and disclosure-only blank-link labels", () => {
    const document = documentFor(`
      <a href="/report" target="report-window">Download report</a>
      <a href="https://example.com/contact" target="_blank" rel="noopener noreferrer" aria-label="opens in a new tab">Contact team</a>
    `);

    expect(browsingContextProblems(document, "en")).toEqual([
      "Download report: target report-window opens an unsupported browsing context",
      "Contact team: new-tab label does not include its purpose",
    ]);
  });

  it("rejects non-self targets on area, form, and base", () => {
    const document = documentFor(`
      <map><area href="/map" alt="Map area" target="map-window"></map>
      <form action="/search" target="_parent"></form>
      <base href="/" target="_blank">
    `);

    expect(browsingContextProblems(document, "en")).toEqual([
      "area /map: target map-window opens an unsupported browsing context",
      "form /search: target _parent opens an unsupported browsing context",
      "base /: target _blank opens an unsupported browsing context",
    ]);
  });

  it("uses aria-labelledby before aria-label for new-tab purpose", () => {
    const document = documentFor(`
      <span id="disclosure-only">opens in a new tab</span>
      <a href="https://example.com/contact" target="_blank" rel="noopener noreferrer"
        aria-labelledby="disclosure-only" aria-label="Contact team (opens in a new tab)">Contact team</a>
    `);

    expect(browsingContextProblems(document, "en")).toEqual([
      "Contact team: new-tab label does not include its purpose",
    ]);
  });

  it("recursively resolves aria-labelledby overrides for new-tab purpose", () => {
    const document = documentFor(`
      <span id="complete-link-name" aria-label="opens in a new tab">Contact team (opens in a new tab)</span>
      <a href="https://example.com/contact" target="_blank" rel="noopener noreferrer"
        aria-labelledby="complete-link-name">Contact team</a>
    `);

    expect(browsingContextProblems(document, "en")).toEqual([
      "Contact team: new-tab label does not include its purpose",
    ]);
  });

  it("rejects browsing targets padded with whitespace", () => {
    const document = documentFor(`
      <a href="/same" target=" _self ">Same context</a>
      <a href="https://example.com/contact" target=" _blank " rel="noopener noreferrer"
        aria-label="Contact team (opens in a new tab)">Contact team</a>
    `);

    expect(browsingContextProblems(document, "en")).toEqual([
      "Same context: target has leading or trailing whitespace",
      "Contact team: target has leading or trailing whitespace",
    ]);
  });

  it("finds fetch-like link relations, CSS imports, and SVG filter/image loads", () => {
    const document = documentFor(`
      <link rel="preconnect" href="https://cdn.example.com">
      <link rel="dns-prefetch" href="//dns.example.com">
      <link rel="prefetch" href="https://cdn.example.com/future.js">
      <link rel="preload" as="image" imagesrcset="https://cdn.example.com/hero.png 1x, https://cdn.example.com/hero@2x.png 2x">
      <svg>
        <feImage href="https://cdn.example.com/filter.png"></feImage>
        <image xlink:href="https://cdn.example.com/image.png"></image>
        <script xlink:href="https://cdn.example.com/graphic.js"></script>
      </svg>
    `);

    expect(assetUrls(document)).toEqual([
      "https://cdn.example.com",
      "//dns.example.com",
      "https://cdn.example.com/future.js",
      "https://cdn.example.com/hero.png",
      "https://cdn.example.com/hero@2x.png",
      "https://cdn.example.com/filter.png",
      "https://cdn.example.com/image.png",
      "https://cdn.example.com/graphic.js",
    ]);
    expect(cssAssetUrls(`
      @import "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans";
      .remote { background-image: url(https://cdn.example.com/background.png); }
    `)).toEqual([
      "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans",
      "https://cdn.example.com/background.png",
    ]);
  });

  it("normalizes a remote base and SVG presentation URLs without flagging navigation", () => {
    const document = documentFor(`
      <base href="  https://cdn.example.com/assets/  ">
      <link rel="canonical" href="https://remote.example/canonical">
      <link rel="alternate" hreflang="en" href="https://remote.example/en/">
      <a href="https://fonts.googleapis.com/help">Font documentation</a>
      <p>fonts.gstatic.com is ordinary text here.</p>
      <img src="  local.png  ">
      <svg filter="url( https://media.example/filter.svg#active )"></svg>
    `);

    expect(remoteAssetProblems(document, "", "/")).toEqual([
      "base href https://cdn.example.com/assets/: resolves outside https://v-b.tech",
      "local.png: resolves to remote asset https://cdn.example.com/assets/local.png",
      "https://media.example/filter.svg#active: resolves to remote asset https://media.example/filter.svg#active",
    ]);
  });

  it("collects only fetch-capable SVG presentation attributes", () => {
    const document = documentFor(`
      <div aria-label="url(https://not-an-asset.example/label)" title="url(https://not-an-asset.example/title)"></div>
      <svg aria-label="url(https://not-an-asset.example/svg-label)" title="url(https://not-an-asset.example/svg-title)"
        filter="url(https://cdn.example.com/filter.svg#active)"
        marker-end="url(https://cdn.example.com/marker.svg#arrow)"></svg>
    `);

    expect(assetUrls(document)).toEqual([
      "https://cdn.example.com/filter.svg#active",
      "https://cdn.example.com/marker.svg#arrow",
    ]);
  });

  it("collects quoted CSS fetch URLs containing whitespace", () => {
    expect(cssAssetUrls(`
      @import "https://fonts.googleapis.com/css family.css";
      .hero { background-image: url("https://cdn.example.com/hero image.png"); }
    `)).toEqual([
      "https://fonts.googleapis.com/css family.css",
      "https://cdn.example.com/hero image.png",
    ]);
  });

  it("ignores CSS comments and ordinary strings while preserving actual fetches", () => {
    expect(cssAssetUrls(`
      /* url(https://not-an-asset.example/comment.png) */
      .note::before { content: "url(https://not-an-asset.example/content.png)"; }
      .hero { background-image: url("https://cdn.example.com/hero image.png"); }
      @import "https://fonts.googleapis.com/css family.css";
      @import url("https://cdn.example.com/theme file.css") screen;
    `)).toEqual([
      "https://cdn.example.com/hero image.png",
      "https://fonts.googleapis.com/css family.css",
      "https://cdn.example.com/theme file.css",
    ]);
  });

  it("classifies a browser-equivalent Google Fonts fetch host without scanning navigation", () => {
    const document = documentFor(`
      <link rel="canonical" href="https://fonts.googleapis.com/canonical">
      <a href="https://fonts.gstatic.com/help">Font help</a>
    `);

    expect(remoteAssetProblems(
      document,
      '@import "https://fonts.googleapis.com./css?family=IBM+Plex+Sans";',
      "/",
    )).toEqual([
      "https://fonts.googleapis.com./css?family=IBM+Plex+Sans: Google Fonts fetch host is forbidden",
    ]);
  });
});

describe("production landing structure", () => {
  it.each(pages)("renders semantic cases and exact localized illustration disclosure in $locale", async ({ file, locale }) => {
    const document = documentFor(await readBuilt(file));
    const main = descendants(document, "main");
    const h1 = descendants(document, "h1");
    const cases = elements(document, (node) => node.tagName === "article" && Boolean(attr(node, "data-case")));

    expect(main).toHaveLength(1);
    expect(h1).toHaveLength(1);
    expect(cases.map((node) => attr(node, "data-case"))).toEqual(caseIds);

    cases.forEach((article, index) => {
      expect(descendants(article, "dl")).toHaveLength(1);
      expect(descendants(article, "dt")).toHaveLength(4);
      expect(descendants(article, "dd")).toHaveLength(4);
      expect(text(elements(article, (node) => attr(node, "class") === "case-meta")[0])).toContain(caseNumbers[index]);

      const figure = descendants(article, "figure")[0];
      expect(figure).toBeDefined();
      if (!figure) return;
      expect(attr(figure, "data-illustration")).toBe(caseIds[index]);
    });
    expect(figureContractProblems(document, locale)).toEqual([]);
  });

  it.each(pages)("resolves every same-document fragment and keeps a logical heading hierarchy in $locale", async ({ file, pathname }) => {
    const document = documentFor(await readBuilt(file));
    const ids = elements(document).map((node) => attr(node, "id")).filter(Boolean) as string[];

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of sectionIds) expect(elementById(document, id)?.tagName).toBe("section");
    expect(sameDocumentFragmentProblems(document, pathname)).toEqual([]);

    const main = descendants(document, "main")[0];
    const levels = elements(main, (node) => /^h[1-6]$/.test(node.tagName ?? ""))
      .map((node) => Number(node.tagName?.slice(1)));
    expect(levels[0]).toBe(1);
    expect(levels.filter((level) => level === 1)).toHaveLength(1);
    levels.slice(1).forEach((level, index) => expect(level - levels[index]).toBeLessThanOrEqual(1));

    const orderedElements = elements(document);
    const positions = contentOrder.map((section) =>
      orderedElements.findIndex((node) => attr(node, "data-section") === section),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it.each(pages)("rejects browser-normalized remote asset loads without confusing metadata or navigation in $locale", async ({ file, pathname }) => {
    const html = await readBuilt(file);
    const document = documentFor(html);
    const css = await readBuiltCss();
    const urls = [...assetUrls(document), ...cssAssetUrls(css)];

    expect(remoteAssetProblems(document, css, pathname)).toEqual([]);
    for (const asset of urls.filter((url) => url.startsWith("/assets/") && url.endsWith(".svg"))) {
      await expect(access(new URL(`../dist${asset}`, import.meta.url))).resolves.toBeUndefined();
    }
  });

  it.each(pages)("guards every browsing context and requires a complete safe new-tab label in $locale", async ({ file, locale, newTabLabel }) => {
    const document = documentFor(await readBuilt(file));
    const blankLinks = elements(document, (node) => node.tagName === "a" && attr(node, "target") === "_blank");

    expect(browsingContextProblems(document, locale)).toEqual([]);
    expect(blankLinks.map((link) => attr(link, "aria-label"))).toEqual([newTabLabel]);

    const casesAndManifest = elements(document, (node) =>
      node.tagName === "a" && Boolean(attr(node, "href")?.startsWith("https://")) && !attr(node, "href")?.includes("t.me/"),
    );
    for (const link of casesAndManifest) expect(attr(link, "target")).toBeUndefined();
  });

  it.each(pages)("localizes the about signature accessible identity in $locale", async ({ file, signature }) => {
    const document = documentFor(await readBuilt(file));
    const signatureNode = elements(document, (node) => attr(node, "class") === "about-signature")[0];
    expect(attr(signatureNode, "aria-label")).toBe(signature);
  });
});

describe("contrast-safe production tokens", () => {
  it("keeps signal-filled control text at WCAG AA contrast in both themes", async () => {
    const tokensCss = await readFile(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
    const sets = rootTokenSets(tokensCss);
    const builtCss = await readBuiltCss();

    for (const selector of [":root", ':root[data-theme="dark"]']) {
      const tokens = sets.get(selector);
      expect(tokens).toBeDefined();
      const signal = tokens?.get("--color-signal");
      const foreground = tokens?.get("--color-on-signal");
      expect(signal).toMatch(/^#[0-9a-f]{6}$/i);
      expect(foreground).toMatch(/^#[0-9a-f]{6}$/i);
      if (!signal || !foreground) continue;
      expect(contrastRatio(signal, foreground)).toBeGreaterThanOrEqual(4.5);
    }
    for (const selector of [
      ".skip-link",
      ".skip-link:hover",
      ".skip-link:focus-visible",
      ".button-primary",
      "button[aria-pressed=true]",
      "::selection",
    ]) {
      expect(cssDeclaration(builtCss, selector, "color")).toBe("var(--color-on-signal)");
    }
  });

  it("keeps small badge illustration text at WCAG AA contrast", async () => {
    const css = await readBuiltCss();
    const background = cssDeclaration(css, ".badge-preview", "background") ?? "";
    const foreground = cssDeclaration(css, ".case-visual", "--scene-badge-muted") ?? "";

    expect(background).toMatch(/^#[0-9a-f]{6}$/i);
    expect(foreground).toMatch(/^#[0-9a-f]{6}$/i);
    if (!background || !foreground) return;
    expect(contrastRatio(background, foreground)).toBeGreaterThanOrEqual(4.5);
    expect(cssDeclaration(css, ".badge-preview span", "color")).toBe("var(--scene-badge-muted)");
  });
});

describe("self-hosted font contract", () => {
  it("ships the official license and exact Latin/Cyrillic WOFF2 set", async () => {
    const fontDirectory = new URL("../public/fonts/", import.meta.url);
    const shipped = (await readdir(fontDirectory)).sort();

    expect(shipped).toEqual([...fontFiles, "OFL.txt"].sort());
    await expect(access(new URL("OFL.txt", fontDirectory))).resolves.toBeUndefined();
  });

  it("declares only used faces with swap and explicit Sans 600 consumers", async () => {
    const css = await readBuiltCss();
    const faces = [...css.matchAll(/@font-face\s*{([^}]+)}/g)].map((match) => match[1]);

    expect(faces).toHaveLength(fontFiles.length);
    expect(faces.every((face) => /font-display:\s*swap/.test(face))).toBe(true);
    expect(faces.map((face) => face.match(/font-weight:\s*(\d+)/)?.[1]).sort()).toEqual([
      "400", "400", "500", "500", "600", "600",
    ]);
    for (const font of fontFiles) expect(css).toContain(`/fonts/${font}`);
    expect(css).not.toMatch(/url\(["']?https?:\/\//i);

    for (const selector of [
      ".hero h1",
      ".hero h1 em",
      ".section-heading h2",
      ".case-title-row h3",
      ".badge-preview strong",
      ".project-manifest strong",
      ".expertise-card h3",
      ".approach-step h3",
      ".about-copy h2",
      ".contact-panel h2",
    ]) {
      expect(cssDeclaration(css, selector, "font-weight"), selector).toBe("600");
    }
  });

  it.each(pages)("preloads Latin on both routes and Cyrillic only when needed for $locale", async ({ file, cyrillicPreload }) => {
    const document = documentFor(await readBuilt(file));
    const preloads = elements(document, (node) =>
      node.tagName === "link" && attr(node, "rel") === "preload" && attr(node, "as") === "font",
    );
    const hrefs = preloads.map((node) => attr(node, "href"));

    expect(hrefs).toContain("/fonts/ibm-plex-sans-latin1-400.woff2");
    expect(hrefs.includes("/fonts/ibm-plex-sans-cyrillic-400.woff2")).toBe(cyrillicPreload);
    for (const preload of preloads) {
      expect(attr(preload, "type")).toBe("font/woff2");
      expect(attr(preload, "crossorigin")).toBe("anonymous");
    }
  });
});

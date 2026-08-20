import { readdir } from "node:fs/promises";
import { parse } from "parse5";

interface HtmlAttribute {
  name: string;
  value: string;
}

interface HtmlNode {
  nodeName: string;
  tagName?: string;
  attrs?: HtmlAttribute[];
  childNodes?: HtmlNode[];
  parentNode?: HtmlNode;
  value?: string;
}

export interface LegalPageContract {
  readonly locale: "ru" | "en";
  readonly route: `/${string}/`;
  readonly pairedRoute: `/${string}/`;
  readonly title: string;
  readonly description: string;
  readonly draftBanner: string;
}

const PRODUCTION_ORIGIN = "https://v-b.tech";
const LEGAL_ROOT_SEGMENTS = new Set(["legal", "privacy", "personal-data-consent"]);

const attr = (node: HtmlNode | undefined, name: string) =>
  node?.attrs?.find((attribute) => attribute.name === name)?.value;

const text = (node: HtmlNode | undefined): string => {
  if (!node) return "";
  if (node.nodeName === "#text") return node.value ?? "";
  return (node.childNodes ?? []).map(text).join(" ").replace(/\s+/g, " ").trim();
};

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

const hasClass = (node: HtmlNode, name: string) =>
  attr(node, "class")?.split(/\s+/).includes(name) ?? false;

const isHidden = (node: HtmlNode) => {
  for (let current: HtmlNode | undefined = node; current; current = current.parentNode) {
    if (attr(current, "hidden") !== undefined || attr(current, "inert") !== undefined) return true;
    if (attr(current, "aria-hidden")?.trim().toLowerCase() === "true") return true;
    const style = attr(current, "style") ?? "";
    if (/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i.test(style)) {
      return true;
    }
  }
  return false;
};

const expectedLocaleRoutes = ({ locale, route, pairedRoute }: LegalPageContract) => ({
  ru: locale === "ru" ? route : pairedRoute,
  en: locale === "en" ? route : pairedRoute,
});

const pushSingletonError = (
  issues: string[],
  nodes: readonly HtmlNode[],
  label: string,
  predicate: (node: HtmlNode) => boolean,
) => {
  if (nodes.length !== 1 || !predicate(nodes[0]!)) issues.push(label);
};

export function validateLegalPageContract(
  html: string,
  contract: LegalPageContract,
): readonly string[] {
  const document = parse(html) as unknown as HtmlNode;
  const all = elements(document);
  const issues: string[] = [];
  const byTag = (tagName: string) => all.filter((node) => node.tagName === tagName);
  const routes = expectedLocaleRoutes(contract);
  const absolute = (route: string) => `${PRODUCTION_ORIGIN}${route}`;

  pushSingletonError(
    issues,
    byTag("html"),
    `Expected html lang ${contract.locale}`,
    (node) => attr(node, "lang") === contract.locale,
  );
  pushSingletonError(
    issues,
    byTag("title"),
    `Expected exact title: ${contract.title}`,
    (node) => text(node) === contract.title,
  );
  const descriptions = byTag("meta").filter((node) => attr(node, "name") === "description");
  pushSingletonError(
    issues,
    descriptions,
    "Expected exactly one matching description",
    (node) => attr(node, "content") === contract.description,
  );

  const canonicals = byTag("link").filter((node) => attr(node, "rel") === "canonical");
  pushSingletonError(
    issues,
    canonicals,
    `Expected exactly one canonical ${absolute(contract.route)}`,
    (node) => attr(node, "href") === absolute(contract.route),
  );

  const alternates = byTag("link").filter((node) => attr(node, "rel") === "alternate");
  const expectedAlternates = {
    ru: absolute(routes.ru),
    en: absolute(routes.en),
    "x-default": absolute(routes.ru),
  } as const;
  for (const [language, href] of Object.entries(expectedAlternates)) {
    const matches = alternates.filter((node) => attr(node, "hreflang") === language);
    if (matches.length !== 1 || attr(matches[0], "href") !== href) {
      issues.push(`Expected reciprocal alternate ${language}: ${href}`);
    }
  }
  if (alternates.length !== 3) issues.push("Expected exactly three locale alternates");

  const robots = byTag("meta").filter((node) => attr(node, "name") === "robots");
  pushSingletonError(
    issues,
    robots,
    "Expected exactly one noindex,nofollow robots directive",
    (node) => attr(node, "content")?.trim().toLowerCase() === "noindex,nofollow",
  );

  const mains = byTag("main");
  if (mains.length !== 1) issues.push("Expected exactly one main landmark");
  if (byTag("h1").length !== 1) issues.push("Expected exactly one h1");

  const localeControls = all.filter((node) => hasClass(node, "locale-links"));
  if (localeControls.length === 0) {
    issues.push("Expected paired locale controls");
  }
  for (const control of localeControls) {
    const anchors = elements(control, (node) => node.tagName === "a");
    for (const [language, href] of Object.entries(routes)) {
      const matchingAnchor = anchors.find((node) => text(node) === language.toUpperCase());
      if (!matchingAnchor || attr(matchingAnchor, "href") !== href) {
        issues.push(`Expected paired locale href ${language}: ${href}`);
      }
    }
  }

  const banners = all.filter((node) => hasClass(node, "legal-draft-banner"));
  if (banners.length !== 1) {
    issues.push("Expected exactly one draft banner");
  } else if (isHidden(banners[0]!) || text(banners[0]) !== contract.draftBanner) {
    issues.push("Expected visible draft banner with exact lifecycle warning");
  }

  const unsafeTags = new Set(["embed", "iframe", "object", "script", "style", "template"]);
  for (const main of mains) {
    for (const node of elements(main)) {
      const hasEventHandler = node.attrs?.some(({ name }) => /^on/i.test(name)) ?? false;
      const hasUnsafeUrl = node.attrs?.some(
        ({ name, value }) =>
          ["href", "src", "action", "formaction"].includes(name) &&
          /^(?:javascript|data\s*:\s*text\/html):/i.test(value.trim()),
      ) ?? false;
      if (unsafeTags.has(node.tagName ?? "") || hasEventHandler || hasUnsafeUrl) {
        issues.push(`Unsafe legal markup in main: ${node.tagName}`);
      }
    }
  }

  return issues;
}

async function listHtmlFiles(directory: URL, prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await listHtmlFiles(new URL(`${entry.name}/`, directory), `${relative}/`));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(relative);
    }
  }
  return files;
}

const routeForHtmlFile = (file: string): string => {
  if (file === "index.html") return "/";
  if (file.endsWith("/index.html")) return `/${file.slice(0, -"index.html".length)}`;
  return `/${file}`;
};

export async function listGeneratedLegalRoutes(distDirectory: URL): Promise<string[]> {
  const routes = (await listHtmlFiles(distDirectory)).map(routeForHtmlFile);
  return routes.filter((route) => {
    const segments = route.split("/").filter(Boolean);
    const rootIndex = segments[0] === "en" ? 1 : 0;
    return LEGAL_ROOT_SEGMENTS.has(segments[rootIndex] ?? "");
  }).sort();
}

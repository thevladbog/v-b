import { readFile, readdir } from "node:fs/promises";
import { CURRENT_CONTACT_CONSENT_ID } from "@vbtech/legal-documents";
import { CONTACT_FIELD_LIMITS } from "@vbtech/contracts";
import { parse } from "parse5";
import { describe, expect, it } from "vitest";

interface HtmlAttribute {
  name: string;
  value: string;
}

interface HtmlNode {
  nodeName: string;
  tagName?: string;
  attrs?: HtmlAttribute[];
  childNodes?: HtmlNode[];
  value?: string;
}

const pages = [
  {
    file: "dist/index.html",
    menuOpen: "Открыть меню",
    policyHref: "/privacy/",
    consentHref: "/personal-data-consent/",
    draftContext: "согласие пока нельзя принять",
    consentPhrase: "Я ознакомился(-ась) с политикой обработки персональных данных и проектом согласия на обработку персональных данных.",
  },
  {
    file: "dist/en/index.html",
    menuOpen: "Open menu",
    policyHref: "/en/privacy/",
    consentHref: "/en/personal-data-consent/",
    draftContext: "draft consent cannot yet be accepted",
    consentPhrase: "I have reviewed the personal data processing policy and the draft personal data processing consent.",
  },
] as const;

const attr = (node: HtmlNode, name: string) =>
  node.attrs?.find((attribute) => attribute.name === name)?.value;

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

const text = (node: HtmlNode): string =>
  node.nodeName === "#text"
    ? node.value ?? ""
    : (node.childNodes ?? []).map(text).join(" ").replace(/\s+/g, " ").trim();

const contiguousText = (node: HtmlNode): string =>
  node.nodeName === "#text"
    ? node.value ?? ""
    : (node.childNodes ?? []).map(contiguousText).join("").replace(/\s+/g, " ").trim();

const byId = (document: HtmlNode, id: string) =>
  elements(document, (node) => attr(node, "id") === id)[0];

const readBuilt = (file: string) =>
  readFile(new URL(`../${file}`, import.meta.url), "utf8");

const readBuiltCss = async () => {
  const directory = new URL("../dist/_astro/", import.meta.url);
  const files = (await readdir(directory)).filter((file) => file.endsWith(".css"));
  return (
    await Promise.all(files.map((file) => readFile(new URL(file, directory), "utf8")))
  ).join("\n");
};

const cssDeclaration = (css: string, selector: string, property: string) => {
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)}/g)) {
    if (!match[1].split(",").map((item) => item.trim()).includes(selector)) continue;
    const declaration = match[2]
      .split(";")
      .map((item) => item.split(/:(.*)/s))
      .find(([name]) => name?.trim() === property);
    if (declaration) return declaration[1]?.replace(/\s+/g, "").trim();
  }
  return undefined;
};

const cssBlocks = (css: string, opening: RegExp) => {
  const matcher = new RegExp(opening.source, opening.flags.includes("g") ? opening.flags : `${opening.flags}g`);
  const blocks: string[] = [];

  for (const match of css.matchAll(matcher)) {
    const openBrace = css.indexOf("{", match.index);
    if (openBrace === -1) continue;

    let depth = 0;
    for (let index = openBrace; index < css.length; index += 1) {
      if (css[index] === "{") depth += 1;
      if (css[index] !== "}") continue;
      depth -= 1;
      if (depth !== 0) continue;
      blocks.push(css.slice(openBrace + 1, index));
      break;
    }
  }

  return blocks;
};

describe("disabled contact shell", () => {
  it.each(pages)("renders the bounded accessible form in $file", async (page) => {
    const html = await readBuilt(page.file);
    const document = parse(html) as unknown as HtmlNode;
    const forms = elements(document, (node) => attr(node, "data-contact-form") !== undefined);

    expect(forms).toHaveLength(1);
    const form = forms[0]!;
    expect(attr(form, "method")).toBeUndefined();
    expect(attr(form, "action")).toBeUndefined();
    expect(attr(form, "novalidate")).toBe("");
    expect(attr(form, "data-submission-enabled")).toBe("false");
    expect(attr(form, "data-consent-id")).toBe(CURRENT_CONTACT_CONSENT_ID);
    expect(attr(form, "data-contact-instance")).toBe("home-contact");
    expect(attr(form, "aria-busy")).toBe("false");

    const fieldset = elements(form, (node) => node.tagName === "fieldset")[0]!;
    expect(attr(fieldset, "disabled")).toBe("");
    const controls = elements(form, (node) =>
      ["input", "textarea", "button"].includes(node.tagName ?? ""),
    );
    const named = new Map(
      controls.filter((node) => attr(node, "name")).map((node) => [attr(node, "name"), node]),
    );
    expect([...named.keys()]).toEqual(["name", "contact", "message", "consent"]);

    const expected = {
      name: { tag: "input", type: "text", autocomplete: "name", maxlength: String(CONTACT_FIELD_LIMITS.name) },
      contact: { tag: "input", type: "text", autocomplete: "email", maxlength: String(CONTACT_FIELD_LIMITS.contact) },
      message: { tag: "textarea", type: undefined, autocomplete: "off", maxlength: String(CONTACT_FIELD_LIMITS.message) },
      consent: { tag: "input", type: "checkbox", autocomplete: undefined, maxlength: undefined },
    } as const;

    for (const [name, contract] of Object.entries(expected)) {
      const control = named.get(name)!;
      expect(control.tagName).toBe(contract.tag);
      expect(attr(control, "type")).toBe(contract.type);
      expect(attr(control, "autocomplete")).toBe(contract.autocomplete);
      expect(attr(control, "maxlength")).toBe(contract.maxlength);
      expect(attr(control, "required")).toBe("");
      expect(attr(control, "id")).toBe(`home-contact-${name}`);
      expect(attr(control, "checked")).toBeUndefined();

      const label = elements(form, (node) =>
        node.tagName === "label" && attr(node, "for") === `home-contact-${name}`,
      );
      expect(label).toHaveLength(1);

      const describedBy = attr(control, "aria-describedby")?.split(/\s+/) ?? [];
      expect(describedBy).toEqual([
        `home-contact-${name}-instruction`,
        `home-contact-${name}-error`,
      ]);
      describedBy.forEach((id) => expect(byId(document, id)).toBeDefined());
      expect(attr(byId(document, `home-contact-${name}-error`)!, "data-error-message")).toBeTruthy();
      expect(attr(byId(document, `home-contact-${name}-error`)!, "data-contact-error")).toBe(name);
      expect(text(byId(document, `home-contact-${name}-error`)!)).toBe("");
    }

    const legalLinks = elements(form, (node) => node.tagName === "a").map((node) => attr(node, "href"));
    expect(legalLinks).toEqual([page.policyHref, page.consentHref]);
    const consentLinks = elements(form, (node) =>
      node.tagName === "a" && attr(node, "data-contact-consent-link") !== undefined,
    );
    expect(consentLinks.map((node) => attr(node, "data-contact-consent-link"))).toEqual([
      "policy",
      "consent",
    ]);
    expect(consentLinks.map((node) => attr(node, "href"))).toEqual([
      page.policyHref,
      page.consentHref,
    ]);
    for (const link of consentLinks) {
      expect(attr(link, "class")?.split(/\s+/)).toContain("contact-consent-action");
      expect(attr(link, "role")).toBeUndefined();
    }
    const consentIdentity = elements(form, (node) =>
      attr(node, "data-contact-consent-identity") !== undefined,
    );
    expect(consentIdentity).toHaveLength(1);
    expect(text(consentIdentity[0]!)).toBe(CURRENT_CONTACT_CONSENT_ID);
    expect(text(form)).toContain(page.draftContext);
    const consentLabel = elements(form, (node) =>
      node.tagName === "label" && attr(node, "for") === "home-contact-consent",
    )[0]!;
    const consentCopy = elements(consentLabel, (node) => node.tagName === "span")[0]!;
    expect(contiguousText(consentCopy)).toBe(page.consentPhrase);
    expect(elements(form, (node) => attr(node, "data-contact-warning") !== undefined)).toHaveLength(1);

    const status = elements(form, (node) => attr(node, "data-contact-status") !== undefined)[0]!;
    expect(attr(status, "role")).toBe("status");
    expect(attr(status, "aria-live")).toBe("polite");
    expect(attr(status, "aria-atomic")).toBe("true");
    expect(elements(form, (node) => attr(node, "data-contact-errors") !== undefined)).toHaveLength(1);

    const contactPanel = byId(document, "contact")!;
    expect(elements(contactPanel, (node) => attr(node, "href") === "https://t.me/thevladbog")).toHaveLength(1);
    expect(elements(contactPanel, (node) => attr(node, "href") === "mailto:hello@v-b.tech")).toHaveLength(1);
  });

  it("ships no captcha or request-capable client runtime in the default build", async () => {
    const directory = new URL("../dist/", import.meta.url);
    const emitted = (await readdir(directory, { recursive: true }))
      .filter((file) => file.endsWith(".html") || file.endsWith(".js"));
    const entries = await Promise.all(emitted.map(async (file) => ({
      file,
      body: await readFile(new URL(file, directory), "utf8"),
    })));
    const artifact = entries.map(({ body }) => body).join("\n");
    const javascript = entries.filter(({ file }) => file.endsWith(".js")).map(({ body }) => body).join("\n");

    expect(artifact).not.toMatch(/\/api\/contact/i);
    expect(artifact).not.toMatch(/smartcaptcha\.cloud\.yandex\.ru|captcha\.js|window\.smartCaptcha|grecaptcha/i);
    expect(javascript).not.toMatch(/\bfetch\s*\(|\bXMLHttpRequest\b|\.sendBeacon\s*\(/);
    expect(javascript).not.toContain(CURRENT_CONTACT_CONSENT_ID);
    expect(artifact).not.toContain('data-submission-enabled="true"');
    expect(artifact).not.toContain("vbtech-internal-fixture-site-key");
  });
});

describe("progressive site navigation shell", () => {
  it("forces enhanced hidden navigation out of layout despite its flex display rule", async () => {
    const css = await readBuiltCss();

    expect(cssDeclaration(css, ".site-navigation", "display")).toBe("flex");
    expect(cssDeclaration(css, "[hidden]", "display")).toBe("none!important");
  });

  it.each(pages)("keeps no-JS links visible and emits a localized toggle in $file", async (page) => {
    const document = parse(await readBuilt(page.file)) as unknown as HtmlNode;
    const header = elements(document, (node) => attr(node, "data-site-header") !== undefined)[0]!;
    const button = elements(header, (node) => attr(node, "data-navigation-toggle") !== undefined)[0]!;
    const navigation = byId(document, "site-navigation")!;

    expect(button.tagName).toBe("button");
    expect(attr(button, "type")).toBe("button");
    expect(attr(button, "id")).toBe("site-navigation-toggle");
    expect(attr(button, "hidden")).toBe("");
    expect(attr(button, "aria-controls")).toBe("site-navigation");
    expect(attr(button, "aria-expanded")).toBe("false");
    expect(attr(button, "aria-label")).toBe(page.menuOpen);
    expect(attr(button, "data-open-label")).toBe(page.menuOpen);
    expect(attr(button, "data-close-label")).toBeTruthy();
    expect(attr(navigation, "data-site-navigation")).toBe("");
    expect(attr(navigation, "hidden")).toBeUndefined();
    expect(elements(navigation, (node) => node.tagName === "a")).toHaveLength(5);
  });
});

describe("contact consent touch targets", () => {
  it("gives each mobile legal link an authored 44px text-link action", async () => {
    const css = await readBuiltCss();
    const mobileCss = cssBlocks(
      css,
      /@media\s*\((?:max-width:\s*40rem|width\s*<=\s*40rem)\)/,
    ).find((block) => block.includes(".contact-consent-action"));

    expect(mobileCss).toBeDefined();
    expect(cssDeclaration(mobileCss!, ".contact-consent-action", "display")).toBe("inline-flex");
    expect(cssDeclaration(mobileCss!, ".contact-consent-action", "align-items")).toBe("center");
    expect(cssDeclaration(mobileCss!, ".contact-consent-action", "min-height")).toBe("2.75rem");
    expect(cssDeclaration(mobileCss!, ".contact-consent-action", "vertical-align")).toBe("middle");
  });
});

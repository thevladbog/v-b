import { readFile, readdir } from "node:fs/promises";
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

describe("disabled contact shell", () => {
  it.each(pages)("renders the bounded accessible form in $file", async (page) => {
    const html = await readBuilt(page.file);
    const document = parse(html) as unknown as HtmlNode;
    const forms = elements(document, (node) => attr(node, "data-contact-form") !== undefined);

    expect(forms).toHaveLength(1);
    const form = forms[0]!;
    expect(attr(form, "method")).toBe("post");
    expect(attr(form, "action")).toBe("/api/contact");
    expect(attr(form, "novalidate")).toBe("");
    expect(attr(form, "data-submission-enabled")).toBe("false");
    expect(attr(form, "data-consent-identity")).toBe("VBT-PD-02/DRAFT");

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
      name: { tag: "input", type: "text", autocomplete: "name", maxlength: "100" },
      contact: { tag: "input", type: "text", autocomplete: "email", maxlength: "254" },
      message: { tag: "textarea", type: undefined, autocomplete: "off", maxlength: "4000" },
      consent: { tag: "input", type: "checkbox", autocomplete: undefined, maxlength: undefined },
    } as const;

    for (const [name, contract] of Object.entries(expected)) {
      const control = named.get(name)!;
      expect(control.tagName).toBe(contract.tag);
      expect(attr(control, "type")).toBe(contract.type);
      expect(attr(control, "autocomplete")).toBe(contract.autocomplete);
      expect(attr(control, "maxlength")).toBe(contract.maxlength);
      expect(attr(control, "required")).toBe("");
      expect(attr(control, "id")).toBe(`contact-${name}`);
      expect(attr(control, "checked")).toBeUndefined();

      const label = elements(form, (node) =>
        node.tagName === "label" && attr(node, "for") === `contact-${name}`,
      );
      expect(label).toHaveLength(1);

      const describedBy = attr(control, "aria-describedby")?.split(/\s+/) ?? [];
      expect(describedBy).toEqual([
        `contact-${name}-instruction`,
        `contact-${name}-error`,
      ]);
      describedBy.forEach((id) => expect(byId(document, id)).toBeDefined());
      expect(attr(byId(document, `contact-${name}-error`)!, "data-error-message")).toBeTruthy();
      expect(text(byId(document, `contact-${name}-error`)!)).toBe("");
    }

    const legalLinks = elements(form, (node) => node.tagName === "a").map((node) => attr(node, "href"));
    expect(legalLinks).toEqual([page.policyHref, page.consentHref]);
    expect(text(form)).toContain("VBT-PD-02/DRAFT");
    expect(text(form)).toContain(page.draftContext);
    const consentLabel = elements(form, (node) =>
      node.tagName === "label" && attr(node, "for") === "contact-consent",
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
    const directory = new URL("../dist/_astro/", import.meta.url);
    const files = (await readdir(directory)).filter((file) => file.endsWith(".js"));
    const externalJavascript = (
      await Promise.all(files.map((file) => readFile(new URL(file, directory), "utf8")))
    ).join("\n");
    const html = `${await readBuilt("dist/index.html")}\n${await readBuilt("dist/en/index.html")}`;
    const inlineJavascript = [...html.matchAll(/<script type="module"(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
      .map((match) => match[1])
      .join("\n");
    const javascript = `${externalJavascript}\n${inlineJavascript}`;

    expect(`${html}\n${javascript}`).not.toMatch(/smartcaptcha|captcha\.yandex|grecaptcha/i);
    expect(javascript).not.toMatch(/\bfetch\s*\(|\bXMLHttpRequest\b|\.sendBeacon\s*\(/);
    expect(html).not.toContain('data-submission-enabled="true"');
  });
});

describe("progressive site navigation shell", () => {
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

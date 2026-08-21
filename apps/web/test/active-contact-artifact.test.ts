import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import { parse } from "parse5";

const execFileAsync = promisify(execFile);
const webRoot = new URL("../", import.meta.url);
const activeOutDir = join(tmpdir(), "vbtech-contact-active-dist");
const activeOrigin = "http://127.0.0.1:43229";
const activeConsentId = "VBT-PD-02/2099.01/01";
const publicSiteKey = "vbtech-reviewed-active-public-site-key";

interface HtmlAttribute { name: string; value: string }
interface HtmlNode {
  nodeName?: string;
  tagName?: string;
  attrs?: HtmlAttribute[];
  childNodes?: HtmlNode[];
  value?: string;
}

const attr = (node: HtmlNode, name: string) =>
  node.attrs?.find((attribute) => attribute.name === name)?.value;

const elements = (root: HtmlNode, predicate: (node: HtmlNode) => boolean): HtmlNode[] => {
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

const activeLandingCopy = {
  "index.html": {
    directContext: "Отправьте обращение через форму ниже или свяжитесь напрямую по email или в Telegram.",
    formTitle: "Отправить обращение",
    formNote: "Форма передаёт введённые данные, чтобы я мог ответить на обращение. Ознакомьтесь с действующей политикой обработки персональных данных и согласием по ссылкам выше.",
    consentLink: "согласием на обработку персональных данных",
    consentInstruction: "Перед отправкой ознакомьтесь с действующим согласием и примите его, установив флажок. Действующая редакция:",
    consentContext: "Это согласие применяется к отправке формы.",
    consentError: "Ознакомьтесь с действующим согласием и примите его, установив флажок.",
  },
  "en/index.html": {
    directContext: "Send an enquiry using the form below, or contact me directly by email or Telegram.",
    formTitle: "Send an enquiry",
    formNote: "The form transmits the entered data so I can respond to your enquiry. Review the current personal data processing policy and consent linked above.",
    consentLink: "personal data processing consent",
    consentInstruction: "Review and accept the current consent by selecting the checkbox before sending. Current revision:",
    consentContext: "This consent applies to the form submission.",
    consentError: "Review and accept the current consent by selecting the checkbox.",
  },
} as const;

const forbiddenActivePhrases = [
  "Онлайн-форма пока недоступна",
  "Черновик обращения",
  "отключённая production-оболочка",
  "данные не передаются",
  "проектом согласия на обработку персональных данных",
  "Проект не вступил в силу",
  "согласие пока нельзя принять",
  "Для отправки потребуется явно подтвердить согласие",
  "Проект. Документ не вступил в силу",
  "В реестре находятся только кандидаты для проверки",
  "Статус: проект",
  "Online submission is currently unavailable",
  "Enquiry draft",
  "disabled production shell",
  "no data is transmitted",
  "draft personal data processing consent",
  "draft consent cannot yet be accepted",
  "Submission will require explicit consent confirmation",
  "Draft. This document is not in force",
  "review candidates only",
  "Status: draft",
  "VBT-PD-01/DRAFT",
  "VBT-PD-02/DRAFT",
] as const;

const buildActive = (extraEnv: Record<string, string | undefined> = {}, extraArgs: string[] = []) =>
  execFileAsync("node_modules/.bin/astro", [
    "build",
    "--config",
    "test-active/astro.config.mjs",
    ...extraArgs,
  ], {
    cwd: webRoot,
    env: {
      ...process.env,
      VBTECH_PRIVATE_ACTIVE_LEGAL_ARTIFACT: "1",
      VBTECH_PRIVATE_ACTIVE_PUBLIC_SITE_KEY: publicSiteKey,
      ...extraEnv,
    },
  });

beforeAll(async () => {
  await buildActive();
}, 120_000);

describe("private production-shaped ACTIVE contact artifact", () => {
  it.each(Object.entries(activeLandingCopy))("renders exact state-aware production copy and form in %s", async (file, copy) => {
    const html = await readFile(join(activeOutDir, file), "utf8");
    const document = parse(html) as unknown as HtmlNode;
    const forms = elements(document, (node) => attr(node, "data-contact-form") !== undefined);

    expect(forms).toHaveLength(1);
    const form = forms[0]!;
    expect(attr(form, "method")).toBe("post");
    expect(attr(form, "action")).toBe("/api/contact");
    expect(attr(form, "data-submission-enabled")).toBe("true");
    expect(attr(form, "data-consent-id")).toBe(activeConsentId);
    expect(attr(form, "data-captcha-site-key")).toBe(publicSiteKey);
    expect(attr(form, "data-internal-test-fixture")).toBeUndefined();
    expect(attr(form, "aria-describedby")).toBe("home-contact-note");
    expect(elements(form, (node) => attr(node, "id") === "home-contact-disabled")).toHaveLength(0);
    expect(elements(form, (node) => node.tagName === "fieldset").map((node) => attr(node, "disabled"))).toEqual([undefined]);
    expect(elements(form, (node) => node.tagName === "fieldset").map((node) => attr(node, "aria-describedby"))).toEqual([undefined]);
    expect(text(elements(document, (node) => attr(node, "class") === "contact-direct-context")[0]!)).toBe(copy.directContext);
    expect(text(elements(document, (node) => attr(node, "id") === "home-contact-title")[0]!)).toBe(copy.formTitle);
    expect(text(elements(form, (node) => attr(node, "id") === "home-contact-note")[0]!)).toBe(copy.formNote);
    expect(text(elements(form, (node) => attr(node, "data-contact-consent-link") === "consent")[0]!)).toBe(copy.consentLink);
    expect(text(elements(form, (node) => attr(node, "id") === "home-contact-consent-instruction")[0]!)).toContain(copy.consentInstruction);
    expect(text(elements(form, (node) => attr(node, "id") === "home-contact-consent-instruction")[0]!)).toContain(copy.consentContext);
    expect(attr(elements(form, (node) => attr(node, "id") === "home-contact-consent-error")[0]!, "data-error-message")).toBe(copy.consentError);
  });

  it("renders coherent synthetic ACTIVE legal pages without DRAFT or disabled phrases", async () => {
    const legalPages = [
      "legal/index.html", "privacy/index.html", "personal-data-consent/index.html",
      "en/legal/index.html", "en/privacy/index.html", "en/personal-data-consent/index.html",
    ];
    const html = await Promise.all(legalPages.map((file) => readFile(join(activeOutDir, file), "utf8")));
    const artifact = html.join("\n");

    expect(artifact).toContain("VBT-PD-01/2099.01/01");
    expect(artifact).toContain(activeConsentId);
    expect(artifact).toContain("Синтетическая действующая редакция для закрытого тестового контура");
    expect(artifact).toContain("Synthetic active revision for the private test contour");
    for (const phrase of forbiddenActivePhrases) expect(artifact).not.toContain(phrase);
  });

  it("contains no DRAFT, disabled, or no-transmission material in ACTIVE HTML or client output", async () => {
    const emitted = (await readdir(activeOutDir, { recursive: true }))
      .filter((file) => /\.(?:html|js|mjs)$/.test(file));
    const artifact = (await Promise.all(emitted.map((file) => readFile(join(activeOutDir, file), "utf8")))).join("\n");
    for (const phrase of forbiddenActivePhrases) expect(artifact).not.toContain(phrase);
  });

  it("emits one shared request-capable client chunk without fixture or secret material", async () => {
    const files = (await readdir(activeOutDir, { recursive: true }))
      .filter((file) => /\.(?:html|js|mjs)$/.test(file))
      .sort();
    const entries = await Promise.all(files.map(async (file) => ({
      file,
      body: await readFile(join(activeOutDir, file), "utf8"),
    })));
    const clientEntries = entries.filter(({ file, body }) =>
      /\.(?:js|mjs)$/.test(file) &&
      (body.includes("smartcaptcha.cloud.yandex.ru") || body.includes("/api/contact")),
    );
    const artifact = entries.map(({ body }) => body).join("\n");

    expect(files.filter((file) => file.endsWith(".html"))).toHaveLength(9);
    expect(clientEntries.map(({ file }) => file)).toHaveLength(1);
    expect(clientEntries[0]?.body).toContain("smartcaptcha.cloud.yandex.ru");
    expect(clientEntries[0]?.body).toContain("/api/contact");
    expect(artifact).toContain(publicSiteKey);
    expect(artifact).toContain(activeConsentId);
    expect(artifact).not.toContain("data-internal-test-fixture");
    expect(artifact).not.toContain("vbtech-internal-fixture-site-key");
    expect(artifact).not.toMatch(/SMARTCAPTCHA_SECRET|CONTACT_ENCRYPTION_KEY|RATE_LIMIT_HMAC_KEY/i);
  });

  it("cannot select the private active legal contour without its explicit guard", async () => {
    await expect(execFileAsync("node_modules/.bin/astro", [
      "build",
      "--config",
      "test-active/astro.config.mjs",
    ], {
      cwd: webRoot,
      env: {
        ...process.env,
        VBTECH_PRIVATE_ACTIVE_LEGAL_ARTIFACT: undefined,
      },
    })).rejects.toMatchObject({ stderr: expect.stringContaining("explicit private ACTIVE legal-artifact guard") });
  });

  it("rejects production origin and a missing public site key", async () => {
    await expect(buildActive({}, ["--site", "https://v-b.tech"])).rejects.toMatchObject({
      stderr: expect.stringContaining("restricted to its exact loopback origin"),
    });
    await expect(buildActive({ VBTECH_PRIVATE_ACTIVE_PUBLIC_SITE_KEY: "" })).rejects.toMatchObject({
      stderr: expect.stringContaining("reviewed public SmartCaptcha site key"),
    });
  });

  it("keeps the public flag alone fail-closed on the actual DRAFT registry", async () => {
    await expect(execFileAsync("node_modules/.bin/astro", ["build"], {
      cwd: webRoot,
      env: {
        ...process.env,
        PUBLIC_CONTACT_SUBMISSION_ENABLED: "true",
        PUBLIC_SMARTCAPTCHA_SITE_KEY: publicSiteKey,
      },
    })).rejects.toMatchObject({
      stderr: expect.stringContaining("Draft consent VBT-PD-02/DRAFT cannot be used when submission is enabled"),
    });
  });
});

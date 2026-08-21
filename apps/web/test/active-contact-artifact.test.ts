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
  tagName?: string;
  attrs?: HtmlAttribute[];
  childNodes?: HtmlNode[];
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
  it.each(["index.html", "en/index.html"])("renders the actual enabled production form in %s", async (file) => {
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

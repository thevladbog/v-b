import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    __vbtechActiveCaptchaExecuteCount: number;
    __vbtechActiveCaptchaRenderSiteKey?: string;
    __vbtechActiveContactSubmitBindings: number;
  }
}

const origin = "http://127.0.0.1:43229";
const captchaScript = "https://smartcaptcha.cloud.yandex.ru/captcha.js";
const publicSiteKey = "vbtech-reviewed-active-public-site-key";
const activeConsentId = "VBT-PD-02/2099.01/01";

async function installRuntimeObservation(page: Page) {
  await page.addInitScript(() => {
    window.__vbtechActiveCaptchaExecuteCount = 0;
    window.__vbtechActiveContactSubmitBindings = 0;
    const original = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (
        type === "submit" &&
        this instanceof HTMLFormElement &&
        this.hasAttribute("data-contact-form")
      ) {
        window.__vbtechActiveContactSubmitBindings += 1;
      }
      return original.call(this, type, listener, options);
    };
  });
  await page.route(`${captchaScript}**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: String.raw`(() => {
        const source = new URL(document.currentScript.src);
        const widgets = new Map();
        window.smartCaptcha = {
          render(container, options) {
            window.__vbtechActiveCaptchaRenderSiteKey = options.sitekey;
            widgets.set(41, options);
            const disclosure = document.createElement("span");
            disclosure.textContent = "SmartCaptcha";
            disclosure.setAttribute("data-smartcaptcha-disclosure", "");
            container.append(disclosure);
            return 41;
          },
          reset(widgetId) {
            if (!widgets.has(widgetId)) throw new Error("unknown widget");
          },
          execute(widgetId) {
            const options = widgets.get(widgetId);
            if (!options) throw new Error("unknown widget");
            window.__vbtechActiveCaptchaExecuteCount += 1;
            queueMicrotask(() => options.callback("active-one-time-token"));
          },
          destroy(widgetId) { widgets.delete(widgetId); },
        };
        window[source.searchParams.get("onload")]();
      })();`,
    });
  });
}

for (const localized of [
  {
    path: "/",
    name: "Имя",
    contact: "Email или Telegram",
    message: "Что вы хотите спроектировать или улучшить?",
    consent: /Я ознакомился/,
    submit: "Отправить обращение",
  },
  {
    path: "/en/",
    name: "Name",
    contact: "Email or Telegram",
    message: "What do you want to design or improve?",
    consent: /I have reviewed/,
    submit: "Send enquiry",
  },
] as const) {
  test(`${localized.path} production-shaped active form is accessible before and after validation`, async ({ page }) => {
    await installRuntimeObservation(page);
    await page.goto(`${origin}${localized.path}`);

    const form = page.locator("[data-contact-form]");
    await expect(form).toHaveAttribute("data-submission-enabled", "true");
    await expect(form).toHaveAttribute("data-consent-id", activeConsentId);
    await expect(form).toHaveAttribute("data-captcha-site-key", publicSiteKey);
    await expect(form).not.toHaveAttribute("data-internal-test-fixture", /.+/);
    expect(await page.evaluate(() => window.__vbtechActiveContactSubmitBindings)).toBe(1);

    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      for (const state of ["idle", "validation-error"] as const) {
        if (state === "validation-error") {
          await page.getByRole("button", { name: localized.submit }).click();
          await expect(page.getByRole("alert")).toBeVisible();
          await expect(page.getByLabel(localized.name, { exact: true })).toBeFocused();
        }
        const result = await new AxeBuilder({ page })
          .include(".contact-form-shell")
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"])
          .analyze();
        const violations = result.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.map((node) => ({
            html: node.html,
            failureSummary: node.failureSummary,
          })),
        }));
        expect(violations, `${theme} ${state}:\n${JSON.stringify(violations, null, 2)}`).toEqual([]);
      }
    }
  });
}

test("actual production page acquires one captcha token and posts the exact same-origin JSON contract", async ({ page }) => {
  await installRuntimeObservation(page);
  const captchaRequests: string[] = [];
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith(captchaScript)) captchaRequests.push(url);
    else if (new URL(url).origin !== origin) externalRequests.push(url);
  });
  let acceptedBody: Record<string, unknown> | undefined;
  await page.route(`${origin}/api/contact`, async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers()["content-type"]).toBe("application/json");
    acceptedBody = route.request().postDataJSON() as Record<string, unknown>;
    expect(Object.keys(acceptedBody).sort()).toEqual([
      "captchaToken", "consentId", "contact", "locale", "message", "name",
      "requestId", "sourcePath", "website",
    ]);
    await route.fulfill({
      status: 202,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ accepted: true, requestId: acceptedBody.requestId }),
    });
  });
  await page.goto(`${origin}/en/`);

  await page.getByLabel("Name", { exact: true }).fill("  Vlad  ");
  await page.getByLabel("Email or Telegram", { exact: true }).fill("  PERSON@Example.COM  ");
  await page.getByLabel("What do you want to design or improve?", { exact: true }).fill("  Production-shaped enquiry.  ");
  await page.getByRole("checkbox", { name: /I have reviewed/ }).check();
  await page.getByRole("button", { name: "Send enquiry" }).click();

  await expect(page.getByRole("status")).toContainText(/enquiry was received/i);
  expect(acceptedBody).toMatchObject({
    locale: "en",
    name: "Vlad",
    contact: "person@example.com",
    message: "Production-shaped enquiry.",
    sourcePath: "/en/",
    consentId: activeConsentId,
    captchaToken: "active-one-time-token",
    website: "",
  });
  expect(acceptedBody?.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(captchaRequests).toHaveLength(1);
  expect(externalRequests).toEqual([]);
  expect(await page.evaluate(() => ({
    bindings: window.__vbtechActiveContactSubmitBindings,
    executes: window.__vbtechActiveCaptchaExecuteCount,
    siteKey: window.__vbtechActiveCaptchaRenderSiteKey,
  }))).toEqual({ bindings: 1, executes: 1, siteKey: publicSiteKey });
  await expect(page.locator("[data-smartcaptcha-disclosure]")).toBeVisible();
});

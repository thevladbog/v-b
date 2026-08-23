import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page, Route } from "@playwright/test";
import { expect, test } from "./fixtures.js";

declare global {
  interface Window {
    __vbtechCaptchaMode: CaptchaMode;
    __vbtechCaptchaExecuteCount: number;
    __vbtechCaptchaResetCount: number;
    __vbtechCaptchaDestroyedWidgets: number[];
    __vbtechCaptchaTokenWidgets: Record<string, number>;
    __vbtechHoldCaptchaLoad: boolean;
    __vbtechReleaseCaptchaLoad?: () => void;
    __vbtechRequestIdCount?: number;
    __vbtechInitializeContactForms(): () => void;
    __vbtechDisposeContactForms(): void;
    __vbtechRemountContactForms(): void;
    __vbtechDisposeContactForm(instance: string): void;
  }
}

const fixtureOrigin = "http://127.0.0.1:43219";
const captchaScript = "https://smartcaptcha.cloud.yandex.ru/captcha.js";

const locales = [
  {
    locale: "ru",
    path: "/",
    labels: {
      name: "Имя",
      contact: "Email или Telegram",
      message: "Что вы хотите спроектировать или улучшить?",
      consent: /Я ознакомился/,
      submit: "Отправить обращение",
      success: /обращение получено/i,
      invalid: /Проверьте отмеченные поля/i,
      policy: "политикой обработки персональных данных",
      consentDocument: "согласием на обработку персональных данных",
    },
  },
  {
    locale: "en",
    path: "/en/",
    labels: {
      name: "Name",
      contact: "Email or Telegram",
      message: "What do you want to design or improve?",
      consent: /I have reviewed/,
      submit: "Send enquiry",
      success: /enquiry was received/i,
      invalid: /Review the marked fields/i,
      policy: "personal data processing policy",
      consentDocument: "personal data processing consent",
    },
  },
] as const;

type CaptchaMode = "token" | "empty" | "javascript-error" | "load-error" | "timeout";

async function mockCaptcha(page: Page, mode: CaptchaMode = "token", holdLoad = false) {
  await page.addInitScript(({ initialMode, hold }) => {
    Object.assign(window, {
      __vbtechCaptchaMode: initialMode,
      __vbtechCaptchaExecuteCount: 0,
      __vbtechCaptchaResetCount: 0,
      __vbtechCaptchaDestroyedWidgets: [],
      __vbtechCaptchaTokenWidgets: {},
      __vbtechHoldCaptchaLoad: hold,
    });
  }, { initialMode: mode, hold: holdLoad });
  await page.route(`${captchaScript}**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: String.raw`(() => {
        const current = document.currentScript;
        const url = new URL(current.src);
        if (window.__vbtechCaptchaMode === "load-error") {
          current.dispatchEvent(new Event("error"));
          return;
        }
        if (window.__vbtechCaptchaMode === "timeout") return;
        const completeLoad = () => {
          let nextWidgetId = 16;
          const optionsByWidget = new Map();
          window.smartCaptcha = {
          render(container, nextOptions) {
            const widgetId = ++nextWidgetId;
            optionsByWidget.set(widgetId, nextOptions);
            const disclosure = document.createElement("div");
            disclosure.setAttribute("data-smartcaptcha-disclosure", "");
            disclosure.setAttribute("data-smartcaptcha-widget", String(widgetId));
            disclosure.textContent = "SmartCaptcha";
            disclosure.style.minHeight = "24px";
            container.append(disclosure);
            return widgetId;
          },
          reset(widgetId) {
            if (!optionsByWidget.has(widgetId)) throw new Error("unexpected widget");
            window.__vbtechCaptchaResetCount += 1;
          },
          execute(widgetId) {
            const options = optionsByWidget.get(widgetId);
            if (!options) throw new Error("unexpected widget");
            window.__vbtechCaptchaExecuteCount += 1;
            const executeCount = window.__vbtechCaptchaExecuteCount;
            queueMicrotask(() => {
              if (window.__vbtechCaptchaMode === "javascript-error") {
                options["error-callback"]();
                return;
              }
              const token = window.__vbtechCaptchaMode === "empty"
                ? ""
                : "fixture-token-" + executeCount;
              window.__vbtechCaptchaTokenWidgets[token] = widgetId;
              options.callback(token);
            });
          },
          destroy(widgetId) {
            if (!optionsByWidget.has(widgetId)) throw new Error("unexpected widget");
            optionsByWidget.delete(widgetId);
            window.__vbtechCaptchaDestroyedWidgets.push(widgetId);
          },
          };
          const onload = window[url.searchParams.get("onload")];
          if (typeof onload === "function") onload();
        };
        if (window.__vbtechHoldCaptchaLoad) {
          window.__vbtechReleaseCaptchaLoad = completeLoad;
          return;
        }
        completeLoad();
      })();`,
    });
  });
}

async function fillValidDraft(page: Page, localized: (typeof locales)[number], suffix = "") {
  await page.getByLabel(localized.labels.name, { exact: true }).fill(`  Vlad${suffix}  `);
  await page.getByLabel(localized.labels.contact, { exact: true }).fill("  PERSON@Example.COM  ");
  await page.getByLabel(localized.labels.message, { exact: true }).fill(`  Project enquiry${suffix}.  `);
  await page.getByRole("checkbox", { name: localized.labels.consent }).check();
}

async function fillValidForm(form: Locator, localized: (typeof locales)[number], suffix: string) {
  await form.getByLabel(localized.labels.name, { exact: true }).fill(`  Vlad${suffix}  `);
  await form.getByLabel(localized.labels.contact, { exact: true }).fill("  PERSON@Example.COM  ");
  await form.getByLabel(localized.labels.message, { exact: true }).fill(`  Project enquiry${suffix}.  `);
  await form.getByRole("checkbox", { name: localized.labels.consent }).check();
}

function apiJson(route: Route, status: number, value: unknown) {
  return route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(value),
  });
}

for (const localized of locales) {
  test(`${localized.locale} fixture validates locally before loading captcha and focuses the first error`, async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await mockCaptcha(page);
    await page.goto(`${fixtureOrigin}${localized.path}`);

    const form = page.locator("[data-contact-form]");
    await expect(form).toHaveAttribute("data-internal-test-fixture", "true");
    await expect(form).toHaveAttribute(
      "data-consent-id",
      "VBT-PD-02/2026.08/01",
    );
    await page.getByRole("button", { name: localized.labels.submit }).click();

    await expect(page.getByRole("alert")).toContainText(localized.labels.invalid);
    await expect(page.getByLabel(localized.labels.name, { exact: true })).toBeFocused();
    await expect(page.getByLabel(localized.labels.name, { exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(form).toHaveAttribute("aria-busy", "false");
    expect(requests.some((value) => value.startsWith(captchaScript))).toBe(false);
    expect(requests.some((value) => value === `${fixtureOrigin}/api/contact`)).toBe(false);
  });

  test(`${localized.locale} fixture requires affirmative consent before captcha`, async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await mockCaptcha(page);
    await page.goto(`${fixtureOrigin}${localized.path}`);
    await page.getByLabel(localized.labels.name, { exact: true }).fill("Vlad");
    await page.getByLabel(localized.labels.contact, { exact: true }).fill("person@example.com");
    await page.getByLabel(localized.labels.message, { exact: true }).fill("Project enquiry.");

    await page.getByRole("button", { name: localized.labels.submit }).click();

    await expect(page.getByRole("checkbox", { name: localized.labels.consent })).toBeFocused();
    await expect(page.getByRole("checkbox", { name: localized.labels.consent })).toHaveAttribute("aria-invalid", "true");
    expect(requests.some((value) => value.startsWith(captchaScript))).toBe(false);
    expect(requests.some((value) => value === `${fixtureOrigin}/api/contact`)).toBe(false);
  });
}

for (const localized of locales) {
  test(`${localized.locale} enabled form passes WCAG 2.2 in idle and validation-error states`, async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await page.goto(`${fixtureOrigin}${localized.path}`);
      await page.evaluate((nextTheme) => { document.documentElement.dataset.theme = nextTheme; }, theme);

      for (const state of ["idle", "validation-error"] as const) {
        if (state === "validation-error") {
          await page.getByRole("button", { name: localized.labels.submit }).click();
          await expect(page.getByRole("alert")).toBeVisible();
          await expect(page.locator("[data-contact-status]")).toBeEmpty();
        }
        const result = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"])
          .analyze();
        const violations = result.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          nodes: violation.nodes.map((node) => ({ html: node.html, failureSummary: node.failureSummary })),
        }));
        expect(
          violations,
          `${localized.locale} ${theme} ${state}:\n${JSON.stringify(violations, null, 2)}`,
        ).toEqual([]);
      }
    }
  });
}

test("accepted submission is keyboard complete, clears all state, and keeps the captcha disclosure visible", async ({ page }) => {
  const localized = locales[1];
  const requests: unknown[] = [];
  await mockCaptcha(page);
  await page.route(`${fixtureOrigin}/api/contact`, async (route) => {
    const body = route.request().postDataJSON() as { requestId: string };
    requests.push(body);
    await apiJson(route, 202, { accepted: true, requestId: body.requestId });
  });
  await page.goto(`${fixtureOrigin}${localized.path}`);
  await fillValidDraft(page, localized);

  const submit = page.getByRole("button", { name: localized.labels.submit });
  await submit.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("status")).toContainText(localized.labels.success);
  await expect(page.getByLabel(localized.labels.name, { exact: true })).toBeEmpty();
  await expect(page.getByLabel(localized.labels.contact, { exact: true })).toBeEmpty();
  await expect(page.getByLabel(localized.labels.message, { exact: true })).toBeEmpty();
  await expect(page.getByRole("checkbox", { name: localized.labels.consent })).not.toBeChecked();
  await expect(submit).toBeEnabled();
  await expect(page.locator("[data-contact-form]")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("[data-smartcaptcha-disclosure]")).toBeVisible();
  expect(requests).toHaveLength(1);
  await expect(page.getByRole("status")).toContainText((requests[0] as { requestId: string }).requestId);
});

test("two-form fixture owns unique deterministic IDs and scoped accessible relationships", async ({ page }) => {
  await page.goto(`${fixtureOrigin}/en/multi/`);
  const forms = page.locator("[data-contact-form]");
  await expect(forms).toHaveCount(2);
  await expect(forms.nth(0)).toHaveAttribute("data-contact-instance", "fixture-contact-a");
  await expect(forms.nth(1)).toHaveAttribute("data-contact-instance", "fixture-contact-b");
  await forms.nth(0).getByRole("button", { name: locales[1].labels.submit }).click();
  await expect(forms.nth(0).getByLabel(locales[1].labels.name, { exact: true })).toBeFocused();
  await expect(forms.nth(0).getByRole("alert")).toBeVisible();
  await expect(forms.nth(1).getByRole("alert")).toBeHidden();
  await expect(forms.nth(1).getByLabel(locales[1].labels.name, { exact: true })).not.toHaveAttribute("aria-invalid");

  const audit = await page.evaluate(() => {
    const ids = [...document.querySelectorAll<HTMLElement>("[id]")].map((node) => node.id);
    const missingReferences = [...document.querySelectorAll<HTMLElement>("[data-contact-form] [aria-labelledby], [data-contact-form] [aria-describedby]")]
      .flatMap((node) => `${node.getAttribute("aria-labelledby") ?? ""} ${node.getAttribute("aria-describedby") ?? ""}`.trim().split(/\s+/))
      .filter(Boolean)
      .filter((id) => document.getElementById(id) === null);
    const badLabels = [...document.querySelectorAll<HTMLLabelElement>("[data-contact-form] label[for]")]
      .filter((label) => {
        const form = label.closest("[data-contact-form]");
        return !form?.querySelector(`#${CSS.escape(label.htmlFor)}`);
      })
      .map((label) => label.htmlFor);
    return {
      duplicates: ids.filter((id, index) => ids.indexOf(id) !== index),
      missingReferences,
      badLabels,
    };
  });
  expect(audit).toEqual({ duplicates: [], missingReferences: [], badLabels: [] });

  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
});

test("two forms dedupe the captcha loader and keep widget callbacks and disposal isolated", async ({ page }) => {
  const localized = locales[1];
  const captchaRequests: string[] = [];
  const bodies: Array<{ name: string; captchaToken: string; requestId: string }> = [];
  page.on("request", (request) => {
    if (request.url().startsWith(captchaScript)) captchaRequests.push(request.url());
  });
  await mockCaptcha(page, "token", true);
  await page.route(`${fixtureOrigin}/api/contact`, async (route) => {
    const body = route.request().postDataJSON() as (typeof bodies)[number];
    bodies.push(body);
    await apiJson(route, 202, { accepted: true, requestId: body.requestId });
  });
  await page.goto(`${fixtureOrigin}/en/multi/`);
  await page.evaluate(() => {
    window.__vbtechInitializeContactForms();
    window.__vbtechInitializeContactForms();
  });
  const forms = page.locator("[data-contact-form]");
  const first = forms.nth(0);
  const second = forms.nth(1);
  await fillValidForm(first, localized, " Alpha");
  await fillValidForm(second, localized, " Beta");

  await first.getByRole("button", { name: localized.labels.submit }).click();
  await second.getByRole("button", { name: localized.labels.submit }).click();
  await expect(first).toHaveAttribute("aria-busy", "true");
  await expect(second).toHaveAttribute("aria-busy", "true");
  expect(captchaRequests).toHaveLength(1);
  await page.evaluate(() => window.__vbtechReleaseCaptchaLoad?.());
  await expect(first.getByRole("status")).toContainText(localized.labels.success);
  await expect(second.getByRole("status")).toContainText(localized.labels.success);

  expect(captchaRequests).toHaveLength(1);
  expect(bodies).toHaveLength(2);
  expect(bodies[0]!.requestId).not.toBe(bodies[1]!.requestId);
  const tokenWidgets = await page.evaluate(() => window.__vbtechCaptchaTokenWidgets);
  const firstWidget = Number(await first.locator("[data-smartcaptcha-disclosure]").getAttribute("data-smartcaptcha-widget"));
  const secondWidget = Number(await second.locator("[data-smartcaptcha-disclosure]").getAttribute("data-smartcaptcha-widget"));
  expect(firstWidget).not.toBe(secondWidget);
  expect(tokenWidgets[bodies.find(({ name }) => name.includes("Alpha"))!.captchaToken]).toBe(firstWidget);
  expect(tokenWidgets[bodies.find(({ name }) => name.includes("Beta"))!.captchaToken]).toBe(secondWidget);

  await page.evaluate(() => window.__vbtechDisposeContactForm("fixture-contact-a"));
  await expect(first.locator("[data-smartcaptcha-disclosure]")).toHaveCount(0);
  await expect(second.locator("[data-smartcaptcha-disclosure]")).toBeVisible();
  expect(await page.evaluate(() => window.__vbtechCaptchaDestroyedWidgets)).toEqual([firstWidget]);

  await fillValidForm(second, localized, " Gamma");
  await second.getByRole("button", { name: localized.labels.submit }).click();
  await expect(second.getByRole("status")).toContainText(localized.labels.success);
  expect(bodies).toHaveLength(3);
  expect((await page.evaluate(() => window.__vbtechCaptchaTokenWidgets))[bodies[2]!.captchaToken]).toBe(secondWidget);
  expect(captchaRequests).toHaveLength(1);
});

test("dispose, remount, and repeated initialization keep exactly one live form binding", async ({ page }) => {
  const localized = locales[1];
  const bodies: Array<{ requestId: string }> = [];
  await mockCaptcha(page);
  await page.route(`${fixtureOrigin}/api/contact`, async (route) => {
    const body = route.request().postDataJSON() as { requestId: string };
    bodies.push(body);
    await apiJson(route, 202, { accepted: true, requestId: body.requestId });
  });
  await page.goto(`${fixtureOrigin}/en/`);
  await page.evaluate(() => {
    window.__vbtechDisposeContactForms();
    window.__vbtechRemountContactForms();
    window.__vbtechInitializeContactForms();
    window.__vbtechInitializeContactForms();
  });
  await fillValidDraft(page, localized);

  await page.getByRole("button", { name: localized.labels.submit }).click();

  await expect(page.getByRole("status")).toContainText(localized.labels.success);
  expect(bodies).toHaveLength(1);
  expect(await page.evaluate(() => window.__vbtechCaptchaExecuteCount)).toBe(1);
});

test("visitor-editable controls freeze for a delayed request and restore exactly after failure", async ({ page, contactFailures }) => {
  const localized = locales[1];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  contactFailures.expectStatus(503);
  await mockCaptcha(page);
  await page.route(`${fixtureOrigin}/api/contact`, async (route) => {
    await gate;
    await apiJson(route, 503, { error: "temporarily_unavailable" });
  });
  await page.goto(`${fixtureOrigin}/en/`);
  await fillValidDraft(page, localized);
  const form = page.locator("[data-contact-form]");
  const name = page.getByLabel(localized.labels.name, { exact: true });
  const consent = page.getByRole("checkbox", { name: localized.labels.consent });

  await page.getByRole("button", { name: localized.labels.submit }).click();
  await expect(form).toHaveAttribute("aria-busy", "true");
  await expect(name).toBeDisabled();
  await expect(consent).toBeDisabled();
  await expect(name).toHaveValue("Vlad");
  release();

  await expect(page.getByRole("status")).toContainText(/temporarily unavailable/i);
  await expect(form).toHaveAttribute("aria-busy", "false");
  await expect(name).toBeEnabled();
  await expect(consent).toBeEnabled();
  await expect(name).toHaveValue("Vlad");
  await expect(consent).toBeChecked();
});

test("a hung local API route is aborted after the fixed ten-second operation timeout", async ({ page, contactFailures }) => {
  const localized = locales[1];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  contactFailures.expectClientAbort();
  await page.clock.install();
  await mockCaptcha(page);
  await page.route(`${fixtureOrigin}/api/contact`, async (route) => {
    await gate;
    try {
      await apiJson(route, 202, {
        accepted: true,
        requestId: (route.request().postDataJSON() as { requestId: string }).requestId,
      });
    } catch {
      // The browser-owned fetch is expected to be gone after AbortController fires.
    }
  });
  await page.goto(`${fixtureOrigin}/en/`);
  await fillValidDraft(page, localized);
  const apiRequest = page.waitForRequest(`${fixtureOrigin}/api/contact`);

  await page.getByRole("button", { name: localized.labels.submit }).click();
  await apiRequest;
  await page.clock.fastForward(10_001);

  await expect(page.getByRole("status")).toContainText(/temporarily unavailable/i);
  await expect(page.locator("[data-contact-form]")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByLabel(localized.labels.name, { exact: true })).toBeEnabled();
  await expect(page.getByLabel(localized.labels.message, { exact: true })).toHaveValue("Project enquiry.");
  release();
});

test("a held captcha loader is bounded by the form operation deadline and ignores late onload", async ({ page }) => {
  const localized = locales[1];
  const requestId = "11111111-1111-4111-8111-111111111111";
  const apiRequests: string[] = [];
  await page.clock.install();
  await page.addInitScript((fixedId) => {
    window.__vbtechRequestIdCount = 0;
    Object.defineProperty(window.crypto, "randomUUID", {
      configurable: true,
      value: () => {
        window.__vbtechRequestIdCount = (window.__vbtechRequestIdCount ?? 0) + 1;
        return fixedId;
      },
    });
  }, requestId);
  page.on("request", (request) => {
    if (request.url() === `${fixtureOrigin}/api/contact`) apiRequests.push(request.url());
  });
  await mockCaptcha(page, "token", true);
  await page.goto(`${fixtureOrigin}/en/slow/`);
  await fillValidDraft(page, localized);
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000);
  const form = page.locator("[data-contact-form]");
  const name = page.getByLabel(localized.labels.name, { exact: true });
  const consent = page.getByRole("checkbox", { name: localized.labels.consent });

  await page.getByRole("button", { name: localized.labels.submit }).click();
  await expect(form).toHaveAttribute("aria-busy", "true");
  await expect(name).toBeDisabled();
  await expect(consent).toBeDisabled();
  await expect(page.locator(`script[src^="${captchaScript}"]`)).toHaveCount(1);

  await page.clock.fastForward(10_001);

  await expect(page.getByRole("status")).toContainText(/temporarily unavailable/i);
  await expect(form).toHaveAttribute("aria-busy", "false");
  await expect(name).toBeEnabled();
  await expect(consent).toBeEnabled();
  await expect(name).toHaveValue("Vlad");
  await expect(page.getByLabel(localized.labels.message, { exact: true })).toHaveValue("Project enquiry.");
  await expect(consent).toBeChecked();
  await expect(page.locator(`script[src^="${captchaScript}"]`)).toHaveCount(0);
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(() => window.__vbtechRequestIdCount)).toBe(1);

  const statusAfterTimeout = await page.getByRole("status").textContent();
  await page.evaluate(() => window.__vbtechReleaseCaptchaLoad?.());
  await expect(page.getByRole("status")).toHaveText(statusAfterTimeout ?? "");
  await expect(page.locator("[data-smartcaptcha-disclosure]")).toHaveCount(0);
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(() => window.__vbtechRequestIdCount)).toBe(1);
});

test("one timed-out form releases only its shared-loader subscription while a later form succeeds", async ({ page }) => {
  const localized = locales[1];
  const firstId = "11111111-1111-4111-8111-111111111111";
  const secondId = "22222222-2222-4222-8222-222222222222";
  const captchaRequests: string[] = [];
  const bodies: Array<{ name: string; requestId: string; captchaToken: string }> = [];
  await page.clock.install();
  await page.addInitScript(({ first, second }) => {
    const ids = [first, second] as const;
    window.__vbtechRequestIdCount = 0;
    Object.defineProperty(window.crypto, "randomUUID", {
      configurable: true,
      value: () => {
        const index = window.__vbtechRequestIdCount ?? 0;
        window.__vbtechRequestIdCount = index + 1;
        return ids[index] ?? second;
      },
    });
  }, { first: firstId, second: secondId });
  page.on("request", (request) => {
    if (request.url().startsWith(captchaScript)) captchaRequests.push(request.url());
  });
  await mockCaptcha(page, "token", true);
  await page.route(`${fixtureOrigin}/api/contact`, async (route) => {
    const body = route.request().postDataJSON() as (typeof bodies)[number];
    bodies.push(body);
    await apiJson(route, 202, { accepted: true, requestId: body.requestId });
  });
  await page.goto(`${fixtureOrigin}/en/multi/`);
  const forms = page.locator("[data-contact-form]");
  const first = forms.nth(0);
  const second = forms.nth(1);
  await fillValidForm(first, localized, " Alpha");
  await fillValidForm(second, localized, " Beta");
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000);

  await first.getByRole("button", { name: localized.labels.submit }).click();
  await expect(first).toHaveAttribute("aria-busy", "true");
  await page.clock.fastForward(5_000);
  await second.getByRole("button", { name: localized.labels.submit }).click();
  await expect(second).toHaveAttribute("aria-busy", "true");
  expect(captchaRequests).toHaveLength(1);

  await page.clock.fastForward(5_001);

  await expect(first.getByRole("status")).toContainText(/temporarily unavailable/i, { timeout: 1_000 });
  await expect(first).toHaveAttribute("aria-busy", "false", { timeout: 1_000 });
  await expect(first.getByLabel(localized.labels.name, { exact: true })).toBeEnabled();
  await expect(first.getByLabel(localized.labels.name, { exact: true })).toHaveValue("Vlad Alpha");
  await expect(second).toHaveAttribute("aria-busy", "true");
  await expect(second.getByLabel(localized.labels.name, { exact: true })).toBeDisabled();
  await expect(page.locator(`script[src^="${captchaScript}"]`)).toHaveCount(1);
  expect(bodies).toEqual([]);

  await page.evaluate(() => window.__vbtechReleaseCaptchaLoad?.());

  await expect(second.getByRole("status")).toContainText(localized.labels.success);
  await expect(first.getByRole("status")).toContainText(/temporarily unavailable/i);
  await expect(first.locator("[data-smartcaptcha-disclosure]")).toHaveCount(0);
  await expect(second.locator("[data-smartcaptcha-disclosure]")).toBeVisible();
  expect(captchaRequests).toHaveLength(1);
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toMatchObject({
    name: "Vlad Beta",
    requestId: secondId,
    captchaToken: "fixture-token-1",
  });
  expect(await page.evaluate(() => window.__vbtechRequestIdCount)).toBe(2);
});

test("safe retry reacquires a one-time token and reuses the UUID, then accepted and changed drafts rotate it", async ({ page, contactFailures }) => {
  const localized = locales[1];
  const bodies: Array<{ requestId: string; captchaToken: string; message: string }> = [];
  contactFailures.expectStatus(503, 2);
  await mockCaptcha(page);
  await page.route(`${fixtureOrigin}/api/contact`, async (route) => {
    const body = route.request().postDataJSON() as (typeof bodies)[number];
    bodies.push(body);
    if (bodies.length === 1 || bodies.length === 3) {
      await apiJson(route, 503, { error: "temporarily_unavailable" });
      return;
    }
    await apiJson(route, 202, { accepted: true, requestId: body.requestId });
  });
  await page.goto(`${fixtureOrigin}${localized.path}`);
  await fillValidDraft(page, localized);
  const submit = page.getByRole("button", { name: localized.labels.submit });

  await submit.click();
  await expect(page.getByRole("status")).toContainText(/temporarily|временно/i);
  await expect(page.getByLabel(localized.labels.name, { exact: true })).toHaveValue("Vlad");
  await expect(page.getByLabel(localized.labels.contact, { exact: true })).toHaveValue("person@example.com");
  await submit.click();
  await expect(page.getByRole("status")).toContainText(localized.labels.success);

  await fillValidDraft(page, localized);
  await submit.click();
  await expect(page.getByRole("status")).toContainText(/temporarily|временно/i);
  await page.getByLabel(localized.labels.message, { exact: true }).fill("Materially changed project enquiry.");
  await submit.click();
  await expect(page.getByRole("status")).toContainText(localized.labels.success);

  expect(bodies).toHaveLength(4);
  expect(bodies[0]!.requestId).toBe(bodies[1]!.requestId);
  expect(bodies[2]!.requestId).not.toBe(bodies[0]!.requestId);
  expect(bodies[3]!.requestId).not.toBe(bodies[2]!.requestId);
  expect(bodies.map(({ captchaToken }) => captchaToken)).toEqual([
    "fixture-token-1",
    "fixture-token-2",
    "fixture-token-3",
    "fixture-token-4",
  ]);
  expect(await page.evaluate(() => (window as Window & { __vbtechCaptchaExecuteCount: number }).__vbtechCaptchaExecuteCount)).toBe(4);
  expect(await page.evaluate(() => (window as Window & { __vbtechCaptchaResetCount: number }).__vbtechCaptchaResetCount)).toBeGreaterThanOrEqual(4);
});

test("busy state rejects a double submit while one exact request is pending", async ({ page }) => {
  const localized = locales[1];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const bodies: unknown[] = [];
  await mockCaptcha(page);
  await page.route(`${fixtureOrigin}/api/contact`, async (route) => {
    const body = route.request().postDataJSON() as { requestId: string };
    bodies.push(body);
    await gate;
    await apiJson(route, 202, { accepted: true, requestId: body.requestId });
  });
  await page.goto(`${fixtureOrigin}${localized.path}`);
  await fillValidDraft(page, localized);
  const form = page.locator("[data-contact-form]");
  const submit = page.getByRole("button", { name: localized.labels.submit });

  await form.evaluate((element: HTMLFormElement) => {
    element.requestSubmit();
    element.requestSubmit();
  });
  await expect(form).toHaveAttribute("aria-busy", "true");
  await expect(submit).toBeDisabled();
  await expect.poll(() => bodies.length).toBe(1);
  release();
  await expect(form).toHaveAttribute("aria-busy", "false");
  await expect(submit).toBeEnabled();
});

for (const mode of ["load-error", "timeout", "javascript-error", "empty"] as const) {
  test(`captcha ${mode} is recoverable and never reaches the contact endpoint`, async ({ page }) => {
    const localized = locales[1];
    const apiRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url() === `${fixtureOrigin}/api/contact`) apiRequests.push(request.url());
    });
    await mockCaptcha(page, mode);
    await page.goto(`${fixtureOrigin}${localized.path}`);
    await fillValidDraft(page, localized);

    await page.getByRole("button", { name: localized.labels.submit }).click();

    await expect(page.getByRole("status")).toContainText(/captcha.*unavailable|проверка.*недоступна/i);
    await expect(page.getByLabel(localized.labels.message, { exact: true })).toHaveValue("Project enquiry.");
    await expect(page.getByRole("button", { name: localized.labels.submit })).toBeEnabled();
    expect(apiRequests).toEqual([]);
  });
}

test("captcha provider recovery keeps the pending UUID and reacquires before the first HTTP attempt", async ({ page }) => {
  const localized = locales[1];
  const firstId = "11111111-1111-4111-8111-111111111111";
  const secondId = "22222222-2222-4222-8222-222222222222";
  const bodies: Array<{ requestId: string; captchaToken: string }> = [];
  const captchaRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(captchaScript)) captchaRequests.push(request.url());
  });
  await page.addInitScript(({ first, second }) => {
    const ids = [first, second] as const;
    window.__vbtechRequestIdCount = 0;
    Object.defineProperty(window.crypto, "randomUUID", {
      configurable: true,
      value: () => {
        const index = window.__vbtechRequestIdCount ?? 0;
        window.__vbtechRequestIdCount = index + 1;
        return ids[index] ?? second;
      },
    });
  }, { first: firstId, second: secondId });
  await mockCaptcha(page, "load-error");
  await page.route(`${fixtureOrigin}/api/contact`, async (route) => {
    const body = route.request().postDataJSON() as (typeof bodies)[number];
    bodies.push(body);
    await apiJson(route, 202, { accepted: true, requestId: body.requestId });
  });
  await page.goto(`${fixtureOrigin}${localized.path}`);
  await fillValidDraft(page, localized);
  const submit = page.getByRole("button", { name: localized.labels.submit });

  await submit.click();
  await expect(page.getByRole("status")).toContainText(/captcha.*unavailable/i);
  await expect(page.locator(`script[src^="${captchaScript}"]`)).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(window).filter((key) => key.startsWith("__vbtechSmartCaptchaOnload")))).toEqual([]);
  await page.evaluate(() => { window.__vbtechCaptchaMode = "token"; });
  await submit.click();
  await expect(page.getByRole("status")).toContainText(localized.labels.success);

  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toMatchObject({ requestId: firstId, captchaToken: "fixture-token-1" });
  expect(captchaRequests).toHaveLength(2);
  await expect(page.locator(`script[src^="${captchaScript}"]`)).toHaveCount(1);
  expect(await page.evaluate(() => Object.keys(window).filter((key) => key.startsWith("__vbtechSmartCaptchaOnload")))).toEqual([]);
  expect(await page.evaluate(() => window.__vbtechRequestIdCount)).toBe(1);
});

for (const [status, code, expected] of [
  [400, "invalid_request", /review|проверь/i],
  [400, "captcha_required", /captcha|провер/i],
  [400, "captcha_rejected", /captcha|провер/i],
  [429, "rate_limited", /later|позже/i],
  [503, "captcha_unavailable", /captcha|провер/i],
  [503, "temporarily_unavailable", /temporarily|временно/i],
] as const) {
  test(`stable ${status} ${code} preserves the normalized visible draft`, async ({ page, contactFailures }) => {
    const localized = locales[1];
    contactFailures.expectStatus(status);
    await mockCaptcha(page);
    await page.route(`${fixtureOrigin}/api/contact`, (route) => apiJson(route, status, { error: code }));
    await page.goto(`${fixtureOrigin}${localized.path}`);
    await fillValidDraft(page, localized);

    await page.getByRole("button", { name: localized.labels.submit }).click();

    await expect(page.getByRole("status")).toContainText(expected);
    await expect(page.getByLabel(localized.labels.name, { exact: true })).toHaveValue("Vlad");
    await expect(page.getByLabel(localized.labels.contact, { exact: true })).toHaveValue("person@example.com");
    await expect(page.getByLabel(localized.labels.message, { exact: true })).toHaveValue("Project enquiry.");
  });
}

test("a consent revision conflict clears retry identity, unchecks consent, and focuses current document guidance", async ({ page, contactFailures }) => {
  const localized = locales[1];
  contactFailures.expectStatus(409);
  await mockCaptcha(page);
  await page.route(`${fixtureOrigin}/api/contact`, (route) => apiJson(route, 409, { error: "consent_revision_changed" }));
  await page.goto(`${fixtureOrigin}${localized.path}`);
  await fillValidDraft(page, localized);

  await page.getByRole("button", { name: localized.labels.submit }).click();

  const form = page.locator("[data-contact-form]");
  await expect(form).toHaveAttribute("data-consent-refresh-required", "true");
  await expect(page.getByRole("status")).toContainText(/refresh.*documents/i);
  await expect(page.getByRole("checkbox", { name: localized.labels.consent })).not.toBeChecked();
  await expect(form.getByRole("link", { name: localized.labels.consentDocument })).toBeFocused();
  await form.evaluate((element: HTMLFormElement) => element.requestSubmit());
  await expect(form.getByRole("link", { name: localized.labels.consentDocument })).toBeFocused();
});

for (const malformed of [
  { name: "malformed", status: 503, body: "{" },
  { name: "oversized", status: 503, body: `{"error":"${"x".repeat(1_100)}"}` },
  { name: "extra-field", status: 429, body: JSON.stringify({ error: "rate_limited", retryAfter: 10 }) },
] as const) {
  test(`${malformed.name} public response fails safely without clearing visitor input`, async ({ page, contactFailures }) => {
    const localized = locales[1];
    contactFailures.expectStatus(malformed.status);
    await mockCaptcha(page);
    await page.route(`${fixtureOrigin}/api/contact`, (route) => route.fulfill({
      status: malformed.status,
      contentType: "application/json",
      body: malformed.body,
    }));
    await page.goto(`${fixtureOrigin}${localized.path}`);
    await fillValidDraft(page, localized);

    await page.getByRole("button", { name: localized.labels.submit }).click();

    await expect(page.getByRole("status")).toContainText(/temporarily|временно/i);
    await expect(page.getByLabel(localized.labels.message, { exact: true })).toHaveValue("Project enquiry.");
  });
}

test("network failure is recoverable and visitor data never enters persistence, URL, or cookies", async ({ page, contactFailures }) => {
  const localized = locales[1];
  contactFailures.expectAbort();
  await mockCaptcha(page);
  await page.route(`${fixtureOrigin}/api/contact`, (route) => route.abort("failed"));
  await page.goto(`${fixtureOrigin}${localized.path}`);
  await fillValidDraft(page, localized, " PrivateMarker");

  await page.getByRole("button", { name: localized.labels.submit }).click();

  await expect(page.getByRole("status")).toContainText(/temporarily|временно/i);
  const persisted = await page.evaluate(() => ({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.fromEntries(Object.entries(sessionStorage)),
    cookie: document.cookie,
    url: location.href,
  }));
  expect(JSON.stringify(persisted)).not.toContain("PrivateMarker");
});

test("enabled mobile controls expose comfortable targets and focused errors are not obscured", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "Pixel 7", "Pixel 7 owns the mobile target acceptance");
  const localized = locales[1];
  await mockCaptcha(page);
  await page.goto(`${fixtureOrigin}${localized.path}`);
  const submit = page.getByRole("button", { name: localized.labels.submit });
  const consentLabel = page.getByRole("checkbox", { name: localized.labels.consent }).locator("xpath=ancestor::label");
  for (const target of [submit, consentLabel]) {
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  await submit.click();
  const name = page.getByLabel(localized.labels.name, { exact: true });
  await expect(name).toBeFocused();
  await expect.poll(async () => {
    const box = await name.boundingBox();
    return box !== null && box.y >= 0 && box.y + box.height <= await page.evaluate(() => innerHeight);
  }).toBe(true);
});

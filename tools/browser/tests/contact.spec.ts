import AxeBuilder from "@axe-core/playwright";
import type { Page, Route } from "@playwright/test";
import { expect, test } from "./fixtures.js";

declare global {
  interface Window {
    __vbtechCaptchaMode: CaptchaMode;
    __vbtechCaptchaExecuteCount: number;
    __vbtechCaptchaResetCount: number;
    __vbtechRequestIdCount?: number;
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
      consentDocument: "проектом согласия на обработку персональных данных",
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
      consentDocument: "draft personal data processing consent",
    },
  },
] as const;

type CaptchaMode = "token" | "empty" | "javascript-error" | "load-error" | "timeout";

async function mockCaptcha(page: Page, mode: CaptchaMode = "token") {
  await page.addInitScript((initialMode) => {
    Object.assign(window, {
      __vbtechCaptchaMode: initialMode,
      __vbtechCaptchaExecuteCount: 0,
      __vbtechCaptchaResetCount: 0,
    });
  }, mode);
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
        let options;
        window.smartCaptcha = {
          render(container, nextOptions) {
            options = nextOptions;
            const disclosure = document.createElement("div");
            disclosure.setAttribute("data-smartcaptcha-disclosure", "");
            disclosure.textContent = "SmartCaptcha";
            disclosure.style.minHeight = "24px";
            container.append(disclosure);
            return 17;
          },
          reset(widgetId) {
            if (widgetId !== 17) throw new Error("unexpected widget");
            window.__vbtechCaptchaResetCount += 1;
          },
          execute(widgetId) {
            if (widgetId !== 17) throw new Error("unexpected widget");
            window.__vbtechCaptchaExecuteCount += 1;
            queueMicrotask(() => {
              if (window.__vbtechCaptchaMode === "javascript-error") {
                options["error-callback"]();
                return;
              }
              const token = window.__vbtechCaptchaMode === "empty"
                ? ""
                : "fixture-token-" + window.__vbtechCaptchaExecuteCount;
              options.callback(token);
            });
          },
        };
        window[url.searchParams.get("onload")]();
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
    await expect(page.getByText(/DRAFT.*not active|DRAFT.*не действует/i)).toBeVisible();
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
  await page.evaluate(() => { window.__vbtechCaptchaMode = "token"; });
  await submit.click();
  await expect(page.getByRole("status")).toContainText(localized.labels.success);

  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toMatchObject({ requestId: firstId, captchaToken: "fixture-token-1" });
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
  const consentLabel = page.locator("label[for='contact-consent']");
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

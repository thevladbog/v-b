import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures.js";
import {
  DISCOVERY_ARTIFACT_ROUTES,
  DRAFT_LEGAL_ROUTES,
  PUBLIC_ROUTES,
  REACHABLE_HTML_ROUTES,
} from "../../../apps/web/src/lib/route-inventory.js";

const landingPairs = [
  { path: "/", locale: "ru", alternate: "/en/" },
  { path: "/en/", locale: "en", alternate: "/" },
] as const;

const localizedPairs = [
  { ru: "/", en: "/en/" },
  { ru: "/legal/", en: "/en/legal/" },
  { ru: "/privacy/", en: "/en/privacy/" },
  { ru: "/personal-data-consent/", en: "/en/personal-data-consent/" },
] as const;

const absolute = (path: string) => new URL(path, "https://v-b.tech").toString();

for (const { path, locale, alternate } of landingPairs) {
  test(`${path} exposes its locale, paired metadata, and one primary content region`, async ({ page }) => {
    await page.goto(path);

    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", absolute(path));
    await expect(page.locator(`link[rel="alternate"][hreflang="${locale === "ru" ? "en" : "ru"}"]`)).toHaveAttribute(
      "href",
      absolute(alternate),
    );
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  });

  test(`${path} supports light, dark, persisted, and system theme modes`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(path);

    const theme = page.getByLabel(locale === "ru" ? "Тема оформления" : "Color theme").first();
    const system = theme.getByRole("button", { name: locale === "ru" ? "Тема: системная" : "Theme: system" });
    const light = theme.getByRole("button", { name: locale === "ru" ? "Тема: светлая" : "Theme: light" });
    const dark = theme.getByRole("button", { name: locale === "ru" ? "Тема: тёмная" : "Theme: dark" });
    const allSystem = page.getByRole("button", { name: locale === "ru" ? "Тема: системная" : "Theme: system" });
    const allLight = page.getByRole("button", { name: locale === "ru" ? "Тема: светлая" : "Theme: light" });
    const allDark = page.getByRole("button", { name: locale === "ru" ? "Тема: тёмная" : "Theme: dark" });

    await expect(allSystem).toHaveCount(2);
    for (const button of await allSystem.all()) await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await light.click();
    for (const button of await allLight.all()) await expect(button).toHaveAttribute("aria-pressed", "true");
    for (const button of await allSystem.all()) await expect(button).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.reload();
    for (const button of await allLight.all()) await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await dark.click();
    for (const button of await allDark.all()) await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await system.click();
    for (const button of await allSystem.all()) await expect(button).toHaveAttribute("aria-pressed", "true");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test(`${path} has no horizontal overflow`, async ({ page }) => {
    await page.goto(path);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  });

  test(`${path} effectively disables nonessential motion when requested`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(path);

    await expect
      .poll(() =>
        page.evaluate(() => {
          const seconds = (value: string) =>
            value.split(",").map((part) => {
              const token = part.trim();
              return token.endsWith("ms") ? Number.parseFloat(token) / 1000 : Number.parseFloat(token);
            });
          return [...document.querySelectorAll<HTMLElement>("*")].every((element) => {
            const style = getComputedStyle(element);
            const durations = [...seconds(style.animationDuration), ...seconds(style.transitionDuration)];
            return durations.every((duration) => Number.isFinite(duration) && duration <= 0.000_01);
          });
        }),
      )
      .toBe(true);
  });

  test(`${path} exposes a disabled contact shell without a contact or captcha request`, async ({ page }) => {
    const forbiddenRequests: string[] = [];
    page.on("request", (request) => {
      if (/\/api\/contact|captcha/i.test(request.url())) forbiddenRequests.push(request.url());
    });
    await page.goto(path);

    const form = page.locator("form[action='/api/contact']");
    const fieldset = form.getByRole("group");
    const checkbox = form.getByRole("checkbox");
    const submit = form.getByRole("button", { name: locale === "ru" ? "Отправить обращение" : "Send enquiry" });

    await expect(page.getByText(locale === "ru" ? /Онлайн-отправка недоступна/ : /Online submission is unavailable/).first()).toBeVisible();
    await expect(fieldset).toHaveAttribute("disabled", "");
    await expect(submit).toBeDisabled();
    await expect(checkbox).toBeDisabled();
    await expect(checkbox).not.toBeChecked();
    await expect(page.getByRole("link", { name: /Telegram/i }).first()).toHaveAttribute("href", "https://t.me/thevladbog");
    await expect(page.getByRole("link", { name: /Email/i }).first()).toHaveAttribute("href", "mailto:hello@v-b.tech");
    await expect(form.getByRole("link", { name: locale === "ru" ? "политикой обработки персональных данных" : "personal data processing policy" })).toHaveAttribute(
      "href",
      locale === "ru" ? "/privacy/" : "/en/privacy/",
    );
    await expect(form.getByRole("link", { name: locale === "ru" ? "проектом согласия на обработку персональных данных" : "draft personal data processing consent" })).toHaveAttribute(
      "href",
      locale === "ru" ? "/personal-data-consent/" : "/en/personal-data-consent/",
    );

    await submit.evaluate((button: HTMLButtonElement) => button.click());
    await page.waitForLoadState("networkidle");
    expect(forbiddenRequests).toEqual([]);
  });

  test(`${path} skip link focuses unobscured main content`, async ({ page }) => {
    await page.goto(path);
    await page.keyboard.press("Tab");

    const skip = page.getByRole("link", { name: locale === "ru" ? "Перейти к содержанию" : "Skip to content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");

    const main = page.getByRole("main");
    await expect(main).toBeFocused();
    await expect
      .poll(async () => {
        const [mainBox, headerBox] = await Promise.all([
          main.boundingBox(),
          page.locator("[data-site-header]").boundingBox(),
        ]);
        return mainBox !== null && headerBox !== null && mainBox.y >= headerBox.y + headerBox.height - 1;
      })
      .toBe(true);
  });
}

for (const pair of localizedPairs) {
  for (const entry of [
    { path: pair.ru, locale: "ru", target: pair.en },
    { path: pair.en, locale: "en", target: pair.ru },
  ] as const) {
    test(`${entry.path} locale switch preserves the paired route`, async ({ page }) => {
      await page.goto(entry.path);
      const language = page.getByRole("navigation", { name: entry.locale === "ru" ? "Язык" : "Language" }).first();
      await language.getByRole("link", { name: entry.locale === "ru" ? "EN" : "RU", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${entry.target.replaceAll("/", "\\/")}$`));
      await expect(page.locator("html")).toHaveAttribute("lang", entry.locale === "ru" ? "en" : "ru");
    });
  }
}

for (const path of REACHABLE_HTML_ROUTES) {
  test(`${path} loads one main and H1 without horizontal overflow`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  });
}

test("central route inventory and discovery artifacts are reachable", async ({ request }) => {
  expect(PUBLIC_ROUTES).toEqual(["/", "/en/"]);
  expect(DRAFT_LEGAL_ROUTES).toEqual([
    "/legal/",
    "/privacy/",
    "/personal-data-consent/",
    "/en/legal/",
    "/en/privacy/",
    "/en/personal-data-consent/",
  ]);

  for (const path of [...REACHABLE_HTML_ROUTES, ...DISCOVERY_ARTIFACT_ROUTES, "/404.html"]) {
    const response = await request.get(path);
    expect(response.status(), `${path} should be reachable from the static preview`).toBe(200);
    expect((await response.body()).byteLength, `${path} should not be empty`).toBeGreaterThan(0);
  }

  expect((await request.get("/robots.txt")).headers()["content-type"]).toContain("text/plain");
  expect((await request.get("/sitemap.xml")).headers()["content-type"]).toMatch(/xml/);
  expect((await request.get("/llms.txt")).headers()["content-type"]).toContain("text/plain");
});

test("landing, legal drafts, and 404 expose their intended index policy", async ({ page }, testInfo) => {
  for (const path of PUBLIC_ROUTES) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  }
  for (const path of DRAFT_LEGAL_ROUTES) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
  }

  await page.goto("/404.html");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
  await expect(page.getByRole("link", { name: "Главная на русском" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "English home" })).toHaveAttribute("href", "/en/");
  await expect(page.getByRole("link", { name: "Связаться" })).toHaveAttribute("href", "/#contact");
  await expect(page.getByRole("link", { name: "Contact", exact: true })).toHaveAttribute("href", "/en/#contact");

  if (testInfo.project.name === "Pixel 7") {
    await page.getByRole("button", { name: "Открыть меню" }).click();
  }
  const primaryNavigation = page.getByRole("navigation", { name: "Основная навигация" });
  await expect(primaryNavigation.getByRole("link", { name: "кейсы" })).toHaveAttribute("href", "/#work");
  await expect(primaryNavigation.getByRole("link", { name: "экспертиза" })).toHaveAttribute("href", "/#expertise");
  await expect(primaryNavigation.getByRole("link", { name: "подход" })).toHaveAttribute("href", "/#approach");
  await expect(primaryNavigation.getByRole("link", { name: "обо мне" })).toHaveAttribute("href", "/#about");
  await expect(primaryNavigation.getByRole("link", { name: "обсудить проект" })).toHaveAttribute("href", "/#contact");
});

test("generated runtime has no remote scripts or enabled contact and captcha clients", async ({ page, request }) => {
  await page.goto("/");
  const scriptSources = await page.locator("script[src]").evaluateAll((scripts) =>
    scripts.map((script) => (script as HTMLScriptElement).src),
  );
  expect(scriptSources.every((source) => new URL(source).origin === "http://127.0.0.1:43218")).toBe(true);

  const runtime = await Promise.all(scriptSources.map(async (source) => (await request.get(source)).text()));
  expect(runtime.join("\n")).not.toMatch(/\/api\/contact|captcha|recaptcha|hcaptcha/i);

  const config = await readFile(new URL("../package.json", import.meta.url), "utf8");
  expect(config).not.toMatch(/[\^~]/);
});

for (const localized of [
  {
    path: "/",
    open: "Открыть меню",
    close: "Закрыть меню",
    navigation: "Основная навигация",
    firstLink: "кейсы",
    lastLink: "обсудить проект",
  },
  {
    path: "/en/",
    open: "Open menu",
    close: "Close menu",
    navigation: "Primary navigation",
    firstLink: "case studies",
    lastLink: "discuss a project",
  },
] as const) {
  test(`${localized.path} mobile navigation supports its complete keyboard lifecycle`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "Pixel 7", "Mobile navigation is accepted on the required Pixel 7 project");
    await page.goto(localized.path);

    const openButton = () => page.getByRole("button", { name: localized.open });
    const closeButton = () => page.getByRole("button", { name: localized.close });
    const navigation = page.getByRole("navigation", { name: localized.navigation });
    await expect(openButton()).toBeVisible();
    await expect(openButton()).toHaveAttribute("aria-expanded", "false");
    await expect(navigation).toBeHidden();

    await openButton().click();
    await expect(closeButton()).toHaveAttribute("aria-expanded", "true");
    await expect(navigation).toBeVisible();

    await navigation.getByRole("link", { name: localized.firstLink }).click();
    await expect(openButton()).toHaveAttribute("aria-expanded", "false");
    await expect(navigation).toBeHidden();

    await openButton().click();
    await page.keyboard.press("Escape");
    await expect(navigation).toBeHidden();
    await expect(openButton()).toBeFocused();

    await openButton().click();
    await navigation.getByRole("link", { name: localized.lastLink }).focus();
    await page.keyboard.press("Tab");
    await expect
      .poll(() => page.evaluate(() => !document.querySelector("[data-site-navigation]")?.contains(document.activeElement)))
      .toBe(true);

    await expect(navigation).toBeVisible();
    await page.setViewportSize({ width: 1024, height: 800 });
    const toggleControl = page.locator("[data-navigation-toggle]");
    await expect(toggleControl).toBeHidden();
    await expect(toggleControl).toHaveAttribute("aria-expanded", "false");
    await expect(navigation).toBeVisible();
  });

}

for (const route of [
  ...DRAFT_LEGAL_ROUTES.map((path) => ({
    path,
    locale: path.startsWith("/en/") ? "en" : "ru",
  })),
  { path: "/404.html", locale: "ru" },
] as const) {
  test(`${route.path} mobile chrome supports skip and escape focus recovery`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "Pixel 7", "Mobile keyboard chrome is accepted on Pixel 7");
    const labels = route.locale === "ru"
      ? {
          skip: "Перейти к содержанию",
          open: "Открыть меню",
          close: "Закрыть меню",
          navigation: "Основная навигация",
        }
      : {
          skip: "Skip to content",
          open: "Open menu",
          close: "Close menu",
          navigation: "Primary navigation",
        };

    await page.goto(route.path);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: labels.skip });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");

    const main = page.getByRole("main");
    await expect(main).toBeFocused();
    await expect
      .poll(async () => {
        const [mainBox, headerBox] = await Promise.all([
          main.boundingBox(),
          page.locator("[data-site-header]").boundingBox(),
        ]);
        return mainBox !== null && headerBox !== null && mainBox.y >= headerBox.y + headerBox.height - 1;
      })
      .toBe(true);

    const open = page.getByRole("button", { name: labels.open });
    await open.focus();
    await page.keyboard.press("Enter");
    const close = page.getByRole("button", { name: labels.close });
    const navigation = page.getByRole("navigation", { name: labels.navigation });
    await expect(close).toHaveAttribute("aria-expanded", "true");
    await expect(navigation).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(navigation).toBeHidden();
    await expect(open).toBeFocused();
  });
}

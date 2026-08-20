import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.js";
import {
  DRAFT_LEGAL_ROUTES,
  PUBLIC_ROUTES,
  REACHABLE_HTML_ROUTES,
} from "../../../apps/web/src/lib/route-inventory.js";

const previewOrigin = "http://127.0.0.1:43218";
const allHtmlRoutes = [...REACHABLE_HTML_ROUTES, "/404.html"] as const;
const explicitThemes = ["light", "dark"] as const;
const publicRoutes = new Set<string>(PUBLIC_ROUTES);
const draftLegalRoutes = new Set<string>(DRAFT_LEGAL_ROUTES);

const themeLabels = {
  ru: {
    group: "Тема оформления",
    light: "Тема: светлая",
    dark: "Тема: тёмная",
    menuOpen: "Открыть меню",
    menuClose: "Закрыть меню",
    navigation: "Основная навигация",
  },
  en: {
    group: "Color theme",
    light: "Theme: light",
    dark: "Theme: dark",
    menuOpen: "Open menu",
    menuClose: "Close menu",
    navigation: "Primary navigation",
  },
} as const;

const interactiveSelector = [
  "a[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "summary",
  "[role='button']",
  "[role='link']",
].join(", ");

async function assertSharedChromeStyles(page: Page): Promise<void> {
  const header = page.locator("[data-site-header]");
  const locale = header.locator(".locale-links");
  const theme = header.locator(".theme-control");
  const footer = page.locator(".site-footer");

  await expect(header).toHaveCSS("position", "sticky");
  await expect(header).toHaveCSS("border-bottom-style", "solid");
  await expect(locale).toHaveCSS("display", "flex");
  await expect(theme).toHaveCSS("display", "flex");
  await expect(footer).toHaveCSS("border-top-style", "solid");
  await expect(page.locator("body")).toHaveCSS("font-family", /IBM Plex Sans/);

  const colors = await Promise.all([
    header.evaluate((element) => getComputedStyle(element).backgroundColor),
    footer.evaluate((element) => getComputedStyle(element).backgroundColor),
  ]);
  expect(colors).not.toContain("rgba(0, 0, 0, 0)");
}

async function assertVisibleTargets(page: Page): Promise<void> {
  const targets = page.locator(interactiveSelector);
  const undersized = await targets.evaluateAll((elements) =>
    elements
      .filter((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        const isDisabledFormControl =
          (element instanceof HTMLButtonElement ||
            element instanceof HTMLInputElement ||
            element instanceof HTMLSelectElement ||
            element instanceof HTMLTextAreaElement) &&
          element.matches(":disabled");
        const isDormantSkipLink = element.matches(".skip-link:not(:focus-visible)");
        // Inline links embedded in prose are not primary/chrome controls. They remain covered by axe;
        // the project's stricter 44 CSS px gate applies to every other visible, enabled action.
        const isInlineProseLink = element instanceof HTMLAnchorElement && style.display === "inline";

        return (
          !isDisabledFormControl &&
          !isDormantSkipLink &&
          !isInlineProseLink &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          box.width > 0 &&
          box.height > 0
        );
      })
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width < 44 || box.height < 44;
      })
      .map((element) => {
        const box = element.getBoundingClientRect();
        return `${element.tagName.toLowerCase()}[${element.getAttribute("aria-label") ?? element.textContent?.trim() ?? ""}] ${box.width}x${box.height}`;
      }),
  );

  expect(undersized, `Undersized visible targets:\n${undersized.join("\n")}`).toEqual([]);
}

async function assertFooterActionsRemainInline(page: Page): Promise<void> {
  const actions = page.locator(".footer-actions > p > a");
  await expect(actions).toHaveCount(2);
  const tops = await actions.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().top),
  );
  expect(Math.abs(tops[0] - tops[1]), "Footer actions wrapped onto separate rows").toBeLessThan(1);
}

async function waitForThemeTransitions(page: Page): Promise<void> {
  await page.locator(".button-primary").evaluateAll(async (elements) => {
    const transitions = elements.flatMap((element) => element.getAnimations());
    await Promise.all(transitions.map((transition) => transition.finished.catch(() => undefined)));
  });
}

function assertLocalRequests(requestUrls: readonly string[], pagePath: string): void {
  const unexpected = requestUrls.filter((value) => {
    const url = new URL(value);
    if (url.origin !== previewOrigin) return true;
    return !(
      url.pathname === pagePath ||
      url.pathname.startsWith("/_astro/") ||
      url.pathname.startsWith("/assets/") ||
      url.pathname.startsWith("/fonts/")
    );
  });

  expect(unexpected, `Unexpected browser requests:\n${unexpected.join("\n")}`).toEqual([]);
}

for (const path of allHtmlRoutes) {
  test(`${path} passes core browser acceptance in explicit light and dark themes`, async ({ page }, testInfo) => {
    const requestUrls: string[] = [];
    page.on("request", (request) => requestUrls.push(request.url()));
    await page.goto(path);
    if (path === "/" || path === "/en/") {
      await expect(page.locator(".hero-copy")).toHaveCSS("opacity", "1");
    }
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

    const locale = path.startsWith("/en/") ? "en" : "ru";
    const themeControl = page.getByLabel(themeLabels[locale].group).first();

    for (const theme of explicitThemes) {
      await themeControl.getByRole("button", { name: themeLabels[locale][theme] }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await waitForThemeTransitions(page);

      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);

      if (testInfo.project.name === "Pixel 7") {
        const menuOpen = page.getByRole("button", { name: themeLabels[locale].menuOpen });
        const navigation = page.getByRole("navigation", { name: themeLabels[locale].navigation });
        await menuOpen.click();
        await expect(page.getByRole("button", { name: themeLabels[locale].menuClose })).toHaveAttribute(
          "aria-expanded",
          "true",
        );
        await expect(navigation).toBeVisible();
        await assertVisibleTargets(page);
        await page.keyboard.press("Escape");
        await expect(navigation).toBeHidden();
        await expect(menuOpen).toBeFocused();
      } else {
        await assertVisibleTargets(page);
      }
      await assertFooterActionsRemainInline(page);
      if (draftLegalRoutes.has(path)) await assertSharedChromeStyles(page);

      if (publicRoutes.has(path)) {
        await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
      } else {
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
      }
      if (path === "/404.html") {
        await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
        await expect(page.locator('link[rel="alternate"]')).toHaveCount(0);
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

      expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    }

    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    assertLocalRequests(requestUrls, path);
  });
}

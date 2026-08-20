import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures.js";
import { REACHABLE_HTML_ROUTES } from "../../../apps/web/src/lib/route-inventory.js";

for (const path of [...REACHABLE_HTML_ROUTES, "/404.html"]) {
  test(`${path} has no automated WCAG A or AA violations`, async ({ page }) => {
    await page.goto(path);
    if (path === "/" || path === "/en/") {
      await expect(page.locator(".hero-copy")).toHaveCSS("opacity", "1");
    }

    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const violations = result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({ html: node.html, failureSummary: node.failureSummary })),
    }));

    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
}

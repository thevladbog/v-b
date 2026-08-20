# v-b.tech Production Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved v-b.tech mockup as a production-quality static Astro site with canonical RU/EN routes, light/dark/system themes, legal pages, SEO metadata, accessible interactions, and a disabled-by-default contact shell.

**Architecture:** A pnpm workspace contains an Astro static app plus shared content and legal-document packages. Locale is encoded in routes; theme is resolved before paint and progressively enhanced. The current static mockup is preserved under `prototype/` until production acceptance.

**Tech Stack:** Node.js 24+, pnpm 11.10.0, Astro 7.1.6, TypeScript 6.0.3, Vitest 4.1.10, Playwright, axe-core, self-hosted IBM Plex assets

**Spec:** `docs/superpowers/specs/2026-08-20-vbtech-production-site-design.md`

## Global Constraints

- Astro output is static; content and legal HTML work without JavaScript.
- Russian routes are rooted at `/`; English routes are rooted at `/en/`.
- Theme modes are exactly `system`, `light`, and `dark`; first visit resolves from `prefers-color-scheme`.
- No Google Fonts, analytics, marketing storage, CRM, tracking pixel, remote image or non-essential cookie.
- Current mockup remains available as a reference until explicit cleanup approval.
- All page pairs require canonical and reciprocal `hreflang`; missing pairs fail tests.
- Contact submission remains disabled until the separate contact-pipeline and deployment plans pass their release gates.
- Every task follows RED → GREEN → REFACTOR and ends in a focused commit.

---

### Task 1: Workspace and Astro build baseline

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Modify: `package.json`
- Create: `tsconfig.base.json`
- Create: `apps/web/package.json`
- Create: `apps/web/astro.config.mjs`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/src/pages/index.astro`
- Create: `apps/web/test/build-contract.test.ts`
- Move: `site/` to `prototype/site/`
- Move: `v-b-landing-final.png` to `prototype/v-b-landing-final.png`

**Interfaces:**
- Produces: workspace packages `@vbtech/web`, `@vbtech/content`, `@vbtech/legal-documents`, `@vbtech/contracts`, `@vbtech/email`.
- Produces: `pnpm build`, `pnpm test`, `pnpm typecheck`, and `pnpm lint` root commands.

- [ ] **Step 1: Write the workspace contract test**

```ts
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("Astro build contract", () => {
  it("uses static output and the production site URL", async () => {
    const source = await readFile(new URL("../astro.config.mjs", import.meta.url), "utf8");
    expect(source).toContain('site: "https://v-b.tech"');
    expect(source).toContain('output: "static"');
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `corepack pnpm --dir apps/web vitest run test/build-contract.test.ts`  
Expected: FAIL because `apps/web` and its config do not exist.

- [ ] **Step 3: Add the pinned workspace configuration and minimal Astro page**

```js
// apps/web/astro.config.mjs
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://v-b.tech",
  output: "static",
  trailingSlash: "always",
});
```

Root scripts must use Turbo and package-local scripts; root `packageManager` is `pnpm@11.10.0` and `engines.node` is `>=24`.

- [ ] **Step 4: Preserve the prototype and install dependencies**

Run: `mkdir -p prototype && git mv site prototype/site && git mv v-b-landing-final.png prototype/v-b-landing-final.png && corepack pnpm install`  
Expected: lockfile created; no production source overwrites the prototype.

- [ ] **Step 5: Run baseline gates**

Run: `corepack pnpm test && corepack pnpm typecheck && corepack pnpm build`  
Expected: PASS; `apps/web/dist/index.html` exists.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json apps prototype
git commit -m "chore: scaffold Astro production workspace"
```

### Task 2: Typed locale content and route inventory

**Files:**
- Create: `packages/content/package.json`
- Create: `packages/content/tsconfig.json`
- Create: `packages/content/src/types.ts`
- Create: `packages/content/src/site.ts`
- Create: `packages/content/src/index.ts`
- Create: `packages/content/test/content.test.ts`
- Create: `apps/web/src/pages/en/index.astro`

**Interfaces:**
- Produces: `Locale = "ru" | "en"`.
- Produces: `SITE_CONTENT: Readonly<Record<Locale, SiteContent>>`.
- Produces: `LOCALE_PATHS = { ru: "/", en: "/en/" }`.

- [ ] **Step 1: Write failing content-pair tests**

```ts
import { describe, expect, it } from "vitest";
import { LOCALES, SITE_CONTENT } from "../src/index.js";

describe("site content", () => {
  it.each(LOCALES)("has complete %s content", (locale) => {
    const page = SITE_CONTENT[locale];
    expect(page.meta.title).toBeTruthy();
    expect(page.hero.title).toBeTruthy();
    expect(page.cases).toHaveLength(3);
    expect(new Set(page.cases.map((item) => item.id))).toEqual(
      new Set(["markiro", "idento", "quokkaq"]),
    );
  });
});
```

- [ ] **Step 2: Run the content test and verify RED**

Run: `corepack pnpm --filter @vbtech/content test`  
Expected: FAIL because the package does not exist.

- [ ] **Step 3: Define the exact content types and migrate approved RU/EN copy**

```ts
export type Locale = "ru" | "en";
export interface CaseStudy {
  id: "markiro" | "idento" | "quokkaq";
  name: string;
  status: string;
  problem: string;
  role: string;
  solution: string;
  outcome: string;
  href: string;
  tags: readonly string[];
}
```

Move copy from `prototype/site/content.js` without changing approved claims. Record shared URLs and tags once and merge them into locale-specific editorial content.

- [ ] **Step 4: Render both locale roots from the typed content**

Both pages pass `locale`, `canonicalPath` and typed page content into the shared layout; no browser-locale redirect is added.

- [ ] **Step 5: Run focused and build gates**

Run: `corepack pnpm --filter @vbtech/content test && corepack pnpm --filter @vbtech/web build`  
Expected: PASS; `dist/index.html` and `dist/en/index.html` exist.

- [ ] **Step 6: Commit**

```bash
git add packages/content apps/web/src/pages
git commit -m "feat: add typed bilingual site content"
```

### Task 3: Shared layout, SEO and locale links

**Files:**
- Create: `apps/web/src/layouts/BaseLayout.astro`
- Create: `apps/web/src/components/SeoHead.astro`
- Create: `apps/web/src/components/Wordmark.astro`
- Create: `apps/web/src/components/SiteHeader.astro`
- Create: `apps/web/src/components/LocaleLinks.astro`
- Create: `apps/web/src/components/SiteFooter.astro`
- Create: `apps/web/src/lib/locale.ts`
- Create: `apps/web/test/seo.test.ts`

**Interfaces:**
- Produces: `localizedPath(locale: Locale, route: LocalizedRoute): string`.
- Produces: `BaseLayout` props `{ locale, title, description, canonicalPath, alternates }`.

- [ ] **Step 1: Write failing canonical and alternate tests**

```ts
it("renders reciprocal locale metadata", async () => {
  const ru = await readFile("dist/index.html", "utf8");
  expect(ru).toContain('<link rel="canonical" href="https://v-b.tech/">');
  expect(ru).toContain('hreflang="en" href="https://v-b.tech/en/"');
  expect(ru).toContain('hreflang="x-default" href="https://v-b.tech/"');
});
```

- [ ] **Step 2: Build and verify RED**

Run: `corepack pnpm --filter @vbtech/web build && corepack pnpm --filter @vbtech/web test -- seo.test.ts`  
Expected: FAIL because canonical/alternate metadata is absent.

- [ ] **Step 3: Implement deterministic metadata and ordinary locale links**

`SeoHead.astro` must render title, description, canonical, RU/EN alternates, `x-default`, Open Graph, Twitter card, theme colours and verified Person JSON-LD. Escape JSON-LD through `JSON.stringify` and never interpolate raw HTML.

- [ ] **Step 4: Implement accessible shared header and footer**

Header includes wordmark, navigation, locale links, theme control slot and direct contact. Footer repeats locale/theme controls and links to legal register, policy and consent.

- [ ] **Step 5: Run focused tests and inspect generated HTML**

Run: `corepack pnpm --filter @vbtech/web test -- seo.test.ts && corepack pnpm --filter @vbtech/web build`  
Expected: PASS with no `localhost` string in `dist/**/*.html`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/layouts apps/web/src/components apps/web/src/lib apps/web/test
git commit -m "feat: add canonical bilingual site layout"
```

### Task 4: Theme tokens and no-flash theme control

**Files:**
- Create: `apps/web/src/styles/tokens.css`
- Create: `apps/web/src/styles/global.css`
- Create: `apps/web/src/components/ThemeControl.astro`
- Create: `apps/web/src/scripts/theme.ts`
- Create: `apps/web/src/lib/theme.ts`
- Create: `apps/web/test/theme.test.ts`

**Interfaces:**
- Produces: `ThemeMode = "system" | "light" | "dark"`.
- Produces: `resolveTheme(mode, prefersDark): "light" | "dark"`.
- Uses storage key `vbtech-theme-v1`.

- [ ] **Step 1: Write failing pure theme tests**

```ts
expect(resolveTheme("light", true)).toBe("light");
expect(resolveTheme("dark", false)).toBe("dark");
expect(resolveTheme("system", true)).toBe("dark");
expect(parseTheme("unexpected")).toBe("system");
```

- [ ] **Step 2: Run and verify RED**

Run: `corepack pnpm --filter @vbtech/web test -- theme.test.ts`  
Expected: FAIL because `theme.ts` does not exist.

- [ ] **Step 3: Implement pure resolution and the pre-paint bootstrap**

```ts
export function resolveTheme(mode: ThemeMode, prefersDark: boolean) {
  return mode === "system" ? (prefersDark ? "dark" : "light") : mode;
}
```

The head bootstrap reads the same storage key, sets `data-theme` and `colorScheme`, and catches storage failures. It contains no network or dynamic-code capability.

- [ ] **Step 4: Implement three-state accessible control and theme tokens**

Tokens must define semantic background, surface, text, muted, border, focus, signal, success and error colours for both themes. The control exposes all three modes with `aria-pressed` and updates when the system theme changes while mode is `system`.

- [ ] **Step 5: Run tests and build**

Run: `corepack pnpm --filter @vbtech/web test -- theme.test.ts && corepack pnpm --filter @vbtech/web build`  
Expected: PASS; inline bootstrap occurs before the stylesheet link.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/styles apps/web/src/components/ThemeControl.astro apps/web/src/scripts apps/web/src/lib/theme.ts apps/web/test/theme.test.ts
git commit -m "feat: add persistent light dark and system themes"
```

### Task 5: Production landing sections and local assets

**Files:**
- Create: `apps/web/src/components/Hero.astro`
- Create: `apps/web/src/components/ProofRail.astro`
- Create: `apps/web/src/components/CaseStudy.astro`
- Create: `apps/web/src/components/SelectedWork.astro`
- Create: `apps/web/src/components/ExpertiseGrid.astro`
- Create: `apps/web/src/components/ApproachTimeline.astro`
- Create: `apps/web/src/components/AboutContact.astro`
- Create: `apps/web/src/styles/landing.css`
- Create: `apps/web/public/fonts/*`
- Create: `apps/web/public/assets/*`
- Create: `apps/web/test/landing-structure.test.ts`

**Interfaces:**
- Consumes: `SiteContent`, `CaseStudy`, theme tokens and local asset paths.
- Produces: one semantic `main`, one `h1`, three case articles and stable section IDs.

- [ ] **Step 1: Write failing generated-structure tests**

```ts
for (const file of ["dist/index.html", "dist/en/index.html"]) {
  const html = await readFile(file, "utf8");
  expect(html.match(/<main\b/g)).toHaveLength(1);
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  expect(html.match(/data-case=/g)).toHaveLength(3);
  expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
}
```

- [ ] **Step 2: Build and verify RED**

Run: `corepack pnpm --filter @vbtech/web build && corepack pnpm --filter @vbtech/web test -- landing-structure.test.ts`  
Expected: FAIL because production sections are absent.

- [ ] **Step 3: Port approved structure into focused Astro components**

Use semantic `section`, `article`, `dl`, `dt`, `dd`, headings and descriptive external link text. Keep product-interface scenes explicitly labelled as illustrations. Do not change the approved content order.

- [ ] **Step 4: Self-host and subset fonts**

Add only IBM Plex Sans/Mono weights used by the CSS, preload the primary WOFF2 files, use `font-display: swap`, and provide system fallbacks. Verify the font license file is committed alongside assets.

- [ ] **Step 5: Implement responsive and reduced-motion styling**

Match the approved desktop composition; at mobile widths use one-column cases, 44 px targets, bounded illustrations and no horizontal overflow. Disable non-essential animations under `prefers-reduced-motion`.

- [ ] **Step 6: Run structure, type and build gates**

Run: `corepack pnpm --filter @vbtech/web test -- landing-structure.test.ts && corepack pnpm --filter @vbtech/web typecheck && corepack pnpm --filter @vbtech/web build`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src apps/web/public apps/web/test/landing-structure.test.ts
git commit -m "feat: build production personal landing"
```

### Task 6: Legal registry and canonical legal pages

**Files:**
- Create: `packages/legal-documents/package.json`
- Create: `packages/legal-documents/src/types.ts`
- Create: `packages/legal-documents/src/operator.ts`
- Create: `packages/legal-documents/src/identity.ts`
- Create: `packages/legal-documents/src/documents/privacy.ts`
- Create: `packages/legal-documents/src/documents/consent.ts`
- Create: `packages/legal-documents/src/registry.ts`
- Create: `packages/legal-documents/test/registry.test.ts`
- Create: `apps/web/src/layouts/LegalLayout.astro`
- Create: `apps/web/src/components/LegalDocument.astro`
- Create: RU/EN legal page routes from the spec route table
- Create: `apps/web/test/legal-pages.test.ts`

**Interfaces:**
- Produces: codes `VBT-PD-01`, `VBT-PD-02`.
- Produces: `CURRENT_CONTACT_CONSENT_ID` from the active consent release.
- Produces: `getActiveLegalDocument(code, locale)` and `listActiveLegalDocuments(locale)`.

- [ ] **Step 1: Write failing registry lifecycle tests**

```ts
expect(listActiveLegalDocuments("ru").map((doc) => doc.code)).toEqual([
  "VBT-PD-01",
  "VBT-PD-02",
]);
expect(getActiveLegalDocument("VBT-PD-02", "ru").identity).toBe(
  CURRENT_CONTACT_CONSENT_ID,
);
```

- [ ] **Step 2: Run and verify RED**

Run: `corepack pnpm --filter @vbtech/legal-documents test`  
Expected: FAIL because the legal package does not exist.

- [ ] **Step 3: Implement identities, operator profile and paired content**

Use the approved operator details from the production spec. Legal content must cover the exact v-b.tech data inventory and purposes, label English as informational, and reject missing locale pairs or duplicate active releases.

- [ ] **Step 4: Render legal register, policy and consent routes**

Render HTML as the canonical reading format with document code, revision, effective date, authoritative-language notice and paired locale link. The footer links to all legal routes.

- [ ] **Step 5: Verify route and consent parity**

Run: `corepack pnpm --filter @vbtech/legal-documents test && corepack pnpm --filter @vbtech/web build && corepack pnpm --filter @vbtech/web test -- legal-pages.test.ts`  
Expected: PASS for all six legal pages and both registries.

- [ ] **Step 6: Commit**

```bash
git add packages/legal-documents apps/web/src/pages apps/web/src/layouts/LegalLayout.astro apps/web/src/components/LegalDocument.astro apps/web/test/legal-pages.test.ts
git commit -m "feat: add versioned personal data documents"
```

### Task 7: Disabled-by-default contact shell and accessible navigation

**Files:**
- Create: `apps/web/src/components/ContactForm.astro`
- Create: `apps/web/src/scripts/contact-form.ts`
- Create: `apps/web/src/scripts/navigation.ts`
- Create: `apps/web/src/lib/form-state.ts`
- Create: `apps/web/test/form-state.test.ts`
- Modify: `apps/web/src/components/AboutContact.astro`
- Modify: `apps/web/astro.config.mjs`

**Interfaces:**
- Produces: `PUBLIC_CONTACT_SUBMISSION_ENABLED` build flag, default `false`.
- Produces: pure `validateDraft({ name, contact, message, consent }, locale)`.
- Form action is exact `/api/contact`; no request is sent while disabled.

- [ ] **Step 1: Write failing form-state tests**

```ts
expect(validateDraft({ name: "", contact: "", message: "", consent: false }, "en")).toEqual({
  valid: false,
  fields: ["name", "contact", "message", "consent"],
});
expect(normalizeContact(" @thevladbog ")).toBe("@thevladbog");
```

- [ ] **Step 2: Run and verify RED**

Run: `corepack pnpm --filter @vbtech/web test -- form-state.test.ts`  
Expected: FAIL because the form-state module does not exist.

- [ ] **Step 3: Implement pure validation and accessible HTML**

Fields have explicit labels, `aria-describedby`, persistent error containers and an initially unchecked consent checkbox with separate policy and consent links. Add the warning not to submit passwords, payment details or unnecessary sensitive information.

- [ ] **Step 4: Implement disabled and progressive states**

When disabled, submit control is unavailable and the page explains that direct Telegram/email remain active. When enabled in a later plan, the script can import the shared contact contract without changing markup.

- [ ] **Step 5: Implement mobile navigation**

The menu button updates localized accessible labels and `aria-expanded`; navigation links close the menu; Escape closes it and restores focus; desktop mode never leaves the mobile overlay active.

- [ ] **Step 6: Run focused tests and build**

Run: `corepack pnpm --filter @vbtech/web test -- form-state.test.ts && corepack pnpm --filter @vbtech/web typecheck && corepack pnpm --filter @vbtech/web build`  
Expected: PASS; generated pages contain no enabled captcha or contact request script.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src apps/web/test/form-state.test.ts apps/web/astro.config.mjs
git commit -m "feat: add accessible contact and navigation shell"
```

### Task 8: SEO assets, 404 and browser acceptance

**Files:**
- Create: `apps/web/src/pages/404.astro`
- Create: `apps/web/src/pages/robots.txt.ts`
- Create: `apps/web/src/pages/sitemap.xml.ts`
- Create: `apps/web/src/pages/llms.txt.ts`
- Create: `apps/web/src/lib/route-inventory.ts`
- Create: `apps/web/test/discovery.test.ts`
- Create: `tools/browser/package.json`
- Create: `tools/browser/playwright.config.ts`
- Create: `tools/browser/tests/site.spec.ts`
- Create: `tools/browser/tests/accessibility.spec.ts`

**Interfaces:**
- Produces: `PUBLIC_ROUTES` as the single discovery/smoke inventory.
- Produces: browser gates for locales, themes, navigation, overflow and legal routes.

- [ ] **Step 1: Write failing discovery tests**

```ts
expect(PUBLIC_ROUTES).toContain("/privacy/");
expect(PUBLIC_ROUTES).toContain("/en/privacy/");
expect(await readText("dist/robots.txt")).toContain("Sitemap: https://v-b.tech/sitemap.xml");
```

- [ ] **Step 2: Build and verify RED**

Run: `corepack pnpm --filter @vbtech/web build && corepack pnpm --filter @vbtech/web test -- discovery.test.ts`  
Expected: FAIL because discovery routes are absent.

- [ ] **Step 3: Implement deterministic discovery and branded 404**

Sitemap includes active public routes only. Robots allows normal indexing and references the canonical sitemap. `llms.txt` lists canonical identity, services, projects and legal routes without unsupported claims. 404 includes direct home/contact links and no search-index metadata.

- [ ] **Step 4: Write browser tests before browser fixes**

```ts
for (const path of ["/", "/en/"]) {
  test(`${path} has no horizontal overflow`, async ({ page }) => {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
```

Add exact tests for three theme modes, reload persistence, locale links, one main/H1, 44 px mobile controls, reduced motion, keyboard menu, disabled form, legal routes, console warnings and axe WCAG AA violations.

- [ ] **Step 5: Run browser tests and correct only reproduced failures**

Run: `corepack pnpm --dir tools/browser test`  
Expected: PASS on Desktop Chrome and Pixel 7 projects.

- [ ] **Step 6: Run the complete web gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build && corepack pnpm --dir tools/browser test`  
Expected: PASS with a clean working tree except intentional plan tracking.

- [ ] **Step 7: Commit**

```bash
git add apps/web tools/browser package.json pnpm-lock.yaml
git commit -m "test: complete production web acceptance gates"
```

## Plan completion checkpoint

The web phase is complete when all routes render from Astro, all RU/EN and theme tests pass, legal HTML is published in the build, browser acceptance is green, and contact submission remains visibly disabled. Do not start public infrastructure or enable the form in this phase.

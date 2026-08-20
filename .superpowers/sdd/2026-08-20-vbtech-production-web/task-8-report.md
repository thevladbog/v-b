# Task 8 report — discovery, 404 and real-browser acceptance

Date: 2026-08-20
Base: `cebfe91a7e925df91c1718f3c90ed4599305aadf`

## Scope delivered

- Added deterministic `robots.txt`, `sitemap.xml`, `llms.txt` and a bilingual, branded, `noindex` static `404.html` artifact.
- Added `PUBLIC_ROUTES` as the only indexable route inventory and kept the six reachable draft legal routes in a separate `DRAFT_LEGAL_ROUTES` inventory.
- Added an isolated Playwright package with Desktop Chrome and Pixel 7 projects, continuous console warning/error and uncaught-page-error capture, failure-only artifacts, and axe WCAG 2.0/2.1 A/AA checks without disabled rules or exclusions.
- Added browser acceptance for locale metadata and switches, three theme modes and persistence, system media changes, reduced motion, overflow, touch targets, the disabled contact boundary, mobile-menu keyboard behavior, skip-link focus, route/artifact smoke checks, index policy and forbidden runtime/network clients.
- Corrected only failures reproduced by the new gates: light-theme contrast tokens, 44 CSS px locale targets, and serial root-gate isolation between generated-HTML unit tests and the browser preview build.

## Route inventory

Indexable `PUBLIC_ROUTES`, in sitemap order:

1. `/`
2. `/en/`

Reachable draft legal routes, all rendered with `noindex,nofollow` and excluded from the sitemap:

1. `/legal/`
2. `/privacy/`
3. `/personal-data-consent/`
4. `/en/legal/`
5. `/en/privacy/`
6. `/en/personal-data-consent/`

Discovery artifacts: `/robots.txt`, `/sitemap.xml`, `/llms.txt`. The generated 404 artifact is `/404.html` and is not part of the indexable inventory.

## RED evidence

1. Discovery RED: `CI=true corepack pnpm --filter @vbtech/web build && CI=true corepack pnpm --filter @vbtech/web test -- discovery.test.ts` exited 1. Vitest could not resolve `../src/lib/route-inventory.js`; the 122 pre-existing web assertions remained green.
2. Browser environment check inside the restricted sandbox exited before tests with `listen EPERM: operation not permitted 127.0.0.1:43218`. The same command was rerun with approval to permit only the task-owned local preview and browser.
3. Browser acceptance RED: the first executable two-project run reported 10 failed, 72 passed and 2 intentionally skipped desktop instances of Pixel-only checks. It reproduced landing color-contrast violations and undersized RU/EN touch targets. It also exposed two acceptance-test issues: a disabled `fieldset` must be asserted by its HTML attribute, and a role locator whose accessible name changes must be reacquired by its new name.
4. Complete-gate RED: the first root `pnpm test` included Playwright and the web package concurrently. Playwright's preview build replaced `apps/web/dist` while Vitest read generated HTML, producing 55 `ENOENT` failures. Review fix round 1 replaces that interim filtered command with an explicit unit-only graph command and a canonical serial aggregate that always follows it with Playwright.
5. Bilingual touch-target RED: extending the mobile gate to both locale roots reproduced the English dark-theme button at `42.96875 × 44` CSS px. A shared `2.75rem` minimum width fixed the real target without weakening the assertion.

## GREEN evidence

- Focused discovery: 10 web test files, 129 assertions passed, including 7 discovery assertions.
- Browser package: 84 passed, 4 skipped. The skips are the Desktop Chrome copies of the four explicitly Pixel 7-only bilingual menu/touch tests; all four run and pass in the Pixel 7 project.
- Critical-repeat gate: bilingual Pixel 7 theme, mobile navigation and 44 px touch-target checks passed 18/18 with `--repeat-each 3` and no retries.
- Root unit gate after race isolation: content 5/5, legal documents 34/34 and web 129/129 passed.
- Final complete gate is recorded below after the tracked report was present in the tree.

No test uses an arbitrary timeout. Browser assertions use semantic role/label locators where the element is exposed in the accessibility tree and web-first assertions for rendered state. The only CSS locator used for navigation state addresses the deliberately hidden post-resize toggle, which is absent from role lookup while hidden.

## Exact toolchain

- Node.js `24.18.0`
- pnpm `11.10.0`
- Astro `7.1.6`
- TypeScript `6.0.3`
- `@playwright/test` `1.62.0`
- `@axe-core/playwright` `4.12.1`
- `axe-core` `4.12.1`
- Chrome for Testing / Chromium revision `1234`, browser `151.0.7922.34`

All direct browser-package dependency specifiers are exact, non-range versions and are committed in `pnpm-lock.yaml`. Offline installation first identified the exact missing metadata artifact, `@axe-core/playwright@4.12.1`; the approved install downloaded the pinned dependency and reused the cached Chromium revision.

## Generated artifact inspection

- `robots.txt` is exact plain text, allows normal crawling and references `https://v-b.tech/sitemap.xml`.
- `sitemap.xml` is deterministic XML containing only `https://v-b.tech/` and `https://v-b.tech/en/`, in that order.
- `llms.txt` is UTF-8 plain text generated from existing typed English identity, expertise and case content, plus explicit draft-legal links. It contains no contact API, captcha, analytics or cookie claim.
- `404.html` is UTF-8 HTML with `noindex,nofollow`, RU/EN home links and RU/EN contact links.
- SHA-256: `robots.txt` `f2fe25ab1c17c6184a2ab08cf6a5113e570115e55b0dde4127d4832533c56bae`; `sitemap.xml` `f2fb5ce4c57f0ac8105c8597730afdec1c11557607f5ae8d898059b8641b8377`; `llms.txt` `b9043f779e1dfaaba83fda55a34367ec7d3fdd9a7d83fd247d2bea2d87ad1826`.

## Manual and external gates still unrun

- VoiceOver and NVDA manual acceptance was not run and is not implied by axe.
- Real HTTP 404 status through Caddy/deployment was not run; this task proves only that the static `404.html` artifact exists and is usable.
- No deployment, DNS, public/GitHub publication, infrastructure, analytics, cookies, captcha, contact backend, email integration or form enablement was performed.
- Contact submission remains visibly and mechanically disabled by default; no `/api/contact` or captcha request was observed.

## Final complete gate

The final required sequence ran after this report was tracked and exited 0:

```text
CI=true corepack pnpm lint
CI=true corepack pnpm typecheck
CI=true corepack pnpm test
CI=true corepack pnpm build
git diff --check
```

Final results:

- lint: 2 applicable workspace tasks passed; Astro reported 0 errors, 0 warnings and 0 hints;
- typecheck: 4 workspace tasks passed;
- canonical root test: unit/generated-artifact tests completed before Playwright, preventing the shared `dist` race;
- unit/generated-artifact tests: content 5/5, legal documents 34/34, web 129/129;
- static build: 9 HTML pages plus `robots.txt`, `sitemap.xml` and `llms.txt` generated successfully;
- Playwright/axe: 84 passed, 4 expected Desktop Chrome skips for Pixel-only checks, 0 failures, retries disabled;
- `git diff --check`: clean.

## Review fix round 1

The review fix makes `CI=true corepack pnpm test` the mechanically enforced serial aggregate. Its first command is the clearly named `test:unit` graph (`turbo run test --filter='!@vbtech/browser'`); only after that command succeeds does it run `corepack pnpm --dir tools/browser test`. `apps/web/test/build-contract.test.ts` compares both scripts exactly, including their order and the `&&` boundary, so the canonical root command cannot silently omit the browser gate or reintroduce concurrent `dist` writers.

The 404 now identifies itself to the shared header as a secondary route while retaining the home locale pairing. Its five primary navigation actions resolve to `/#work`, `/#expertise`, `/#approach`, `/#about`, and `/#contact`; the bilingual RU/EN home and contact recovery links remain explicit, and the page remains `noindex,nofollow`.

`llms.txt` now uses a pure typed serializer. A fixture-level unit contract proves deterministic section and list serialization, while the generated-artifact test compares the complete file byte-for-byte, including canonical pages, all six legal links, stable ordering, the final newline, and the absence of any extra unsupported text.

Focused RED evidence:

1. Root-gate contract: `CI=true corepack pnpm --filter @vbtech/web exec vitest run test/build-contract.test.ts` failed because `test:unit` was undefined.
2. llms contract: `CI=true corepack pnpm --filter @vbtech/web exec vitest run test/discovery.test.ts` failed because the pure serializer module did not exist.
3. 404 browser contract: the two-project browser run received `#work` instead of `/#work`; the Pixel project also proved the mobile menu must be opened before its semantic navigation links are asserted.
4. First canonical aggregate run proved unit-first ordering and browser inclusion, then exposed Chromium font-preload warnings when the full suite saturated the host. A six-case Desktop theme repeat reproduced broader timeouts at six workers; the same assertions passed 6/6 with two workers, confirming resource contention. The checked-in browser configuration now bounds concurrency at two without dropping, skipping, retrying, or weakening any assertion, while preserving the established self-hosted font preload contract.

Focused GREEN evidence:

- root-gate contract: 3/3;
- discovery and exact llms contracts: 8/8;
- repaired 404 contract: 2/2 across Desktop Chrome and Pixel 7;
- bounded-concurrency Desktop theme repeat: 6/6 with `--repeat-each=3`, no retries.

The review-fix final gate uses:

```text
CI=true corepack pnpm lint
CI=true corepack pnpm typecheck
CI=true corepack pnpm test
CI=true corepack pnpm build
CI=true corepack pnpm --dir tools/browser test --grep "landing, legal drafts, and 404 expose their intended index policy" --repeat-each=3
git diff --check
```

Here `pnpm test` is the full unit/generated-plus-browser gate. The final explicit Playwright command is an affected-contract repeat, not a substitute for or duplicate full browser gate.

Final review-fix results: lint passed both applicable tasks with 0 Astro diagnostics; typecheck passed all four workspace tasks; the canonical root test passed content 5/5, legal documents 34/34, web 131/131, then Playwright 84 passed with the four expected Desktop copies of Pixel-only checks skipped; build generated all 9 HTML pages and three discovery artifacts; the affected 404 contract repeat passed 6/6 across both projects with no retries; `git diff --check` was clean.

## Final whole-branch review fix wave 1 — browser and 404

The browser gate now parameterizes all nine generated HTML artifacts (`/`, `/en/`, the six draft legal routes, and `/404.html`). Each route runs once in Desktop Chrome and once in Pixel 7; within each independent route/project test, both explicit light and dark states exercise the same core acceptance assertions. This gives 36 route × project × theme executions without creating 36 separately maintained tests.

Every core execution checks one main/H1, no horizontal overflow, visible header, legal primary/recovery, and 404 action targets at a minimum 44 × 44 CSS px, the intended index policy, continuous console/page-error capture, and axe with `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22a`, and `wcag22aa`. Axe has no disabled rules or excluded regions. Captured requests must remain on `http://127.0.0.1:43218` and match only the current document, compiled `/_astro/` assets, committed `/assets/` artwork, or self-hosted `/fonts/`; no external request was observed.

On every legal route and in both themes, the same matrix also verifies computed IBM Plex Sans body typography plus styled sticky header, navigation border, flex locale/theme controls, and styled footer border/background. All six legal routes remain `noindex,nofollow`, while both landing routes remain indexable. Seven Pixel 7 tests cover all six legal routes plus 404 for keyboard skip-link focus, unobscured main focus, keyboard menu opening, Escape closing, and focus return to the toggle. Their Desktop copies are explicitly skipped because the responsive menu is a Pixel-only behavior; the full landing mobile lifecycle remains separately covered.

The generated `404.html` remains bilingual and `noindex,nofollow`, with its RU/EN home and contact recovery actions intact. Because `/404.html` is a fallback artifact rather than a stable content URL, it now omits canonical, hreflang alternate, and `og:url` metadata instead of publishing the nonexistent `https://v-b.tech/404/` URL.

Focused RED evidence:

1. `build-contract.test.ts` failed because the committed browser source lacked the explicit theme matrix, WCAG 2.2 tags, computed legal-chrome assertion, and local-request assertion.
2. `discovery.test.ts` failed because `dist/404.html` emitted `https://v-b.tech/404/` as canonical and `og:url`, plus RU/EN/x-default alternates.
3. The first expanded browser matrix passed every legal route/theme/project combination but rejected the three same-origin landing SVGs until `/assets/` was made an explicit local allowlist entry. It also caught axe contrast during the CSS transition between explicit theme states; the test now uses the Web Animations completion promise for primary-button transitions before auditing the settled theme, with no arbitrary delay or rule suppression.
4. Extending the visible-target assertion to the legal register document actions and document-page recovery action reproduced 28 px-high register links on Desktop Chrome. `legal.css` now gives both patterns an inline-flex 44 px minimum height; the full matrix passes in both themes and projects.

Focused GREEN evidence:

- generated browser-coverage contract: 4/4;
- discovery artifact contract: 8/8;
- nine-route, two-project, two-theme core matrix: 18/18 Playwright tests and 36 settled-theme axe executions;
- legal/404 mobile keyboard focus gate: 7/7 Pixel 7 checks, with 7 expected Desktop responsive-menu skips;
- critical legal/404 repeat: 21/21 Pixel 7 checks with `--repeat-each=3`, zero retries.

Final gate results for this wave:

- lint: 2/2 applicable workspace tasks, 0 Astro errors/warnings/hints;
- typecheck: 4/4 workspace tasks;
- canonical root test: content 5/5, legal documents 37/37, web 144/144, then Playwright 91 passed and 11 expected responsive-project skips;
- build: 9 HTML pages plus `robots.txt`, `sitemap.xml`, and `llms.txt`;
- critical repeat: 21/21;
- `git diff --check`: clean.

No dependency, manifest, or lockfile changed. After concurrent focused commands caused pnpm to recreate `node_modules`, the offline frozen install reported the exact missing store artifact `turbo-2.10.4.tgz`; the approved frozen install restored all 309 packages from the resolved store with 0 downloads and left tracked dependency files unchanged. No backend, captcha, deployment, DNS, form enablement, or legal copy was added or changed. Manual VoiceOver/NVDA/TalkBack acceptance remains unrun and is not implied by axe.

## Browser/404 review fix round 1/5 — comprehensive interactive targets

The 44 CSS px gate now starts from the generic enabled interactive surface (`a[href]`, `button`, visible form controls, `summary`, and explicit button/link roles) instead of a hand-maintained list of selected header/content classes. It runs for every one of the nine HTML routes, in light and dark themes, on Desktop Chrome and Pixel 7, so footer legal links, locale/theme controls, GitHub, Email, header actions, primary content actions, legal recovery actions, and 404 recovery actions share one acceptance contract.

The classification has three explicit boundaries. Native controls matching `:disabled` are excluded, including controls disabled by an ancestor fieldset. A dormant off-canvas skip link is excluded while it is not focus-visible; its focused keyboard behavior remains covered by the dedicated skip-link tests. Anchors whose computed display is exactly `inline` are classified as prose links: axe still covers them, while the project's stricter 44 px rule applies to primary and chrome actions. Every styled action (`inline-flex`, `flex`, `grid`, or block) remains in the size gate.

On Pixel 7 the core matrix now opens the mobile menu before measuring, asserts the expanded state and visible semantic navigation, runs the same generic target audit, closes with Escape, and proves focus returns to the menu toggle. This is performed on all nine routes (and therefore all six legal routes plus 404), in both themes, with restored state before the next theme. The obsolete landing-only selector audit was removed so there is no second, weaker target definition.

Focused RED reproduced the review finding in both projects on `/404.html`:

```text
Undersized visible targets:
a[Email] 37.734375x44
2 failed (Desktop Chrome, Pixel 7)
```

The full first matrix then identified the disabled contact checkbox as `20x20`; this was a test-classification issue because its ancestor fieldset, rather than its own attribute, supplies the disabled state. Switching the native-control check to `:disabled` retained the gate without changing the intentionally unavailable form.

The shared footer rule now gives footer action links a `2.75rem` minimum width and centers their labels. A geometry assertion on all route/theme/project combinations proves GitHub and Email remain on the same row, preventing undesired wrapping while preserving the existing visual layout.

Final evidence:

- focused `/404.html` GREEN: 2/2 across Desktop Chrome and Pixel 7;
- complete core matrix: 18/18 tests and 36 route/project/theme executions;
- lint: 2/2 applicable tasks, 0 Astro diagnostics;
- typecheck: 4/4 workspace tasks;
- canonical root test: content 5/5, legal documents 37/37, web 144/144, then Playwright 89 passed and 9 expected Desktop responsive-menu skips;
- build: 9 HTML pages plus `robots.txt`, `sitemap.xml`, and `llms.txt`;
- affected Pixel legal/404 core repeat: 21/21 with `--repeat-each=3`, zero retries;
- `git diff --check`: clean.

The critical repeat command was:

```text
CI=true corepack pnpm --dir tools/browser test tests/accessibility.spec.ts --project='Pixel 7' --grep '(legal/|privacy/|personal-data-consent/|404\.html) passes core browser acceptance' --repeat-each=3
```

No dependency, manifest, lockfile, backend, captcha, deployment, DNS, form-enablement, or legal-copy change is included.

## Final whole-branch review fix wave 2 — 404 language, theme chrome, and mobile consent targets

The generated 404 document remains primarily Russian, bilingual, `noindex,nofollow`, and without canonical or hreflang metadata. Every complete English fragment now establishes `lang="en"` at its meaningful text or action container: the eyebrow, heading, explanatory sentence, English-home action, and English contact action. The generated contract traverses the parsed DOM with inherited-language state, and the browser assertion performs the same check against real text nodes while the existing WCAG 2.0/2.1/2.2 A/AA axe matrix continues to cover 404 in both themes and projects.

Theme chrome now has one deterministic `theme-color` meta. The no-flash bootstrap updates it to the resolved light (`#f4f0e8`) or dark (`#0c0e10`) token before the stylesheet loads. The runtime keeps it synchronized after explicit light/dark selection, system-theme selection, operating-system media changes, and reload persistence. Browser coverage proves the crossed cases OS-light plus explicit-dark and OS-dark plus explicit-light on the landing page, and repeats the shared-layout lifecycle on `/privacy/` and `/404.html`.

The generic 44 CSS px target audit no longer excludes every computed-inline anchor. Its only inline-anchor exception is the desktop consent sentence, where WCAG 2.5.8 permits inline links within a sentence; that exception is identified by the consent-link semantic marker and applies only above the mobile breakpoint. Pixel 7 always measures those policy/consent links after their mobile action styling. A focused RU/EN regression locates them by form semantics and proves their rendered boxes are at least 44 × 44, so removing the contact action class/style cannot silently pass.

Focused RED evidence:

1. The theme/generated contracts failed because pages emitted two media-query metas, bootstrap left the light content in place for stored dark, and runtime media changes did not update it.
2. The 404 generated and browser language checks reported `ru` inheritance for the complete English fragments.
3. Temporarily removing only the existing mobile consent-action rule made the focused Pixel test fail: the English action was exactly 15 px high and the wrapped Russian action was 33.234375 px high. The rule was then restored unchanged; this mutation proves the regression gate is sensitive to the reviewed failure.

Focused GREEN evidence:

- generated theme/discovery contracts: 21/21;
- generated theme/discovery/contact contracts: 28/28;
- combined affected browser selection: 12 passed and 2 expected Desktop skips;
- affected Pixel 7 repeat: 21/21 with `--repeat-each=3`, zero retries.

Final verification:

| Gate | Result |
| --- | --- |
| `CI=true corepack pnpm lint` | PASS — 2 applicable tasks; 0 Astro diagnostics |
| `CI=true corepack pnpm typecheck` | PASS — 4 workspace tasks |
| `CI=true corepack pnpm test` | PASS — content 5/5, legal 88/88, web 146/146; Playwright 95 passed / 11 expected Desktop skips |
| `CI=true corepack pnpm build` | PASS — 9 HTML pages plus three discovery artifacts |
| Affected Pixel 7 `--repeat-each=3` | PASS — 21/21, zero retries |
| `git diff --check` | PASS |

The repeat command was:

```text
CI=true corepack pnpm --dir tools/browser test --project='Pixel 7' --grep 'supports light, dark|bootstraps and maintains|/404.html passes core browser acceptance|mobile consent legal actions meet' --repeat-each=3
```

No dependency, manifest, lockfile, backend, captcha, deployment, DNS, form enablement, legal-copy, or lifecycle change is included. Manual screen-reader acceptance remains unrun and is not implied by the DOM-language checks or axe.

## Wave 2 browser fix round 1/5 — early charset declaration

Every generated HTML artifact now receives its sole UTF-8 charset declaration directly from `BaseLayout`, before theme color, the no-flash theme bootstrap, preload markup, and SEO content. `SeoHead` no longer emits a later duplicate. The one-theme-color contract, bootstrap-before-styles ordering, canonical/alternate behavior, and 404 metadata behavior remain unchanged.

The generated regression contract covers `/`, `/en/`, all six reachable draft legal routes, and `/404.html`. It reads raw buffers, finds the exact declaration bytes, requires exactly one occurrence, and requires the complete declaration to end no later than byte 1024. A multibyte Cyrillic fixture proves the contract uses UTF-8 byte offsets rather than JavaScript character positions.

Focused RED reproduced all nine failures: RU routes and 404 ended the declaration at byte 1148; EN routes ended it at byte 1029. Focused GREEN rebuilds all artifacts with exactly one declaration beginning at byte 37 and ending at byte 59 on every route.

Final verification:

| Gate | Result |
| --- | --- |
| Web generated/unit gate | PASS — 156/156 |
| Focused theme/404 browser gate | PASS — 10/10 across Desktop Chrome and Pixel 7 |
| Focused theme/404 `--repeat-each=3` | PASS — 30/30, zero retries |
| `CI=true corepack pnpm lint` | PASS — 2 applicable tasks; 0 Astro diagnostics |
| `CI=true corepack pnpm typecheck` | PASS — 4 workspace tasks |
| `CI=true corepack pnpm test` | PASS — content 5/5, legal 88/88, web 156/156; Playwright 95 passed / 11 expected Desktop skips |
| `CI=true corepack pnpm build` | PASS — 9 HTML pages plus three discovery artifacts |
| `git diff --check` | PASS |

The critical repeat command was:

```text
CI=true corepack pnpm --dir tools/browser test --grep 'supports light, dark|bootstraps and maintains|/404.html passes core browser acceptance' --repeat-each=3
```

No dependency, manifest, lockfile, backend, captcha, deployment, DNS, form-enablement, legal-copy, theme lifecycle, or canonical-policy change is included.

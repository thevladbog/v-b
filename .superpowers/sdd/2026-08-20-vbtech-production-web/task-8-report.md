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

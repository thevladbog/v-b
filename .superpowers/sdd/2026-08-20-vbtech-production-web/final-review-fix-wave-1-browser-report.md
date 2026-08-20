# Final whole-branch review fix wave 1/5 — browser and 404 portion

## Scope and base

- Base SHA: `cd5de7d082fab1a4bbf7c30c9d0d7e1a07c65cee`.
- Scope is limited to the remaining browser coverage gap and 404 metadata.
- No backend, captcha, deployment, DNS, form enablement, legal copy, dependency manifest, or lockfile change is included.

## Browser acceptance matrix

The Playwright core matrix covers all nine generated HTML artifacts: the RU/EN landing routes, all six RU/EN draft legal routes, and `/404.html`. Each route is an independent test in Desktop Chrome and Pixel 7; each test exercises both explicit light and dark states. Shared helper assertions avoid separately maintained route × project × theme copies while still executing all 36 combinations.

For every settled theme state, the gate verifies:

- one main landmark and one H1;
- no horizontal overflow;
- all relevant visible header controls/links, legal document/recovery actions, and 404 recovery actions are at least 44 × 44 CSS px;
- landing routes have no robots exclusion, while all draft legal routes and 404 emit `noindex,nofollow`;
- axe reports no violations for WCAG 2.0, 2.1, or 2.2 A/AA tags, with no disabled rule or excluded region;
- continuous console warning/error and uncaught-page-error fixtures remain empty;
- all captured requests are same-origin and match the explicit document, `/_astro/`, `/assets/`, or `/fonts/` allowlist; no external request occurs.

All six legal pages additionally prove computed shared chrome in both themes: IBM Plex Sans body typography, sticky and bordered header, flex locale/theme controls, and bordered/nontransparent footer. The browser suite therefore regression-proves the shared `site-chrome.css` extraction from `fe24e85` rather than relying only on generated CSS source inspection.

All six legal routes and 404 have a Pixel 7 keyboard test for the skip link, unobscured main focus, Enter-opened mobile menu, Escape closure, and focus restoration to the toggle. The seven Desktop copies are explicitly skipped because the responsive menu is not displayed there. Landing routes retain their fuller bilingual mobile lifecycle tests.

## 404 metadata

`SeoHead` and `BaseLayout` accept omitted canonical inputs. All normal landing and legal callers still provide canonical and alternate paths unchanged. The 404 caller omits them, so generated `/404.html` retains its description, social title/description, bilingual recovery actions, and `noindex,nofollow`, but emits no canonical link, hreflang alternate, or `og:url` for the nonexistent `/404/` route.

## TDD evidence

### RED

```text
build-contract.test.ts
Tests 1 failed | 3 passed
Missing: explicitThemes, route/theme loop, wcag22 tags, legal computed-style assertion, local request assertion

discovery.test.ts
Tests 1 failed | 7 passed
Received: canonical https://v-b.tech/404/, three hreflang alternates, and matching og:url
```

The first executable expanded Playwright matrix then produced 12 passes and 6 failures. Four landing failures were the deliberately strict local allowlist discovering committed `/assets/*.svg` requests; two 404 failures and one overlapping landing failure were axe observing the primary-button color during the real 200 ms light/dark CSS transition. `/assets/` is now an explicit same-origin asset prefix, and the audit waits on the affected element's Web Animations completion promise before evaluating the settled state. No timeout, retry, axe exclusion, rule disablement, or contrast threshold change was introduced.

An additional focused RED included the legal register document links and legal document recovery links in the 44 px contract. RU and EN register actions were only 28 px high on Desktop Chrome. A shared `legal.css` rule now renders both primary/recovery patterns as inline-flex targets with a 2.75 rem minimum height; the complete route/theme matrix passes afterward.

### GREEN

```text
Focused generated contracts: build 4/4; discovery 8/8
Core browser matrix: 18/18 tests; 36 route/project/theme axe executions
Focused legal/404 mobile keyboard: Pixel 7 7/7; Desktop 7 expected skips
Critical Pixel 7 repeat: 21/21 with --repeat-each=3; retries disabled
```

## Final verification

| Gate | Result |
| --- | --- |
| `CI=true corepack pnpm lint` | PASS — 2 applicable tasks; 0 Astro diagnostics |
| `CI=true corepack pnpm typecheck` | PASS — 4 workspace tasks |
| `CI=true corepack pnpm test` | PASS — content 5, legal 37, web 144; Playwright 91 passed / 11 expected skips |
| `CI=true corepack pnpm build` | PASS — 9 HTML pages plus three discovery artifacts |
| Pixel legal/404 `--repeat-each=3` | PASS — 21/21, zero retries |
| `git diff --check` | PASS |

Dependency installation did not change tracked inputs. The offline frozen restore identified `turbo-2.10.4.tgz` as missing; the approved frozen install restored 309 packages with 0 downloads and left the lockfile unchanged.

Manual screen-reader acceptance remains unrun. No deployment or external production behavior is claimed.

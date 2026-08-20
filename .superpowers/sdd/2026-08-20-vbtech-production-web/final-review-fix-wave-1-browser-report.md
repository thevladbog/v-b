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

## Review follow-up — comprehensive 44 px action gate

The previous selector list did not include footer actions. Its focused RED on `/404.html` failed in both required projects with `a[Email] 37.734375x44`. The replacement gate locates the generic interactive surface (`a[href]`, buttons, visible form controls, `summary`, and explicit button/link roles) on all nine routes, both explicit themes, and both projects.

The gate explicitly excludes native controls matching `:disabled` (including controls disabled by an ancestor fieldset), the dormant off-canvas skip link while it is not focus-visible, and computed-inline prose anchors. The latter remain axe-covered; the project-specific 44 px rule is defined for primary/chrome actions. All styled actions remain measurable. This exact classification prevented the disabled 20 px contact checkbox from being misreported while retaining footer, header, landing, legal, and recovery actions.

Pixel 7 opens its menu before each theme's measurement, proves navigation is visible and expanded, then closes with Escape and verifies focus restoration. This runs on every route, including all six legal artifacts and 404. The earlier landing-only partial selector test was removed. Footer action links now have a shared `2.75rem` minimum width with centered labels, and a cross-matrix geometry assertion proves GitHub and Email do not wrap onto separate rows.

Final verification:

| Gate | Result |
| --- | --- |
| Focused `/404.html` target test | PASS — 2/2 after exact 37.734375 × 44 RED |
| Nine-route core browser matrix | PASS — 18/18; 36 theme executions |
| `CI=true corepack pnpm lint` | PASS — 2 applicable tasks; 0 Astro diagnostics |
| `CI=true corepack pnpm typecheck` | PASS — 4 workspace tasks |
| `CI=true corepack pnpm test` | PASS — content 5, legal 37, web 144; Playwright 89 passed / 9 expected skips |
| `CI=true corepack pnpm build` | PASS — 9 HTML pages plus three discovery artifacts |
| Pixel legal/404 core `--repeat-each=3` | PASS — 21/21, zero retries |
| `git diff --check` | PASS |

The repeat used the verified seven-test selection:

```text
CI=true corepack pnpm --dir tools/browser test tests/accessibility.spec.ts --project='Pixel 7' --grep '(legal/|privacy/|personal-data-consent/|404\.html) passes core browser acceptance' --repeat-each=3
```

No dependency, manifest, lockfile, backend, captcha, deployment, DNS, form enablement, or legal copy changed. Manual screen-reader acceptance remains unrun.

## Final whole-branch review fix wave 2 — inherited language, resolved theme color, and consent actions

The `/404.html` contract now verifies language inheritance rather than merely checking that English words exist. The document language remains Russian, while each complete English eyebrow, heading, explanatory sentence, and recovery action inherits `en` from the nearest meaningful container. This is covered against parsed generated HTML and the live browser DOM, alongside the unchanged bilingual recovery, `noindex,nofollow`, omitted canonical/hreflang metadata, and the existing unmodified WCAG 2.0/2.1/2.2 A/AA axe run.

One `theme-color` meta now represents the actually resolved page theme. The pre-stylesheet bootstrap sets its exact token color together with `data-theme` and `color-scheme`; the runtime updates it for explicit selection, system selection, media changes, and persisted reloads. Browser coverage crosses OS and explicit preferences in both directions on the landing route and exercises the same behavior on representative legal and 404 shared layouts.

The target audit's former global computed-inline-anchor escape hatch is removed. The only retained exception is explicitly scoped to desktop consent links embedded in sentence text, consistent with the WCAG 2.5.8 inline-text exception. On Pixel 7 these same policy/consent links become primary mobile actions and are always measured. A separate form-semantic RU/EN test proves each is at least 44 × 44 and fails if its mobile styling is removed.

### TDD evidence

RED:

- generated pages had two OS-media `theme-color` metas; explicit or persisted preference did not determine browser chrome;
- all five complete English 404 fragments/actions inherited the root `ru` language;
- a deliberate mutation that removed the mobile consent-action rule reproduced 15 px (English) and 33.234375 px (Russian) target heights.

GREEN:

| Gate | Result |
| --- | --- |
| Generated theme/discovery | PASS — 21/21 |
| Generated theme/discovery/contact | PASS — 28/28 |
| Affected browser selection | PASS — 12 passed / 2 expected Desktop skips |
| Pixel affected `--repeat-each=3` | PASS — 21/21, zero retries |
| `CI=true corepack pnpm lint` | PASS — 2 applicable tasks; 0 Astro diagnostics |
| `CI=true corepack pnpm typecheck` | PASS — 4 workspace tasks |
| `CI=true corepack pnpm test` | PASS — content 5/5, legal 88/88, web 146/146; Playwright 95 passed / 11 expected Desktop skips |
| `CI=true corepack pnpm build` | PASS — 9 HTML pages plus three discovery artifacts |
| `git diff --check` | PASS |

The critical repeat used:

```text
CI=true corepack pnpm --dir tools/browser test --project='Pixel 7' --grep 'supports light, dark|bootstraps and maintains|/404.html passes core browser acceptance|mobile consent legal actions meet' --repeat-each=3
```

No dependency, lockfile, backend, captcha, deployment, DNS, form-enablement, legal-copy, or lifecycle change is part of this wave. Manual screen-reader acceptance remains unrun.

## Wave 2 browser follow-up — charset within the first 1024 UTF-8 bytes

The expanded no-flash theme bootstrap had pushed the complete `<meta charset="utf-8">` declaration beyond HTML's first-1024-byte boundary. The source of the ordering was ownership: `SeoHead` emitted charset only after `BaseLayout`'s theme bootstrap and font preloads. Charset now belongs to the document layout and is the first element in `<head>`; the later SEO copy is removed.

The all-nine generated-artifact contract operates on `Buffer` values and requires exactly one complete declaration ending within byte 1024. Its Cyrillic negative fixture demonstrates that a character-index implementation would incorrectly accept a declaration whose UTF-8 byte end is beyond the boundary.

RED and GREEN evidence:

- RED — 9/9 artifact cases failed: RU/404 byte end 1148, EN byte end 1029;
- GREEN — all nine artifacts contain one declaration at byte range `[37, 59)`;
- focused theme/404 browser coverage — 10/10;
- affected Desktop Chrome and Pixel 7 repeat — 30/30 with `--repeat-each=3`.

Final gates:

| Gate | Result |
| --- | --- |
| Web generated/unit | PASS — 156/156 |
| `CI=true corepack pnpm lint` | PASS — 2 applicable tasks; 0 Astro diagnostics |
| `CI=true corepack pnpm typecheck` | PASS — 4 workspace tasks |
| `CI=true corepack pnpm test` | PASS — content 5/5, legal 88/88, web 156/156; Playwright 95 passed / 11 expected Desktop skips |
| `CI=true corepack pnpm build` | PASS — 9 HTML pages plus three discovery artifacts |
| `git diff --check` | PASS |

Theme-color remains singular and resolved by the existing bootstrap/runtime contract; SEO canonical/alternate and 404 omission behavior are unchanged. No dependency, lockfile, backend, deployment, DNS, form-enablement, legal-copy, or lifecycle change is included.

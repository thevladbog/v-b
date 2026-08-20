# Final whole-branch review fix wave 1/5 — legal/unit portion

## Commit contract and scope

- Base SHA: `93fdf60b1c14483112d2f219fd1d851dfb3dc30a`.
- Exact commit subject: `fix: share legal chrome and derive current releases`.
- Final commit SHA is supplied in the controller handoff because the commit cannot contain its own stable SHA.
- Scope is limited to shared frontend chrome, generated legal-page unit coverage, and the legal registry lifecycle model. The lockfile, browser package and Playwright tests, 404 source, backend, deployment, and form-enablement behavior were not changed.

## Finding A — shared legal-page chrome

The six legal routes used `BaseLayout`, but font faces and all shared shell/skip-link/header/navigation/locale/theme/footer styling lived in `landing.css`. Because only landing roots and 404 imported that stylesheet, generated legal pages linked global and legal-content CSS without the actual shared chrome styles.

The fix extracts the existing local font declarations and shared responsive chrome rules unchanged into `site-chrome.css`, imported once by `BaseLayout`. `landing.css` now contains landing/404 composition only and reuses the shared site variables. Legal pages receive the same shell, font, skip link, wordmark, sticky header, desktop/mobile navigation, locale controls, theme controls, and footer without loading hero, signal-field, case-study, expertise, approach, or contact-panel composition.

Generated-output tests now read every stylesheet linked from each of the six legal HTML files and require:

- the local IBM Plex font face and critical declarations for shell, skip link, header, navigation, locale/theme controls, and footer;
- absence of representative landing-only composition selectors;
- only root-relative local stylesheet, preload, module, script, and CSS font URLs;
- `BaseLayout` ownership of `site-chrome.css` and absence of shared chrome/font declarations from `landing.css`.

The pre-existing legal-page contract still checks exact `noindex,nofollow`, draft banner, canonical/alternate links, one main/H1, paired locale routes, semantic content, and unsafe rendering.

## Finding B — lifecycle-derived current releases

The old registry assigned all releases directly to `CURRENT_RELEASES`, selected consent with the first array match, and mapped every release from `listCurrentLegalDocuments`. That was only correct while there was exactly one release per code and became order-dependent when retained history was added.

The fix adds `deriveCurrentLegalReleases(releases)`. It returns a stable code-ordered list with one current release per code, choosing the sole active release when present and otherwise the sole draft candidate. It rejects missing current releases and multiple draft or active releases. The committed current registry remains exactly the two drafts, so selection remains fail-closed.

The same derivation validates retained-history relationships:

- every `supersedes` target exists and has the same document code;
- only a release whose status is `superseded` may be a target;
- every superseded release has exactly one successor and forks are rejected;
- draft releases cannot declare `supersedes`;
- the graph is acyclic;
- duplicate identities cannot enter derivation.

`CURRENT_CONTACT_CONSENT_ID`, `listCurrentLegalDocuments`, `getCurrentLegalDocument`, active accessors, and the publishability guard now consume the derived current set rather than all releases or a first array match. Tests validate active-plus-superseded history and its reversed ordering, active precedence when a next draft is present, absent-current rejection, missing/cross-code targets, invalid target/draft statuses, orphaned superseded releases, forks, and cycles.

## TDD evidence

### RED

Tests were added before production changes.

```text
packages/legal-documents/node_modules/.bin/vitest run --root packages/legal-documents
Test Files  1 failed | 1 passed (2)
Tests       1 failed | 34 passed (35)
Primary failure: an active release whose supersedes target did not exist was accepted.
```

The order-independent derivation fixture and invalid graph cases were also authored before the implementation. The initial invalid-target assertion stopped that combined mutation test at its first accepted invalid graph; the later GREEN run executes the complete fixture set.

```text
CI=true corepack pnpm --filter @vbtech/web test -- legal-pages.test.ts
Build        9 static pages
Test Files   1 failed | 9 passed (10)
Tests        7 failed | 131 passed (138)
Failures     all six legal routes lacked @font-face/shared chrome; BaseLayout did not own site-chrome.css
Exit status  1
```

### GREEN

```text
CI=true corepack pnpm --filter @vbtech/legal-documents test
Test Files  2 passed (2)
Tests       37 passed (37)

CI=true corepack pnpm --filter @vbtech/web test -- legal-pages.test.ts
Build        9 static pages
Test Files   10 passed (10)
Tests        138 passed (138)
```

The web package script runs the complete web unit suite after building, even when given the focused legal filename argument.

## Verification gates

| Gate | Result |
| --- | --- |
| Legal tests | PASS — 2 files, 37 tests |
| Legal typecheck | PASS |
| Content tests | PASS — 1 file, 5 tests |
| Content typecheck | PASS |
| Web tests / legal regression | PASS — 10 files, 138 tests |
| Web typecheck | PASS — 39 files, 0 errors, 0 warnings, 0 hints |
| Web build with default submission flag | PASS — 9 static pages plus text/XML endpoints |
| Complete non-browser unit graph | PASS — content 5, legal 37, web 138 |
| `PUBLIC_CONTACT_SUBMISSION_ENABLED=true` web build | EXPECTED FAIL — exit 1, `Draft consent VBT-PD-02/DRAFT cannot be used when submission is enabled` |
| `git diff --check` | PASS |

The generated legal output was restored with a normal build after the deliberate enabled-submission failure and inspected through the generated-output suite. No Playwright file or browser-package behavior was changed in this wave.

## Legal and activation boundary

- `VBT-PD-01/DRAFT` and `VBT-PD-02/DRAFT` remain the only committed releases.
- Both remain `status: draft`, `revision: null`, and `effectiveDate: null`.
- There is no active legal document. `CURRENT_CONTACT_CONSENT_ID` remains `VBT-PD-02/DRAFT` and enabled submission still fails the build.
- All six legal routes remain visibly labeled drafts and emit `noindex,nofollow`.
- No legal approval, effective date, publication, deployment, or form activation is claimed. Owner/legal/provider review and production-flow verification remain required before activation.

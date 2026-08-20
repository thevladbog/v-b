# Task 2 report: Typed locale content and route inventory

## Scope delivered

- Added the private `@vbtech/content` workspace package with typed `Locale`, `CaseStudy`, `SiteContent`, `ContentItem`, and `Project` contracts.
- Exported `LOCALES`, `LOCALE_PATHS`, and `SITE_CONTENT` from the package entry point.
- Migrated the approved Russian and English editorial content from `prototype/site/content.js` without changing its claims.
- Centralized each case's ID, name, status, URL, and tags in `CASE_FACTS`; locale-specific case editorial text is merged with those facts.
- Updated the Russian root and created the English root. Each deterministically selects its locale, canonical path, and typed page content; no browser-locale redirect is present.
- Added the required content-pair test for complete bilingual pages and the shared three-case inventory.

## TDD evidence

1. Created `packages/content/test/content.test.ts` before the package implementation.
2. Ran `corepack pnpm --filter @vbtech/content test` before creating the package. It failed as expected with `No projects matched the filters`, proving the new package was absent.
3. Added the minimum package implementation and route consumers.
4. Re-ran the focused test after restoring the workspace's optional native test dependency; it passed with 1 test file and 2 tests.

## Verification

| Check | Result |
| --- | --- |
| `CI=true corepack pnpm --filter @vbtech/content test` | PASS — 1 file, 2 tests |
| `CI=true corepack pnpm --filter @vbtech/content typecheck` | PASS |
| `CI=true corepack pnpm --filter @vbtech/web build` | PASS — generated `/index.html` and `/en/index.html` |
| `git diff --check` | PASS |

## Self-review

- Confirmed all three required case IDs are present for both locales.
- Confirmed URLs and technology tags are defined only once for each case.
- Confirmed the English page is a static `/en/` route and there is no runtime locale redirect.
- Kept visual layout, themes, legal pages, and production sections out of this task.

## Concern carried forward

The shared layout mentioned by the task contract does not yet exist in the Task 1 workspace and is owned by the following layout/SEO task. The two root pages already establish the typed `locale`, `canonicalPath`, and `page` inputs; the later task should pass those unchanged into its new shared layout.

## Fix round 1/5

### Changes

- Centralized the shared `sys-004` and `sys-005` project ID, name, and URL facts in `PROJECT_FACTS`; `projectsFor` merges locale-specific descriptions and status copy.
- Added `assertCompleteLocalizedStrings`, a recursive content validator. It rejects blank string leaves with their full content path and ignores non-string facts.
- Expanded the content test to validate every nested string in each typed locale page, demonstrate that a blank nested `contact.formSubmit` is rejected, and preserve acceptance of non-string facts.

### TDD evidence

1. Updated the test before the validator existed.
2. Ran `CI=true corepack pnpm --filter @vbtech/content test` and observed the expected RED failure: `assertCompleteLocalizedStrings is not a function`; the blank nested translation was therefore not accepted by a missing implementation.
3. Added the validator and shared-project-fact merge, then reran the focused test.

### Verification output

| Command | Result |
| --- | --- |
| `CI=true corepack pnpm --filter @vbtech/content test` | PASS — 1 file, 3 tests before the final non-string-fact test addition |
| `CI=true corepack pnpm --filter @vbtech/content typecheck` | PASS |
| `CI=true corepack pnpm --filter @vbtech/web build` | PASS — `/index.html` and `/en/index.html` generated |

### Final post-change verification

- `CI=true corepack pnpm --filter @vbtech/content test`: PASS — 1 file, 4 tests.
- `CI=true corepack pnpm --filter @vbtech/content typecheck`: PASS.
- `CI=true corepack pnpm --filter @vbtech/web build`: PASS — generated `/index.html` and `/en/index.html`.
- `git diff --check`: PASS.

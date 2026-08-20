# Task 6 — Draft legal registry and canonical legal pages

## Commit contract

- Starting HEAD: `46e1f60a982575099b28c977f9ec6d108fa68f02`.
- Required single commit subject: `feat: add versioned personal data documents`.
- Final task commit SHA is supplied in the controller handoff. A commit cannot contain its own stable SHA because adding that SHA changes the commit object; no report-only follow-up commit is created.

## Lifecycle decision

- The committed releases are exactly `VBT-PD-01/DRAFT` and `VBT-PD-02/DRAFT`.
- Both releases have status `draft`, `revision: null`, and `effectiveDate: null`.
- There is no active legal document in either locale. `listActiveLegalDocuments(locale)` returns an empty list and `getActiveLegalDocument(code, locale)` throws a clear no-active-document error.
- `CURRENT_CONTACT_CONSENT_ID` is exactly `VBT-PD-02/DRAFT`. `assertContactConsentPublishable(id, true)` rejects this draft identity, so it cannot be treated as accepted or publishable when submission is enabled.
- Preview routes deliberately use `getCurrentLegalDocument` / `listCurrentLegalDocuments`, not the active-document API.
- The status model supports `draft`, `active`, `superseded`, and `withdrawn`. Synthetic valid active releases prove the future activation interface without changing the current draft-only state.
- Registry validation rejects duplicate release identities, duplicate routes, missing RU/EN route or content pairs, duplicate active releases, release/content mismatches, external or malformed routes, invalid published revision/effective-date metadata, inconsistent identities, and draft releases that invent a public revision or effective date.

## Source review metadata

Review date recorded in the package: `2026-08-20`.

Primary inputs recorded as data for repeatable publication review:

1. Official legal-information system, Federal Law No. 152-FZ: `https://ips.pravo.gov.ru/api/ips/legislation/document?baseid=None&hash=98490812b3409e2a8d78a11ca9010f434ea3d9250a11dbbdb78690cd5551bdd6`.
2. Yandex Cloud legal guidance: `https://yandex.cloud/ru/docs/troubleshooting/legal/how-to/fl-152`.
3. Yandex Cloud 152-FZ boundary: `https://yandex.cloud/ru/solutions/152-fz`.
4. SmartCaptcha terms: `https://yandex.ru/legal/cloud_terms_smartcaptcha/ru/`.

Approved structural/operator source reviewed:

- `/Users/thevladbog/PRSOME/q/packages/legal-documents/src/**`;
- exact operator snapshot source: `/Users/thevladbog/PRSOME/q/packages/legal-documents/src/operator.ts`;
- current production specification sections 8–10: `docs/superpowers/specs/2026-08-20-vbtech-production-site-design.md`.

These sources are implementation inputs, not legal approval. Legislation, provider terms, contracting entities, roles, regions, and the complete production inventory must be checked again before activation.

## Operator snapshot

The versioned profile `operator-vbtech-2026-08-20` contains only the approved fields:

- name: `Богатырев Владислав Сергеевич`;
- postal address: `353745, Краснодарский край, Ленинградский район, ст. Ленинградская, ул. Грузская, д. 26`;
- email: `hello@v-b.tech`;
- phone: `+7 934 355-14-90`;
- site: `https://v-b.tech`.

No legal status, tax identifier, registration number, or other unsupported identity fact was added. Tests require owner confirmation of every field before activation.

## Package and content inventory

Created `@vbtech/legal-documents` with:

- discriminated release and typed content-block contracts;
- revision/date validation and draft/published identities;
- versioned operator profile;
- matched RU/EN policy candidate `VBT-PD-01/DRAFT`;
- matched RU/EN consent candidate `VBT-PD-02/DRAFT`;
- lifecycle/source validation, current-candidate and active accessors, and the submission publishability guard;
- source-review metadata and an explicit activation checklist.

The policy covers the exact three visitor fields and bounds, no attachments, sensitive-data warning, bounded operational data, exact purposes and exclusions, operations, one-year business-correspondence limit, shorter encrypted delivery-payload lifecycle, provider roles/review boundary, Russian localization, no intended cross-border transfer, bounded security/incident handling, subject requests, `vbtech-theme-v1`, bounded server logs, no analytics/advertising cookies, conditional captcha, Russian authority, informational English translation, and explicit draft/not-in-force status.

The consent covers the initially unchecked required-checkbox action, separate policy/consent links, exact operator and data inventory, purposes/exclusions, operations/provider categories, retention/short outbox lifecycle, withdrawal routes and effect, Russian authority/informational translation, `VBT-PD-02/DRAFT`, absent public revision/effective date, and the prominent disabled-submission/non-acceptance boundary.

Automated content checks found no `Markiro`, `MKR-`, tenant, demo, company-field, or optional-phone residue in legal source/rendering.

## Route inventory

| Purpose | Russian | English | Lifecycle |
| --- | --- | --- | --- |
| Draft register | `/legal/` | `/en/legal/` | `noindex,nofollow` |
| Draft policy | `/privacy/` | `/en/privacy/` | `noindex,nofollow` |
| Draft consent | `/personal-data-consent/` | `/en/personal-data-consent/` | `noindex,nofollow` |

All six pages have unique localized titles/descriptions, absolute canonical URLs, reciprocal RU/EN/x-default alternates, exact paired locale controls, one `main`, one `h1`, visible localized draft banners, canonical footer links, and non-home header links that resolve to localized landing fragments. Document pages render typed paragraphs/lists/definition lists without raw HTML interpolation and link back to the register. Register pages list both candidates with code, `DRAFT` identity, localized title, status, and route.

`BaseLayout` remains the sole HTML/main/theme shell. `LegalLayout` reuses it and adds only the legal reading container and draft banner. Landing routes `/` and `/en/` remain indexable and keep their original paired home links.

## TDD evidence

### Legal package RED

Initial package-absent command:

```text
CI=true corepack pnpm --filter @vbtech/legal-documents test
```

pnpm printed `No projects matched the filters` but returned exit code 0, so this was recorded as package-absence evidence rather than accepted as a sufficient failing-test signal.

After adding only the package manifest, TypeScript config, and tests, the same command produced the required true RED:

```text
Test Files  2 failed (2)
Tests       no tests
Error: Cannot find module '../src/index.js'
Exit status 1
```

### Legal package GREEN

After the minimal typed implementation:

```text
CI=true corepack pnpm --filter @vbtech/legal-documents test
Test Files  2 passed (2)
Tests       13 passed (13)
```

### Generated-page RED

The page tests were written before the routes and renderer existed. The existing build generated only `/index.html` and `/en/index.html`; the focused command then failed on the absent six legal files and `LegalDocument.astro`:

```text
CI=true corepack pnpm --filter @vbtech/web test -- legal-pages.test.ts
Test Files  1 failed | 4 passed (5)
Tests       20 failed | 56 passed (76)
Primary failure: ENOENT .../dist/legal/index.html
Exit status 1
```

### Generated-page GREEN

After shared-layout integration and the six routes:

```text
CI=true corepack pnpm --filter @vbtech/web test -- legal-pages.test.ts
8 page(s) built
Test Files  5 passed (5)
Tests       76 passed (76)
```

The package-local test script builds before Vitest, and the installed Vitest invocation runs the complete web test set when passed the brief's `-- legal-pages.test.ts` argument. This is stronger than a single-file result and includes existing landing/SEO/theme regression coverage.

## Required gates

| Command | Result |
| --- | --- |
| `CI=true corepack pnpm --filter @vbtech/legal-documents test` | PASS — 2 files, 13 tests |
| `CI=true corepack pnpm --filter @vbtech/legal-documents typecheck` | PASS — no TypeScript errors |
| `CI=true corepack pnpm --filter @vbtech/web test -- legal-pages.test.ts` | PASS — build 8 pages; 5 files, 76 tests |
| `CI=true corepack pnpm --filter @vbtech/web typecheck` | PASS — 27 files, 0 errors, 0 warnings, 0 hints |
| `CI=true corepack pnpm --filter @vbtech/web build` | PASS — 8 static pages |
| `git diff --check` | PASS |

Finishing branch verification also ran `CI=true corepack pnpm test`: PASS — all three workspace packages succeeded; content 4 tests, legal documents 13 tests, and web 76 tests.

The first web typecheck exposed two Astro-only definition-list narrowing errors. The branch item type was made explicit; the fresh final typecheck is clean. The install reported the repository's existing peer-range warning; no dependency version was changed outside the scoped workspace package/link additions.

## Generated-output inspection

All eight HTML files were parsed after the final build. Observed results:

- both landing roots: localized title/description, expected canonical/alternates, `indexable`, one `main`, one `h1`;
- all six legal routes: localized unique title/description, correct absolute canonical and reciprocal alternates, `noindex,nofollow`, one `main`, one `h1`;
- both registers contain both draft identities;
- policy pages contain 14 typed document sections; consent pages contain 6 typed document sections (plus surrounding landing sections counted by the parser);
- semantic list and definition-list assertions pass; exact paired locale and back-to-register links resolve;
- all localized home fragment and deterministic footer legal links resolve;
- source scan over legal package/rendering paths found no source-product or unsupported-field residue.

No browser, assistive-technology, legal, deployment, or publication acceptance is claimed.

## Activation checklist

1. Owner confirms every operator field exactly as it will be published.
2. Qualified review accepts the final authoritative Russian wording and matching informational English translation.
3. The complete production data flow, purposes, retention, security, localization, and subject-request procedures are confirmed against actual implementation.
4. Exact provider contracting entities, roles, regions, agreements, and current terms are reverified, including Yandex Cloud, Postbox, SmartCaptcha, and the mailbox provider.
5. Current applicable law and official guidance are rechecked on the activation date.
6. Only then assign valid `YYYY.MM/NN` revisions and ISO effective dates, replace both `/DRAFT` identities atomically, and mark only the approved releases active.
7. Rerun lifecycle, content, generated-page, type, build, browser, and deployment gates against the active release.
8. Keep public submission disabled until the site and future contact function consume the same active `VBT-PD-02/<revision>` identity and the publishability guard passes.
9. Verify the deployed canonical pages, robots/sitemap treatment, form checkbox/link behavior, captcha boundary, provider configuration, and rollback before public activation.

## Explicit legal and activation concerns

- No public revision exists and no effective date exists.
- Neither document is active, in force, legally approved, publishable, or acceptable through a form.
- `VBT-PD-02/DRAFT` must never be accepted by an enabled request.
- Russian wording, English parity, operator details, provider inventory/roles/regions/terms, and the implemented production data flow still require owner/legal/provider review.
- No form submission, captcha runtime, analytics, PDF/DOCX artifact, infrastructure, DNS, deployment, or publication was implemented. The site still has direct contact links only; online submission remains disabled.
- Real browser/accessibility acceptance and deployed-output verification remain future gates. Tasks 7–8 were not implemented.

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

## Final whole-branch review fix wave 2/5 — Task 6 provenance portability

### Commit contract and scope

- Base SHA: `c9aea4af13e31ee38771f40006e5756dc9d8d325`.
- Exact commit subject: `fix: make legal provenance portable`.
- Final commit SHA is supplied in the controller handoff because the commit cannot contain its own stable SHA.
- Scope is limited to Task 6 source-review provenance and its legal/generated-output contracts. Legal copy, release lifecycle/current derivation, browser tests, backend, deployment, and form enablement were not changed.

### Finding and correction

`LEGAL_SOURCE_REVIEW.operatorSource` embedded the original developer checkout path, `/Users/thevladbog/PRSOME/q/packages/legal-documents/src/operator.ts`. That path was machine-specific and exposed a home-directory prefix through exported production metadata.

It is replaced by the neutral, stable evidence identifier `operator-snapshot:operator-vbtech-2026-08-20`. This retains traceability to the exact approved operator snapshot without claiming a local filesystem location or exposing a developer identity/path.

The legal registry contract now pins that evidence identifier and rejects macOS, Linux, or Windows developer-home prefixes anywhere in the serialized source-review metadata. The web generated-output contract recursively reads every text/client artifact in `dist` (`css`, `html`, `js`, `json`, `mjs`, `svg`, `txt`, and `xml`) and rejects the same prefixes. A separate production-source/output scan covers `packages/legal-documents/src`, `apps/web/src`, and `apps/web/dist` while excluding tests and source maps.

### TDD evidence

RED, before changing production metadata:

```text
CI=true corepack pnpm --filter @vbtech/legal-documents test -- registry.test.ts
Test Files  1 failed | 1 passed (2)
Tests       1 failed | 36 passed (37)
Expected    operator-snapshot:operator-vbtech-2026-08-20
Received    /Users/thevladbog/PRSOME/q/packages/legal-documents/src/operator.ts
Exit status 1
```

GREEN, after the one-line metadata correction:

```text
CI=true corepack pnpm --filter @vbtech/legal-documents test -- registry.test.ts
Test Files  2 passed (2)
Tests       37 passed (37)

CI=true corepack pnpm --filter @vbtech/web test -- legal-pages.test.ts
Build        9 static pages
Test Files   11 passed (11)
Tests        146 passed (146)
```

The web package test script builds first and runs the full web unit suite even with the focused filename argument.

### Verification gates

| Gate | Result |
| --- | --- |
| Legal tests | PASS — 2 files, 37 tests |
| Legal typecheck | PASS |
| Web legal regression/full package test | PASS — 11 files, 146 tests |
| Web typecheck | PASS — 39 files, 0 errors, 0 warnings, 0 hints |
| Default web build | PASS — 9 static pages plus text/XML endpoints |
| Production legal/client path scan | PASS — no macOS, Linux, or Windows developer-home prefix |
| `PUBLIC_CONTACT_SUBMISSION_ENABLED=true` web build | EXPECTED FAIL — exit 1, `Draft consent VBT-PD-02/DRAFT cannot be used when submission is enabled` |
| Normal build after deliberate failure | PASS — complete 9-page output restored |
| `git diff --check` | PASS |

### Legal and activation boundary

- `VBT-PD-01/DRAFT` and `VBT-PD-02/DRAFT` remain unchanged drafts with `revision: null` and `effectiveDate: null`.
- There is still no active legal document; `VBT-PD-02/DRAFT` remains unpublishable and unacceptable for enabled submission.
- All six legal routes remain draft-only and `noindex,nofollow` under their existing generated-page contract.
- No legal wording, approval, publication, deployment, backend behavior, browser test, or form activation changed in this fix.

## Provenance fix round 1/5 — boundary-aware home-path detection

### Commit contract and scope

- Base SHA: `f8f7977dca053f19e012555313188cc89b65dd24`.
- Exact commit subject: `test: harden legal provenance path detection`.
- Final commit SHA is supplied in the controller handoff because the commit cannot contain its own stable SHA.
- This is a test-only correction. The production provenance identifier, legal copy, lifecycle/current derivation, browser tests, backend, deployment, and form behavior are unchanged.

### Review finding and correction

The first provenance contract duplicated one regex in the legal and web test suites. That regex detected raw `C:\Users\alice\...`, `/Users/alice/...`, and `/home/alice/...`, but it missed the doubled separators emitted by JSON serialization (`C:\\Users\\alice\\...`) and falsely matched `/home/docs/page` inside `https://example.test/home/docs/page`.

Both suites now consume one shared test-only `containsDeveloperHomePath` detector. It normalizes doubled Windows separators for comparison, accepts a developer-home path only at the start of the string or after a bounded path-value delimiter, and separately recognizes Windows and POSIX home roots. This preserves detection in serialized metadata and generated artifacts without interpreting a normal absolute URL path as a Linux home.

Explicit fixtures cover:

- positive raw Windows `C:\Users\alice\source\operator.ts`;
- positive JSON-serialized Windows output with doubled separators;
- positive macOS `/Users/alice/...` and Linux `/home/alice/...` paths;
- negative `https://example.test/home/docs/page` URL content;
- the real serialized `LEGAL_SOURCE_REVIEW` metadata and every generated text/client artifact in `apps/web/dist`.

### TDD evidence

The duplicated detector was first consolidated without changing behavior; the existing focused suites remained green. The new boundary fixtures then produced the required RED:

```text
CI=true corepack pnpm --filter @vbtech/legal-documents test -- registry.test.ts
Test Files  1 failed | 1 passed (2)
Tests       2 failed | 40 passed (42)
Failures    JSON-escaped Windows path returned false; ordinary HTTPS /home/ URL returned true
Exit status 1
```

After the bounded normalization/detection change:

```text
CI=true corepack pnpm --filter @vbtech/legal-documents test -- registry.test.ts
Test Files  2 passed (2)
Tests       42 passed (42)

CI=true corepack pnpm --filter @vbtech/web test -- legal-pages.test.ts
Build        9 static pages
Test Files   11 passed (11)
Tests        146 passed (146)
```

### Verification gates

| Gate | Result |
| --- | --- |
| Legal tests | PASS — 2 files, 42 tests |
| Legal typecheck | PASS |
| Web legal regression/full package test | PASS — 11 files, 146 tests |
| Web typecheck | PASS — 39 files, 0 errors, 0 warnings, 0 hints |
| Default web build | PASS — 9 static pages plus text/XML endpoints |
| Real generated-output portability scan | PASS through the shared detector |
| `PUBLIC_CONTACT_SUBMISSION_ENABLED=true` web build | EXPECTED FAIL — exit 1, `Draft consent VBT-PD-02/DRAFT cannot be used when submission is enabled` |
| Normal build after deliberate failure | PASS — complete 9-page output restored |
| `git diff --check` | PASS |

### Legal and activation boundary

- Production `LEGAL_SOURCE_REVIEW.operatorSource` remains `operator-snapshot:operator-vbtech-2026-08-20`.
- `VBT-PD-01/DRAFT` and `VBT-PD-02/DRAFT` remain unchanged drafts with no revision, effective date, or active release.
- Enabled submission remains blocked by the draft consent guard; no publication, deployment, or activation occurred.

## Provenance fix round 2/5 — contextual path detection

### Commit contract and scope

- Base SHA: `fef8491bc655e6eeb3416ace06c1d56bdc2609e4`.
- Exact commit subject: `test: make provenance scans context aware`.
- Final commit SHA is supplied in the controller handoff because the commit cannot contain its own stable SHA.
- This remains a test-only correction. Production provenance, legal copy, lifecycle/current derivation, browser tests, backend, deployment, and form behavior were not changed.

### Contextual design and tradeoff

The path detector now requires an explicit scan context instead of extending a single undifferentiated regex:

- `strict-provenance` is used for serialized `LEGAL_SOURCE_REVIEW`. After bounded normalization it rejects raw Windows homes, `/Users/<user>`, `/home/<user>`, and matching `file://` homes. Hosted HTTP(S) URLs and query-only route values are removed or excluded before the POSIX check.
- `generated-artifact` is used for built text/client artifacts. It rejects Windows homes, `file:///Users/...`, `file:///home/...`, raw `/Users/...`, and `/home/...` only when an explicit filesystem-value label such as `source`, `path`, `file`, `cwd`, `workdir`, `checkout`, or `directory` supplies context.

The exact ambiguity is intentional and tested: bare `/home/docs/page` is invalid under strict provenance because it could be an absolute Linux home, but is allowed in generated artifacts because it is indistinguishable from a root-relative web route. A Linux artifact leak must therefore appear as a `file://` URL or in an explicit filesystem-value context. Windows and `/Users` remain sufficiently platform-specific to reject directly. Hosted URLs, root-relative routes, query values, and ordinary prose/URL content are negative fixtures.

Before detection, escaped separators are normalized for at most eight passes, which covers slash-escaped POSIX JSON and Windows paths after two JSON serialization layers. Inputs are capped at 4 MiB; oversize or excessive escape-depth inputs throw rather than silently pass the scan.

### Fixtures

Positive fixtures cover raw and once/twice JSON-serialized Windows paths, raw macOS/Linux homes under strict provenance, slash-escaped `\/Users\/alice\/...` and `\/home\/alice\/...` JSON, `file:///Users/alice/...`, `file:///home/alice/...`, raw `/Users/...`, and a context-labeled Linux path under generated artifacts.

Negative fixtures cover `https://example.test/home/docs/page`, bare `/home/docs/page` in generated-artifact mode, `?next=/home/docs/page`, and ordinary prose containing root-relative and hosted URL paths. The same helper scans real serialized legal metadata in strict mode and every generated text/client artifact in generated-artifact mode.

### TDD evidence

The initial expanded table produced 10 failures. Two generated-mode slash-escaped fixtures were then added before the helper implementation; the required complete mutation check restored the prior detector and recorded the full RED:

```text
CI=true corepack pnpm --filter @vbtech/legal-documents test -- registry.test.ts
Test Files  1 failed | 1 passed (2)
Tests       12 failed | 46 passed (58)
Failures    twice-serialized Windows; slash-escaped POSIX; file URLs; root/query/prose context
Exit status 1
```

After restoring the contextual detector and adding the explicit ambiguity assertion:

```text
CI=true corepack pnpm --filter @vbtech/legal-documents test -- registry.test.ts
Test Files  2 passed (2)
Tests       59 passed (59)

CI=true corepack pnpm --filter @vbtech/web test -- legal-pages.test.ts
Build        9 static pages
Test Files   11 passed (11)
Tests        146 passed (146)
```

### Verification gates

| Gate | Result |
| --- | --- |
| Legal tests | PASS — 2 files, 59 tests |
| Legal typecheck | PASS |
| Web legal regression/full package test | PASS — 11 files, 146 tests |
| Web typecheck | PASS — 39 files, 0 errors, 0 warnings, 0 hints |
| Default web build | PASS — 9 static pages plus text/XML endpoints |
| Strict legal metadata scan | PASS |
| Contextual generated-output scan | PASS across every text/client artifact |
| `PUBLIC_CONTACT_SUBMISSION_ENABLED=true` web build | EXPECTED FAIL — exit 1, `Draft consent VBT-PD-02/DRAFT cannot be used when submission is enabled` |
| Normal build after deliberate failure | PASS — complete 9-page output restored |
| `git diff --check` | PASS |

### Legal and activation boundary

- Production `LEGAL_SOURCE_REVIEW.operatorSource` remains `operator-snapshot:operator-vbtech-2026-08-20`.
- `VBT-PD-01/DRAFT` and `VBT-PD-02/DRAFT` remain unchanged drafts with no revision, effective date, or active release.
- Enabled submission remains blocked; no publication, deployment, backend change, or activation occurred.

## Provenance fix round 3/5 — bounded URL spans and exact Linux fields

### Commit contract and scope

- Base SHA: `bdde4e2246ce10db02449c25e74a7ed5d623c093`.
- Exact commit subject: `test: bound provenance URL and field parsing`.
- Final commit SHA is supplied in the controller handoff because the commit cannot contain its own stable SHA.
- This is test-only detector work. Production provenance, legal copy, lifecycle/current derivation, browser tests, backend, deployment, form behavior, and the lockfile were not changed.

### P1 — hosted URL span boundary

The previous hosted-URL mask stopped only at whitespace, quotes, or angle brackets. In CSS or list text it could consume `)`, comma, semicolon, and every adjacent token, hiding a following real developer path. For example, masking `background:url(https://example.test/a),url(/Users/alice/project/app.css)` removed the second `url(...)` as part of the hosted URL.

The mask now ends at its URI token boundary: whitespace, quotes/backtick, angle/round/square/curly brackets, comma, semicolon, or backslash. Replacement still affects only the matched hosted URL span, leaving the delimiter and following content available to the existing contextual detector.

Positive fixtures place `/Users/alice/project/app.css` after a hosted URL through CSS `),url(...)`, semicolon, comma/list, and quoted delimiters. A hosted URL by itself and a hosted URL inside `background:url(...)` remain negative.

### P2 — exact Linux filesystem fields

The previous generated-artifact Linux context allowed an arbitrary alphanumeric prefix ending in `source`. That made `Resource`, `{resource: ...}`, and `DataSource` look like filesystem fields while missing required names such as `fileName`, `sourceFile`, `sourceMap`, and `absolutePath`.

The generated-artifact policy now accepts only complete, case-insensitive field/context tokens followed by `:` or `=`: `path`, `absolutePath`, `file`, `filename`/`fileName`, `source`, `sourceFile`, `sourceMap`, `sourcePath`, `sourceRoot`, `sourceMappingURL`, `sources`, `cwd`, `workdir`, and `directory`. `sources` permits the immediately following array opener used by source maps. These names cover ordinary build metadata, CSS source-map directives, and source-map JSON without suffix matching.

Positive object/CSS/source-map fixtures cover `fileName`, `filename`, `sourceFile`, `sourceMap`, `absolutePath`, `sourceRoot`, `sources`, and `sourceMappingURL` with `/home/alice/...`. Negative fixtures cover `Resource`, `resource`, `DataSource`, and `fileNameExtra`, in addition to the existing hosted URL, root-relative route, query, and ordinary prose/URL cases.

The 4 MiB input limit, eight-pass escape normalization, strict/generated scan modes, file URL rules, and the documented bare `/home/...` ambiguity remain unchanged.

### TDD evidence

The first expanded fixture run exposed 11 failures. Source-map equivalents were then added before the detector change, and the complete RED was rerun:

```text
CI=true corepack pnpm --filter @vbtech/legal-documents test -- registry.test.ts
Test Files  1 failed | 1 passed (2)
Tests       14 failed | 62 passed (76)
Failures    URL delimiter over-consumption; missing exact fields; loose source/resource matches
Exit status 1
```

The initial RED invocation was interrupted before tests because pnpm unexpectedly attempted to recreate `node_modules` using unavailable registry access. The exact frozen-lockfile dependency graph was restored from the local store (`309 reused`, `0 downloaded`) without a lockfile change, then the RED above ran normally.

After the two bounded regex changes, exact `source` was retained as a complete token for the existing slash-escaped JSON fixture, and all focused tests passed:

```text
CI=true corepack pnpm --filter @vbtech/legal-documents test -- registry.test.ts
Test Files  2 passed (2)
Tests       77 passed (77)

CI=true corepack pnpm --filter @vbtech/web test -- legal-pages.test.ts
Build        9 static pages
Test Files   11 passed (11)
Tests        146 passed (146)
```

### Verification gates

| Gate | Result |
| --- | --- |
| Legal tests | PASS — 2 files, 77 tests |
| Legal typecheck | PASS |
| Web legal regression/full package test | PASS — 11 files, 146 tests |
| Web typecheck | PASS — 39 files, 0 errors, 0 warnings, 0 hints |
| Default web build | PASS — 9 static pages plus text/XML endpoints |
| Strict legal metadata scan | PASS |
| Contextual generated-output scan | PASS across every text/client artifact |
| `PUBLIC_CONTACT_SUBMISSION_ENABLED=true` web build | EXPECTED FAIL — exit 1, `Draft consent VBT-PD-02/DRAFT cannot be used when submission is enabled` |
| Normal build after deliberate failure | PASS — complete 9-page output restored |
| `git diff --check` | PASS |

### Legal and activation boundary

- Production `LEGAL_SOURCE_REVIEW.operatorSource` remains `operator-snapshot:operator-vbtech-2026-08-20`.
- `VBT-PD-01/DRAFT` and `VBT-PD-02/DRAFT` remain unchanged drafts with no revision, effective date, or active release.
- Enabled submission remains blocked; no publication, deployment, backend change, or activation occurred.

## Provenance fix round 4/5 — bounded `sources` arrays and direct semicolon boundary

### Commit contract and scope

- Base SHA: `f8204471b692ddc81718c267f3b5b1f4bea84182`.
- Exact commit subject: `test: bound provenance sources array scanning`.
- Final commit SHA is supplied in the controller handoff because the commit cannot contain its own stable SHA.
- This is test-only detector work. Production provenance, legal copy, lifecycle/current derivation, browser tests, backend, deployment, form behavior, and the lockfile were not changed.

### P1 — bounded `sources` array parsing

Generated source maps can contain several filesystem entries in a JSON `sources` array. The former context regex only inspected an immediately first `/home/...` member and therefore missed a developer path in a later member.

The generated-artifact detector now gives exact JSON `"sources": [...]` fields a small linear parser. It inspects every string member, preserves string escape boundaries, and stops at that array's own closing bracket instead of matching across unrelated arrays. A single array is limited to 64 KiB and 1,024 members; malformed JSON-string member structure, a missing delimiter/closing bracket, a trailing comma, or either bound being exceeded throws and fails the scan closed. The overall existing 4 MiB input and eight-pass separator-normalization bounds remain unchanged. Linux scalar filesystem fields continue through the exact-token contextual detector, while `sources` was removed from that scalar regex.

The positive fixture is the required later-entry case: `{"sources":["src/a.ts","/home/alice/project/app.ts"]}`. The negative fixture has several safe relative/vendor entries. Separate fixtures prove malformed syntax does not cross into a later unrelated array and that an oversized member is rejected by the array-specific limit.

### P2 — semicolon is the actual hosted-URL boundary

The semicolon fixture is now exactly `https://example.test/a;absolutePath:/Users/alice/project/app.css`; there is no preceding CSS `)` that could terminate the URL first. Temporarily removing semicolon from the hosted-URL terminators made exactly this fixture fail, proving semicolon itself preserves the adjacent developer path for scanning. Restoring the terminator returned the suite to GREEN.

### TDD evidence

With the new contract fixtures and the old detector, the focused RED was:

```text
CI=true corepack pnpm --filter @vbtech/legal-documents test -- registry.test.ts
Test Files  1 failed | 1 passed (2)
Tests       3 failed | 77 passed (80)
Failures    later sources member; malformed sources array; sources size bound
Exit status 1
```

After adding the bounded exact-array parser:

```text
CI=true corepack pnpm --filter @vbtech/legal-documents test -- registry.test.ts
Test Files  2 passed (2)
Tests       80 passed (80)
```

The required hosted-URL mutation then allowed semicolons inside the URL token:

```text
CI=true corepack pnpm --filter @vbtech/legal-documents test -- registry.test.ts
Test Files  1 failed | 1 passed (2)
Tests       1 failed | 79 passed (80)
Failure     preserves a developer path after a hosted URL semicolon delimiter
Exit status 1
```

After restoring semicolon termination, the focused suite returned to 80/80 PASS.

### Verification gates

| Gate | Result |
| --- | --- |
| Legal tests | PASS — 2 files, 80 tests |
| Legal typecheck | PASS |
| Web legal regression/full package test | PASS — build completed; 11 files, 146 tests |
| Web typecheck | PASS — 39 files, 0 errors, 0 warnings, 0 hints |
| Default web build | PASS — 9 static pages plus text/XML endpoints |
| Strict legal metadata scan | PASS |
| Contextual generated-output scan | PASS across every text/client artifact |
| `PUBLIC_CONTACT_SUBMISSION_ENABLED=true` web build | EXPECTED FAIL — exit 1, `Draft consent VBT-PD-02/DRAFT cannot be used when submission is enabled` |
| Normal build after deliberate failure | PASS — complete 9-page output restored |
| `git diff --check` | PASS |

### Legal and activation boundary

- Production `LEGAL_SOURCE_REVIEW.operatorSource` remains `operator-snapshot:operator-vbtech-2026-08-20`.
- `VBT-PD-01/DRAFT` and `VBT-PD-02/DRAFT` remain unchanged drafts with no revision, effective date, or active release.
- Enabled submission remains blocked; no publication, deployment, backend change, or activation occurred.

## Provenance fix round 5/5 — native JSON validation and decoded source boundaries

### Commit contract and scope

- Base SHA: `3355a1a66ff9534536213b7bc10e7c3251986634`.
- Exact commit subject: `test: validate provenance sources arrays`.
- Final commit SHA is supplied in the controller handoff because the commit cannot contain its own stable SHA.
- This remains test-only detector work. Production provenance, legal copy, lifecycle/current derivation, browser tests, backend, deployment, form behavior, and the lockfile were not changed.

### Bounded scanner and native validation

The permissive member parser has been removed. The generated-artifact detector now performs only the bounded structural work needed to locate an exact JSON `"sources"` key and its matching array span:

- the existing 4 MiB whole-input cap bounds key discovery;
- quoted strings are skipped with escape-aware boundaries, so brackets and `"sources"` text inside a JSON string cannot terminate or start an array scan;
- nested array brackets are tracked only while locating the matching closing bracket;
- the 64 KiB span cap is enforced while traversing ordinary and quoted content, before any substring or parse operation.

The bounded array substring is then passed to native `JSON.parse`. This rejects invalid `\q` escapes, short `\u12` escapes, raw newlines/control characters, missing commas, trailing commas, and other malformed JSON. Parsed arrays over 1,024 members throw, and every parsed member must be a string. Every decoded string is scanned, so `\u002fhome\u002falice/project/app.ts` is detected after Unicode decoding. Hosted HTTP(S) URLs inside a valid sources array remain excluded before path detection.

This policy is intentionally scoped to exact JSON filesystem `sources` arrays. Scalar build metadata remains covered by the exact contextual field detector, and unrelated arrays are neither parsed as sources nor crossed by the span locator.

### Fixtures and mutation evidence

The new fixtures prove:

- invalid `\q`, short `\u12`, and a raw newline fail closed through native JSON validation;
- a Unicode-escaped Linux developer home is detected after decoding;
- exactly 1,024 safe members pass, and a leak in member 1,024 is detected;
- 1,025 members fail closed;
- non-string members fail closed;
- multiple safe `sources` arrays remain isolated from an unrelated array and embedded fake `"sources"` text containing root-like `/home/...` values; an escaped quote followed by `]` inside a valid member proves string boundaries are respected;
- the direct semicolon fixture `https://example.test/a;absolutePath:/Users/alice/project/app.css` remains in the passing suite.

Against the prior hand parser, the expanded focused suite produced the expected RED:

```text
CI=true corepack pnpm --filter @vbtech/legal-documents test -- registry.test.ts
Test Files  1 failed | 1 passed (2)
Tests       4 failed | 84 passed (88)
Failures    invalid q; short unicode; raw newline; Unicode-escaped developer home
Exit status 1
```

After the bounded span locator and native JSON parsing change:

```text
CI=true corepack pnpm --filter @vbtech/legal-documents test -- registry.test.ts
Test Files  2 passed (2)
Tests       88 passed (88)
```

The required member-cap mutation temporarily deleted the 1,024-member guard. Its isolated result was:

```text
CI=true corepack pnpm --filter @vbtech/legal-documents exec vitest run test/registry.test.ts -t "rejects a 1025-member sources array"
Test Files  1 failed (1)
Tests       1 failed | 80 skipped (81)
Failure     expected the 1025-member scan to throw
Exit status 1
```

Restoring the cap returned the focused package suite to 88/88 PASS.

A second focused mutation removed escape handling from the span locator. The isolated multiple-array/string-boundary fixture then failed with `Malformed sources array: invalid JSON` (1 failed, 80 skipped), proving an escaped quote and following `]` cannot be treated as structural delimiters. Restoring escape handling returned that isolated fixture to PASS.

### Verification gates

| Gate | Result |
| --- | --- |
| Legal tests | PASS — 2 files, 88 tests |
| Legal typecheck | PASS |
| Web legal regression/full package test | PASS — build completed; 11 files, 146 tests |
| Web typecheck | PASS — 39 files, 0 errors, 0 warnings, 0 hints |
| Default web build | PASS — 9 static pages plus text/XML endpoints |
| Strict legal metadata scan | PASS |
| Contextual generated-output scan | PASS across every text/client artifact |
| `PUBLIC_CONTACT_SUBMISSION_ENABLED=true` web build | EXPECTED FAIL — exit 1, `Draft consent VBT-PD-02/DRAFT cannot be used when submission is enabled` |
| Normal build after deliberate failure | PASS — complete 9-page output restored |
| `git diff --check` | PASS |

### Final legal and activation boundary

- Production `LEGAL_SOURCE_REVIEW.operatorSource` remains `operator-snapshot:operator-vbtech-2026-08-20`.
- `VBT-PD-01/DRAFT` and `VBT-PD-02/DRAFT` remain unchanged drafts with no revision, effective date, or active release.
- Enabled submission remains blocked; no publication, deployment, backend change, form activation, or external request occurred.

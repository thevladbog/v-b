# Independent whole-branch final review

**Branch:** `feat/contact-pipeline`
**Base:** `cf3f5a72e79442559bcac6a9ba3ef6ec6f8bdbae`
**Reviewed head:** `21b56f689a32f3c17eca7c5be19f14e1c7c456f3`
**Date:** 2026-08-21
**Verdict:** **Not ready to merge — one Important integrated-production gap requires a fix and focused re-review.**

## Review scope and integrity

The exact worktree, base, head, 16-commit branch range, and clean tracked-worktree baseline were verified before review. The binding production-site specification, complete contact-pipeline plan, entire progress ledger, every Task 1–7 report/review/re-review (including the ignored local `task-7-rereview-2.md`), the full branch diff, and all changed production, test, configuration, runbook, and acceptance files were inspected. Applicable code-review, security/privacy, accessibility, and Playwright guidance was also read. No source was edited, no commit was created, no local service was restarted, and no cloud, DNS, provider, mailbox, database, or other live resource was mutated.

The branch diff is scoped to the contact contract, email, function/outbox, Astro contact shell/client, local acceptance contour, documentation, and lockfile/configuration needed by that work. `git diff --check` passes and the tracked worktree remained clean after review.

## Critical findings

None.

## Important findings

### I1. The enabled contact workflow has no deployable production browser integration

**Evidence**

- The binding plan requires the static Astro form to post the exact shared contract and Task 6 explicitly requires a progressive production state machine that creates a UUID, loads SmartCaptcha only when enabled, and submits exact JSON (`docs/superpowers/plans/2026-08-20-vbtech-contact-pipeline.md:5-9`, `303-328`). The production specification likewise requires a privacy-gated production enquiry workflow, SmartCaptcha on the public form, captcha loaded only when public submission is enabled, and a separately approved activation action (`docs/superpowers/specs/2026-08-20-vbtech-production-site-design.md:5-21`, `338-340`, `436-449`).
- The production layout initializes only theme and navigation. It neither imports nor calls `initializeContactForms` (`apps/web/src/layouts/BaseLayout.astro:99-105`).
- The production `ContactForm` nevertheless emits an enabled form when the public flag and legal readiness allow it: `method="post"`, `action="/api/contact"`, `novalidate`, and an enabled fieldset (`apps/web/src/components/ContactForm.astro:29-33`, `43-64`). Its captcha site key is supplied only by the internal fixture prop (`apps/web/src/components/ContactForm.astro:53-55`).
- The actual progressive client exists and deliberately binds only forms whose `data-submission-enabled` value is `true` (`apps/web/src/scripts/contact-form.ts:597-610`), but the only page that imports/calls it is the private loopback fixture (`apps/web/test-fixture/src/FixturePage.astro:28-44`). Repository search finds no production call site.
- Production artifact tests prove only the current DRAFT-disabled, client-free output (`apps/web/test/contact-shell.test.ts:213-229`). Enabled browser coverage runs against the internal loopback fixture, not a deployable production graph. The production runbook says to approve legal text and then “activate public submission” but does not identify a missing web-client/site-key implementation or deployable active-build proof (`docs/runbooks/contact-delivery.md:123-131`).

**Impact**

The current DRAFT build is safely disabled. However, after the planned legal revision and public flag are activated, the deployable page would expose a `novalidate` HTML form with no enhancement and no SmartCaptcha token acquisition. A browser submit would be form-encoded rather than the required exact JSON and would contain no captcha token, so the public workflow could not succeed. The private fixture demonstrates the client logic in isolation but does not demonstrate that the production artifact can ever activate it. This leaves Task 6 and the specification's production activation path incomplete.

**Required remediation**

Add an explicit deployable production integration that, only when legal readiness and the public submission flag are active, imports/initializes `initializeContactForms` and supplies the reviewed public SmartCaptcha site key without compiling any secret into the site. Preserve the current DRAFT/default guarantee of zero contact/captcha client code. Add a production-shaped active-consent build test or fixture that proves the generated artifact contains exactly one initialized client, the reviewed public site key, exact same-origin JSON POST behavior, no internal-fixture marker, and the same lifecycle/multi-form/accessibility guarantees. Update the activation runbook to name this web artifact/configuration gate. Re-review the generated active and DRAFT artifacts.

## Minor findings

### M1. Deferred Task 3 complete-schema plaintext regression remains open

The privacy test uses `SELECT *` and exact keys for `contact_requests` (`apps/contact-function/test/outbox-repository.test.ts:248-266`), but selects only five named columns from `email_outbox` (`apps/contact-function/test/outbox-repository.test.ts:251-260`). A future plaintext visitor column added to `email_outbox` could therefore evade this regression. The reviewed migration currently contains no such plaintext column and the implementation stores durable content only in the authenticated envelope, so this is test hardening rather than a current privacy defect.

**Remediation:** assert the exact complete `email_outbox` schema via `information_schema.columns` or a controlled `SELECT *`, and explicitly classify all permitted operational metadata versus encrypted envelope fields.

### M2. Deferred Task 3 independent mutation coverage remains open

The durable hash includes `locale`, `name`, `contact`, `message`, `sourcePath`, and `consentId` (`apps/contact-function/src/outbox-repository.ts:65-72`, `96-106`). The integration test independently changes only `message` before expecting `request_id_reused` (`apps/contact-function/test/outbox-repository.test.ts:97-108`). The identical-retry and concurrent tests do prove that captcha and honeypot are intentionally non-durable (`apps/contact-function/test/outbox-repository.test.ts:75-85`, `111-126`), but there is no independent mutation regression for each of the other five durable fields. The current implementation is correct.

**Remediation:** parameterize a test that independently changes each durable field while reusing one UUID and expects `request_id_reused`; retain explicit acceptance of captcha/honeypot-only changes.

### M3. Task 7 documentation combines maxima from different captures

The runbook and acceptance report state that the “largest capture” is `1280×1402` and 74,652 bytes (`docs/runbooks/contact-delivery.md:89`; `docs/reviews/contact-pipeline-local-acceptance.md:79`). The committed manifest shows that `1402` is the height of the 390-pixel-wide RU notification text mobile captures, while 74,652 bytes belongs to `ru-notification-text-desktop-light.png` at `1280×1234`. No capture has the documented combined dimensions and byte count.

**Remediation:** report maximum width, height, and file bytes as independent maxima, or name the specific capture for each measurement.

### M4. Task 7 acceptance report overstates contact-sheet manifest fields

The report says every capture record “and the sheet” records content characters/UTF-8 bytes (`docs/reviews/contact-pipeline-local-acceptance.md:79`). `EmailAcceptanceContactSheet` contains only file/hash/dimensions/file bytes (`tools/browser/email-acceptance/capture.ts:85-93`); content character/byte fields exist only on capture records (`tools/browser/email-acceptance/capture.ts:65-83`).

**Remediation:** say that the 32 capture records include content counts and that the contact-sheet record includes its hash, dimensions, and file size.

## Deferred Task 3 minor disposition

Both specifically requested deferred minors were independently re-triaged. They remain **Minor, non-blocking regression-coverage gaps**, not evidence of a current plaintext-storage or idempotency defect. M1 should still be closed because it protects the highest-risk privacy invariant against schema evolution. M2 should be closed because it makes the idempotency boundary independently mutation-sensitive for every durable field. Neither is promoted in severity based on the current migration and implementation.

## Verified strengths

- The shared contract is strict, bounded, normalizing, and uses a canonical UUID throughout; the client verifies the echoed canonical identity.
- DRAFT legal state fails closed in both the site build and HTTP handler. The default built artifact is client-free and contains no contact endpoint, captcha runtime, fixture key, or developer-home path after a clean normal build.
- Email subjects/routing are static and bounded; operator notification and visitor confirmation are independently queued, Telegram never receives confirmation, and visitor content is escaped by React Email.
- AES-256-GCM uses fresh 12-byte IVs and authenticated request-ID/kind context; rate-limit identifiers use a separate HMAC key; configuration rejects key reuse.
- The migration and repository use canonical UUID advisory locking, transactional request hashing and durable enqueue, explicit constraints, bounded leases, owner/generation fencing, and a separate persisted provider-attempt budget.
- The HTTP boundary enforces the neutral gate, exact method/path/no-query contour, decoded-body bound, exact host/origin/content type, strict schema, consent, honeypot, rate limit, then SmartCaptcha. Provider validation is timed, bounded, and fail-closed.
- Postbox sends bounded Raw MIME with stable Message-ID and exact routing. IAM tokens are acquired lazily and discarded on lost leases. Only exact documented `MessageRejected` is terminal; provider/configuration ambiguity remains recoverable.
- Worker handling correctly distinguishes recoverable key/config/render/token/provider failures from authenticated schema poison, preserves ciphertext and provider budget on recoverable failures, and erases envelopes atomically on terminal states.
- Telemetry serializes only the allow-listed request ID/stage/status/latency fields. Retention is bounded and deletes terminal payload/metadata and orphan hashes according to the documented lifecycle.
- The private enabled-form fixture has strong lifecycle, timeout, retry-identity, captcha-loader deduplication, multi-form scoping, keyboard, focus, mobile target, and WCAG 2.2 coverage. The production DRAFT shell retains direct Telegram/email fallback and accessible legal links.
- The local PostgreSQL 17/Mailpit contour is loopback-only and digest-pinned. Destructive DB helpers require the exact decoded database/role and re-check connected identity. Mailpit cleanup requires exact origin, marker, version, and owned tag; unrelated messages are preserved. Evidence JSON, documents, PNGs, total bytes, and partial-failure cleanup are bounded.
- Runbook operational guidance avoids selecting/decrypting visitor payloads during routine diagnosis and distinguishes local evidence from provider/live-client acceptance.

## Fresh non-destructive verification

- PASS: exact branch/base/head and 16-commit scope; clean tracked worktree before review.
- PASS: `git diff --check cf3f5a72e79442559bcac6a9ba3ef6ec6f8bdbae..21b56f689a32f3c17eca7c5be19f14e1c7c456f3`.
- PASS: `docker compose -f deploy/local/compose.yml config --quiet` (configuration render only; no services started).
- PASS: direct clean Astro production build.
- PASS: `PUBLIC_CONTACT_SUBMISSION_ENABLED=true` Astro build fails closed with `Draft consent VBT-PD-02/DRAFT cannot be used when submission is enabled`; a normal build was rerun afterward.
- PASS: post-build scan of emitted HTML/JS/MJS found no `/api/contact`, SmartCaptcha runtime/site, fixture key, or `/Users/thevladbog` developer path.
- PASS: contracts tests, 33/33.
- PASS: email tests, 6/6.
- PASS: contact-function non-database suite, 130 passed and the 3 configured local E2E cases skipped; database-backed outbox/rate-limit/retention files were intentionally excluded because services were not restarted.
- PASS after clean build: web tests, 184/184. The first attempt exposed stale interrupted `.prerender` output left by a package-manager gate attempt; the clean Astro build removed it and the exact suite then passed.
- PASS from the reviewed Task 7 head evidence: canonical local PostgreSQL 17/Mailpit, browser, bounds, visual evidence, and full package gates recorded at the reviewed head. Those records were inspected but not treated as fresh live execution in this review.

The root `corepack pnpm` lint/typecheck/package-manager commands could not be freshly completed in the restricted review sandbox because pnpm's dependency-status check recursively attempted an install and failed registry DNS; forcing Turbo then surfaced pnpm's lockfile policy check. Only review-owned duplicate package-manager processes were stopped. Existing lockfile-pinned dependencies were restored, and package-local executables were used for the fresh focused gates above. This environment limitation is not presented as a product failure, but it means the canonical root lint/typecheck/package-manager gates were not independently rerun here.

## Acceptance not run in this review

- Configured destructive integration tests against the dedicated PostgreSQL 17 database and Mailpit were not rerun; no services were restarted. Their Task 7 evidence at this exact head was reviewed.
- The full standard + enabled Playwright project matrix and 32-image email evidence generation were not rerun. Existing exact-head reports, manifest, hashes, and prior independent visual inspection were reviewed.
- No real SmartCaptcha, Postbox, IAM, managed PostgreSQL, Lockbox, cloud function/timer, VM/Caddy/container, DNS, TLS, external mailbox, Gmail/Outlook/Apple Mail, real mobile-device, or production form smoke was run.
- No legal text, revision, effective date, operator/provider inventory, production topology, DNS sheet, or live publication approval is implied.
- Provider-accepted-but-response-lost ambiguity remains the documented at-least-once boundary; no live-provider experiment was attempted.

## Merge readiness

**Not ready to merge.** Fix I1 and obtain a focused re-review that proves both the DRAFT client-free artifact and a production-shaped active-consent artifact. M1–M4 are non-blocking in isolation but should be corrected while the branch is open, particularly M1 because it protects the plaintext-storage invariant. After the Important fix, rerun the canonical root lint, typecheck, unit, build, standard browser, enabled-contact browser, DRAFT fail-close, artifact-scan, and package-manager gates in the normal authorized environment. Keep all live/provider/deployment gates explicitly unaccepted until separately approved and executed.

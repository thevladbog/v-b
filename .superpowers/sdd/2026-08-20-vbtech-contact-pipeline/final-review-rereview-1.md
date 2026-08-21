# Whole-branch final-review fix wave 1 — independent re-review

**Original reviewed head:** `21b56f689a32f3c17eca7c5be19f14e1c7c456f3`
**Re-reviewed head:** `a2c9b3abb9cd83f9815a7b3bf36e7a459c060e79`
**Commit:** `a2c9b3a fix: complete production contact activation path`
**Date:** 2026-08-21
**Verdict:** **Not ready to merge — I1 is mechanically improved but not closed because the ACTIVE artifact still presents DRAFT/disabled legal and contact copy while transmitting personal data.**

## Scope

I read the fix report, latest progress ledger entry, original final review, complete `21b56f6..a2c9b3a` diff, and every changed source, test, configuration, runbook, and acceptance file. I verified the branch/head and clean tracked worktree. No source was edited, no commit was created, no database/Mailpit stack was restarted, and no live provider, cloud, DNS, mailbox, deployment, or production resource was touched.

## Finding-by-finding verdict

### I1 — Partially fixed; remains Important

The missing production runtime mechanics are now implemented correctly:

- `astro.config.mjs` derives independent public-request and non-DRAFT gates and passes both to the integration (`apps/web/astro.config.mjs:4-15`).
- `createContactRuntimeIntegration` calls `injectScript("page", ...)` only when both gates are true, validates the public key first, and injects one call to the shared `initializeContactForms` entry (`apps/web/src/integrations/contact-runtime.ts:10-25`).
- Public site keys are bounded to 20–128 safe identifier characters (`apps/web/src/lib/contact-runtime-config.ts:1-10`) and the production form independently validates the key on the enabled, non-fixture path (`apps/web/src/components/ContactForm.astro:38-42`).
- The private contour requires its explicit guard, fixes the exact loopback origin and OS-temp output, aliases legal documents only inside that contour, and rejects a production-origin override (`apps/web/test-active/astro.config.mjs:7-32`, `35-65`; `apps/web/test/active-contact-artifact.test.ts:101-135`). Public flag + actual DRAFT remains fail-closed.
- Fresh ACTIVE artifact/browser evidence confirms 9 HTML/1 shared JS, one submit binding, one captcha load/execute/token, exact same-origin JSON POST, RU/EN, Desktop/Pixel, light/dark, and WCAG 2.2 behavior. The normal DRAFT artifact remains 9 HTML/0 JS-MJS and passes the deny-list.

However, the resulting ACTIVE production-shaped pages are internally false and legally contradictory:

- `AboutContact` always renders `contact.directContactContext` without considering active readiness (`apps/web/src/components/AboutContact.astro:29-42`). The unchanged RU/EN values say online submission is unavailable (`packages/content/src/site.ts:191`, `241`) even when the adjacent form is enabled.
- `ContactForm` conditionally removes only the disabled announcement. It still renders the same form title, consent link label, consent instruction/context, note, and consent error copy in both states (`apps/web/src/components/ContactForm.astro:48-53`, `145-167`).
- Those shared strings explicitly say “Черновик обращения” / “Enquiry draft”, “проектом согласия” / “draft personal data processing consent”, “согласие пока нельзя принять” / “cannot yet be accepted”, and most seriously “Это отключённая production-оболочка: данные не передаются” / “This is a disabled production shell: no data is transmitted” (`packages/content/src/site.ts:192-216`, `242-266`).
- A fresh private ACTIVE build contains all of those phrases while its form is enabled and the focused browser test successfully transmits name/contact/message to `/api/contact`. Its synthetic `active` legal alias also changes only release metadata and `releaseIdentity`, retaining the DRAFT/not-in-force document body (`apps/web/test-active/legal-documents.ts:12-27`). The generated ACTIVE legal pages therefore still say DRAFT/not in force.
- Current ACTIVE tests assert attributes, missing disabled-announcement ID, client/chunk properties, submission, captcha, and axe results, but never assert state-appropriate RU/EN text (`apps/web/test/active-contact-artifact.test.ts:56-99`; `tools/browser/tests/contact-active.spec.ts:68-119`, `122-174`). Thus all 26 focused web tests and all 6 ACTIVE browser tests pass while the contradiction is present.

**Impact:** if the separately approved legal registry and public flag are activated using the documented sequence, the real page can accept and transmit personal data while telling the visitor that transmission is disabled and the linked consent is a non-effective draft. This violates the privacy-gated production workflow and makes the active-contour proof materially misleading. Because current production remains DRAFT and disabled, this is Important rather than a current live Critical incident.

**Required remediation:** make all contact-panel/form copy explicitly state-aware in both locales, including the direct-contact context, form title/note, consent link label/instruction/context, and consent validation language. Keep the current DRAFT copy unchanged. Do not invent or publish real legal wording: use a clearly synthetic, guarded active fixture for test-only legal content, while the real active legal body remains a separately approved release input. Extend ACTIVE artifact and browser tests with positive expected active copy and a deny-list for every DRAFT/disabled/no-transmission phrase across RU/EN landing and legal routes. Update the activation runbook to require state-appropriate UI/legal-copy inspection, not only identity/runtime/artifact mechanics.

### M1 — Closed

The repository test now introspects the complete ordered `email_outbox` schema and asserts the exact 16 columns/types/nullability (`apps/contact-function/test/outbox-repository.test.ts:275-305`), performs `SELECT *`, and requires the complete key set to equal explicitly permitted operational metadata plus the three authenticated-envelope fields (`apps/contact-function/test/outbox-repository.test.ts:307-327`). Existing decryption and captcha/honeypot non-persistence assertions remain. The reported plaintext-column mutation is appropriately sensitive. No remaining M1 defect found.

### M2 — Closed

The reused-UUID suite independently mutates all six durable fields — `locale`, `name`, `contact`, `message`, `sourcePath`, and `consentId` — and expects `request_id_reused` (`apps/contact-function/test/outbox-repository.test.ts:111-126`). Captcha/honeypot-only changes remain `existing` (`apps/contact-function/test/outbox-repository.test.ts:128-136`). Repository precedence now takes the canonical transaction lock, compares an existing hash, and only then applies current-consent validation before a new insert (`apps/contact-function/src/outbox-repository.ts:147-179`). A brand-new stale consent still produces no request/outbox rows (`apps/contact-function/test/outbox-repository.test.ts:204-218`), while the public submit service still rejects stale consent before honeypot/rate-limit/captcha/repository (`apps/contact-function/test/submit.test.ts:50-63`).

Concurrency/side-effect review found no new issue: a stale brand-new request can acquire a transaction-scoped advisory lock and perform a read, but it cannot insert; rollback releases the lock. Existing accepted identities retain deterministic hash-first idempotency, while the public boundary remains consent-first.

### M3 — Closed

The runbook, local acceptance, and Task 7 report now state width, height, and byte maxima independently and correctly assign 1,402-pixel height to the `390×1402` RU mobile text capture and 74,652 bytes to `ru-notification-text-desktop-light.png` at `1280×1234` (`docs/runbooks/contact-delivery.md:89`; `docs/reviews/contact-pipeline-local-acceptance.md:79`; `.superpowers/sdd/2026-08-20-vbtech-contact-pipeline/task-7-report.md:107`).

### M4 — Closed

The acceptance and Task 7 report now distinguish content counts on the 32 capture records from the contact-sheet record's dimensions, file bytes, and SHA-256 (`docs/reviews/contact-pipeline-local-acceptance.md:79`; `.superpowers/sdd/2026-08-20-vbtech-contact-pipeline/task-7-report.md:105`).

## New Critical/Important breakage

- **Critical:** none.
- **Important:** the state-incoherent ACTIVE contact/legal copy described under I1. No other new Critical or Important regression was found in the scoped diff.

## Fresh focused verification

- PASS: exact head `a2c9b3abb9cd83f9815a7b3bf36e7a459c060e79`, one-commit fix range, clean tracked worktree, and `git diff --check`.
- PASS: focused web runtime/artifact/build/default-shell suites, 26/26.
- PASS: ACTIVE Playwright, 6/6 across Desktop Chrome and Pixel 7, including RU/EN, explicit light/dark axe WCAG 2.2 checks, one initializer/binding, one captcha lifecycle, and exact JSON POST. The first sandboxed attempt could not bind loopback (`EPERM`); the approved loopback rerun passed and Playwright stopped its preview process.
- PASS: actual DRAFT plus public flag/key fails with the exact `Draft consent VBT-PD-02/DRAFT cannot be used when submission is enabled` error.
- PASS: fresh normal build produces 9 HTML and 0 JS/MJS; recursive deny-list finds no endpoint, captcha, active public key, enabled/fixture marker, secret name, developer path, or request-capable browser API.
- PASS: contact submit + HTTP boundary tests, 35/35; public consent-first order unchanged.
- PASS: contact-function TypeScript no-emit and Astro check (42 files, zero errors/warnings/hints).
- OBSERVED FAILURE OF ACCEPTANCE INTENT: fresh ACTIVE output contains the DRAFT/disabled/no-transmission phrases listed under I1 despite the passing automated suites.

## Not rerun

The dedicated PostgreSQL 17/Mailpit stack, DB-backed repository tests, root-wide unit/lint/typecheck/build/package-manager gates, standard/internal-fixture browser matrices, email evidence generator, and any live provider/deployment checks were not rerun. The exact-head fix report records those passes, and the scoped source/test changes plus mutation evidence were inspected. No service restart was necessary to establish the remaining Important finding.

No real SmartCaptcha, Postbox/IAM, managed database, Yandex function/timer, VM/Caddy, DNS/TLS, external mailbox/client, production form, legal publication, or real visitor data was exercised.

## Merge readiness

**Not ready to merge.** M1–M4 are closed and the runtime/security mechanics of I1 are strong, but I1's production activation path remains incomplete until the ACTIVE artifact is textually and legally coherent. Fix the state-aware RU/EN contact copy and the guarded active legal-fixture representation, add positive/negative artifact and browser assertions, and obtain another scoped re-review. The real legal body, effective date, provider inventory, public key/domain configuration, backend activation, deployment, and live smoke remain separate approval gates.

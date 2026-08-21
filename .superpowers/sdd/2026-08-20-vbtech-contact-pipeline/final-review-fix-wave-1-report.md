# Final-review fix wave 1 report

**Branch:** `feat/contact-pipeline`
**Starting head:** `21b56f689a32f3c17eca7c5be19f14e1c7c456f3`
**Date:** 2026-08-21
**Commit subject:** `fix: complete production contact activation path`

## Result

The whole-branch final review's Important production-integration gap and all four Minor findings are closed. The actual legal registry remains `VBT-PD-02/DRAFT`, the default production artifact remains disabled and client-free, and no live provider, public route, cloud resource, DNS, deployment, mailbox, or legal publication was changed.

## Production activation design

- `astro.config.mjs` derives two independent gates: the explicit public submission request and the non-DRAFT legal identity. Its Astro-native integration calls `injectScript("page", ...)` only when both are true.
- The injected entry imports and invokes the existing reviewed `initializeContactForms` implementation once. The active artifact therefore shares the exact production client instead of duplicating fixture logic.
- The public site key is supplied through `PUBLIC_SMARTCAPTCHA_SITE_KEY`, is validated as a bounded public identifier on the ready path, and is rendered into the enabled form. It is not treated as a secret. Server-only `SMARTCAPTCHA_SECRET` remains outside the web build.
- The same production `BaseLayout`, landing pages, `ContactForm`, contract, active consent identity, and client are exercised by a private production-shaped ACTIVE contour. The contour requires `VBTECH_PRIVATE_ACTIVE_LEGAL_ARTIFACT=1`, aliases only its legal-document import to a synthetic ACTIVE revision, accepts only `http://127.0.0.1:43229`, and writes only to `join(tmpdir(), "vbtech-contact-active-dist")`. It rejects `https://v-b.tech`, a missing guard, and a missing public key. The public flag alone cannot select it.
- Enabled production-shaped forms no longer expose or reference the disabled-state announcement. DRAFT and the older explicitly marked internal fixture keep their prior disabled/test notices and relationships.

The production legal registry and legal document contents were not activated or rewritten.

## Focused TDD and mutation evidence

Initial RED evidence was recorded before production implementation:

- the runtime-integration suite failed collection because `src/integrations/contact-runtime` did not exist;
- the production-shaped artifact suite failed because `test-active/astro.config.mjs` did not exist and its six behavior cases could not run;
- after the first active render, both RU/EN form assertions failed because the enabled form still announced the disabled notice;
- the root build-contract regression failed 1/19 after the new active browser gate was added, proving the canonical command contract needed an explicit update;
- the first real PostgreSQL 17 run passed 29/30: only the independent `consentId` mutation returned `consent_revision_changed` before comparing the stored hash.

GREEN behavior:

- focused web runtime/artifact/build/default-shell suite: 26/26;
- production-shaped browser gate: 6/6 across Desktop Chrome and Pixel 7;
- real PostgreSQL 17 outbox repository suite: 30/30.

Consent precedence now preserves both existing contracts. The public submit service still rejects stale consent before honeypot, rate limiting, captcha, or repository access. The repository takes the canonical UUID transaction fence and compares an existing durable hash first, so an already-stored UUID with any changed durable field, including consent, throws `request_id_reused`. A brand-new stale consent still throws `consent_revision_changed` before any insert; its no-row regression remains green.

Deliberate mutation proofs were restored immediately after observation:

- replacing durable `locale` with a constant made its parameterized reused-UUID case fail exactly because `existing` was returned instead of `request_id_reused`;
- adding plaintext `visitor_name text` to `email_outbox` made the exact information-schema regression fail with 17 received columns versus the permitted 16.

## Active and default artifact evidence

Fresh default/DRAFT build:

- exactly 9 HTML files;
- exactly 0 JS/MJS files;
- recursive scan contains no `/api/contact`, SmartCaptcha endpoint/API/client marker, reviewed or fixture site key, enabled marker, fixture marker, request-capable `fetch`/XHR/beacon, server secret name, or developer-home path.

`PUBLIC_CONTACT_SUBMISSION_ENABLED=true` with a valid public site key against the actual DRAFT registry fails with the exact error:

```text
Draft consent VBT-PD-02/DRAFT cannot be used when submission is enabled
```

Fresh private ACTIVE build:

- exactly 9 HTML files;
- exactly 1 shared JS file, `_astro/page.BJTu2KBs.js` in the observed build;
- the one request-capable chunk contains the shared client, `/api/contact`, and the SmartCaptcha loader;
- both RU and EN actual production pages contain one enabled form with `VBT-PD-02/2099.01/01`, `vbtech-reviewed-active-public-site-key`, the exact same-origin action, and no disabled or fixture relationship;
- no internal-fixture marker/key, server secret name/value, or developer-home path is emitted.

The focused browser proof observes exactly one submit listener on each active production page. Its controlled success path loads the official SmartCaptcha script URL once, renders the reviewed public key, executes once for one-time token `active-one-time-token`, performs one same-origin `POST /api/contact` with `application/json`, and verifies the exact nine-field shared contract plus canonical UUID. RU/EN idle and validation-error contact shells pass the configured WCAG 2.2 checks in explicit light/dark themes on desktop/mobile.

## Minor findings closed

- **M1:** the regression now asserts the literal ordered 16-column `email_outbox` schema, selects every column, and classifies the complete key set into permitted operational metadata or the authenticated ciphertext/IV/tag envelope. Decryption and absence of captcha/honeypot plaintext remain asserted.
- **M2:** reused-UUID tests independently mutate `locale`, `name`, `contact`, `message`, `sourcePath`, and `consentId`; a separate case proves captcha-token/honeypot-only changes remain the same durable request.
- **M3:** the runbook, local acceptance, and Task 7 report now state width, height, and byte maxima independently and name the artifacts that own the height and byte maxima.
- **M4:** the acceptance and Task 7 report now distinguish the 32 capture records' content counts from the contact-sheet record's dimensions, bytes, and hash.

The historical final review and Task 7 second re-review are included with this fix evidence.

## Runbook activation and rollback gates

The production sequence now names legal publication, the private ACTIVE artifact/browser gate, separate public-site-key versus server-secret configuration, database/handler/worker/Postbox/provider readiness, the real ACTIVE `https://v-b.tech` artifact scan, ordered backend/web activation, DNS/TLS/Caddy and controlled live smoke gates, and the unchanged default/DRAFT regression. Rollback disables and redeploys the public web path first, disables the handler separately, permits already accepted jobs to drain, and re-verifies the restored nine-HTML/zero-JS artifact.

## Final verification

- root lint: 3/3 tasks;
- root typecheck: 8/8 tasks;
- root unit graph: 460 tests passed — web 198, contact-function 130, legal-documents 88, contracts 33, email 6, content 5;
- real PostgreSQL 17 focused repository: 30/30;
- root build: 2/2 tasks;
- package-manager contract: 7/7 tasks, repository-local pnpm 11.10.0;
- full root browser: standard 95 passed/11 expected desktop-only skips, internal enabled fixture 65 passed/1 expected desktop-only skip, production-shaped ACTIVE 6/6 — 166 passed and 12 expected project skips overall;
- public flag + DRAFT: expected exact failure, followed by a fresh normal build and clean 9 HTML/0 JS-MJS recursive scan;
- active production-shaped artifact/browser: 9 HTML/1 JS and 6/6;
- `git diff --check`: pass;
- isolated PostgreSQL container, volume, and network: removed; final Compose listing empty.

## Confidence boundary

No real SmartCaptcha validation, Postbox/IAM call, managed PostgreSQL, Yandex Cloud Function or timer, Timeweb VM/Caddy, DNS/TLS change, external mailbox/client, production deployment, public form smoke, legal approval/publication, GitHub operation, or real visitor data was used. Those remain explicit release gates.

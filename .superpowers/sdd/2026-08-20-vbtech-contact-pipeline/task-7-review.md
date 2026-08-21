# Task 7 independent review — Mailpit and local operational proof

**Review range:** `9cf3ee93bcc39e0012660d05864350411016dcd9..93fd4e6fe5afed6e2da3cccffe9c848c6be0d386`

**Scope:** Task 7 only. This review inspected the binding production-site specification, the complete contact-pipeline plan, Task 7 brief/ledger/report, relevant Tasks 1–6 reports and runtime boundaries, the complete Task 7 diff, the ignored local visual evidence, and the applicable code-review, Playwright, visual/mobile, network, and accessibility guidance. No production/source file was edited and the local services were not restarted.

## Verdict

**Needs fixes.** The PostgreSQL/Mailpit delivery contour is materially real and the core durable-delivery claims are well supported, but three Important acceptance/safety gaps remain: the configured E2E can erase an unrelated local Mailpit mailbox, the required RU/EN template visual matrix omits English confirmation, and the claimed light/dark HTML-client proof is not meaningful. A fourth Important gap makes the visual proof non-reproducible from a clean checkout.

## Critical findings

None.

## Important findings

### 1. The E2E can delete every message in an unrelated loopback Mailpit instance

**Evidence:**

- `apps/contact-function/test/mailpit-test-client.ts:36-57` accepts `localhost`, `127.0.0.1`, or `::1` on **any explicit port** and proves neither the exact Task 7 port nor ownership of the Mailpit instance.
- `apps/contact-function/test/contact-pipeline.e2e.test.ts:68-75` calls `deleteAllMailpitMessages` unconditionally before the test.
- `apps/contact-function/test/mailpit-test-client.ts:168-175` implements that operation as `DELETE /api/v1/messages`, which erases the complete mailbox, not only `vbtech-task7` fixtures.
- `docs/runbooks/contact-delivery.md:15` asks the operator to inspect port ownership, but that human instruction is not enforced by the destructive test boundary.

This is reproducible from source: `VBTECH_E2E=1 VBTECH_MAILPIT_API_URL=http://localhost:<any-port>` passes the Mailpit URL guard before the global delete. The database reset has an exact role/database identity fence; the Mailpit reset does not have an equivalent fence.

**Required correction:** do not globally delete an arbitrary loopback mailbox. At minimum require the exact dedicated Task 7 origin and verify a Task 7 instance marker before mutation. Prefer querying/deleting only messages carrying the existing `vbtech-task7` tag, and prove with a real-Mailpit regression that an unrelated pre-existing message survives setup/cleanup. Keep the documented dedicated Compose contour and `down -v` cleanup.

### 2. The visual acceptance omits the English confirmation template

**Evidence:**

- `apps/contact-function/test/contact-pipeline.e2e.test.ts:98-109` creates a RU email request and an EN Telegram request; therefore only RU produces a confirmation.
- `docs/reviews/contact-pipeline-local-acceptance.md:45-58` records exactly three messages and calls those three the complete 24-capture matrix.
- The local `task-7-evidence/manifest.json:4-292` contains only `ru-confirmation`, `ru-notification`, and `en-notification`; there is no `en-confirmation` entry.
- The binding email rules require separate RU/EN subjects/copy and local rendered review (`docs/superpowers/specs/2026-08-20-vbtech-production-site-design.md:295-304`), while Task 7 requires both branded email types to be inspected (`.superpowers/sdd/2026-08-20-vbtech-contact-pipeline/task-7-brief.md:27-29`).

The durable E2E correctly covers the prescribed RU-email and EN-Telegram routing cases, but that does not visually accept the fourth locale/type combination. English confirmation currently has snapshot coverage from Task 2, not the required desktop/mobile, HTML/text, light/dark rendered inspection.

**Required correction:** retain the two required durable E2E requests, and add an English confirmation to the visual acceptance contour using the real shared renderer (and preferably actual Mailpit storage). Capture and inspect its HTML/plain-text desktop/mobile light/dark variants, links, request ID, and remote-request manifest.

### 3. The recorded HTML “light” and “dark” captures do not exercise distinct client rendering

**Evidence:**

- `docs/reviews/contact-pipeline-local-acceptance.md:58-81` claims light/dark client-colour-scheme coverage and readable appearance in both modes.
- All six HTML light/dark pairs in the ignored evidence are byte-for-byte identical: EN notification desktop/mobile, RU notification desktop/mobile, and RU confirmation desktop/mobile. For example both EN desktop files hash to `0b84356d4594b5eba58a79bcb9f3ea84d0baa20311a4fe587099682233b8ce74`, and both RU-confirmation desktop files hash to `6c8f12567aaa7254a251a64a579d2365e7f88ebf9d28f93ef220e7ebdbcabfb6`.
- `packages/email/src/theme.tsx:104-105` advertises `light dark`, but the template contains fixed inline colours and the current Chromium capture evidently applies no different HTML-client treatment. Merely changing `prefers-color-scheme` does not simulate Gmail/Outlook/Apple Mail dark-mode transformations.

The inspected images are readable, responsive, and visually coherent, but duplicating the same pixels under two filenames does not prove the binding dark email-client acceptance.

**Required correction:** make the acceptance harness apply and record a meaningful, documented dark-client preview mode, or inspect a representative real client that actually applies dark treatment. Add a mechanical assertion that a requested mode was applied and record the preview strategy/client. If the product intentionally forces one invariant rendering, document and validate the real clients that honor it instead of describing identical browser renders as separate dark-client proof.

### 4. The visual evidence cannot be reproduced or audited from a clean checkout

**Evidence:**

- `docs/reviews/contact-pipeline-local-acceptance.md:58-70` bases acceptance on 24 screenshots, a manifest, remote-request observations, and hashes, but points to `.superpowers/sdd/.../task-7-evidence/`.
- `.superpowers/sdd/.gitignore:1` ignores that entire tree; none of the manifest or screenshots exists in commit `93fd4e6`.
- `docs/runbooks/contact-delivery.md:57-74` contains only manual inspection instructions. There is no committed capture/manifest generator or validation command in the Task 7 diff, and `apps/contact-function/package.json:8-13` exposes only the data E2E.

The current local artifacts are internally consistent: the recorded hashes match, 24 unique files exist, the manifest has a complete 3-message × 2-part × 2-mode × 2-size matrix, and all 24 `remoteRequests` arrays are empty. The controller and this reviewer also inspected representative full-size images. The problem is durability: after a clean clone, the committed acceptance report points to evidence that is gone and gives no way to regenerate the 24 captures or zero-request manifest.

**Required correction:** keep the generated bodies/screenshots ignored (appropriate for transient message evidence), but commit a deterministic, bounded Playwright capture/validation tool and a package/runbook command that rebuilds the manifest from the actual local Mailpit messages. It should enforce exact local origin, unique output names, desktop/mobile dimensions, HTML/text variants, meaningful light/dark strategy, link and request-ID assertions, zero external requests, and content hashes. Then the report should identify the tool version/command and clearly distinguish generated local evidence from committed proof.

## Minor findings

### 1. The E2E does not verify several routing/header claims made by the acceptance report

`apps/contact-function/test/mailpit-test-client.ts:120-130` sends `From`, `ReplyTo`, and a deterministic `Message-ID`, and `docs/reviews/contact-pipeline-local-acceptance.md:16` states that Mailpit preserved them. However, `apps/contact-function/test/contact-pipeline.e2e.test.ts:137-155` asserts only subjects and `To` recipients; it never checks the fetched `From`, `ReplyTo`, or `MessageID` fields declared at `apps/contact-function/test/mailpit-test-client.ts:27-34`.

Add exact assertions for operator sender, email-notification visitor Reply-To, Telegram-notification operator Reply-To, confirmation Reply-To, and deterministic outbox-derived Message-ID. This will ensure the real Mailpit round trip supports the documented routing claim rather than only the helper's request construction.

## Verified strengths

- `deploy/local/compose.yml:1-39` uses exact version+digest pins, real health checks, named disposable volumes, and only `127.0.0.1` published ports. `docker compose config` resolves those ports as loopback ingress.
- The configured delivery test uses the production shared schema inside `OutboxRepository.accept`, the production encrypted repository/migration, the real worker state machine, and the production RU/EN renderers. Only the provider boundary is replaced by Mailpit's actual HTTP send API; Mailpit list/detail reads are real.
- `apps/contact-function/test/contact-pipeline.e2e.test.ts:119-183` proves duplicate acceptance before and after delivery, three leased/delivered jobs, conditional confirmation, Mailpit count stability, delivered timestamps, and atomic ciphertext/IV/tag erasure.
- `apps/contact-function/test/contact-pipeline.e2e.test.ts:81-94` exercises the exported production handler and confirms the current DRAFT route remains neutral even with `CONTACT_SUBMISSION_ENABLED=true`.
- `apps/contact-function/test/contact-pipeline.e2e.test.ts:185-198` checks the real worker's captured JSON telemetry against every synthetic visitor field and token; the production telemetry serializer itself is an explicit allow-list.
- `docs/runbooks/contact-delivery.md:88-95` uses the correct normal cleanup (`down -v --remove-orphans`) and clearly forbids retaining volumes except for a documented investigation. The final local Compose listing was empty; services were not restarted during review.
- The acceptance/runbook correctly and explicitly leave SmartCaptcha, Postbox/IAM, Cloud Functions/Timer Trigger, managed PostgreSQL, Timeweb, Caddy, DNS/TLS, public form, real mailbox, deployment, and physical-device acceptance unrun.
- The local visual artifacts' documented `manifest.json` and contact-sheet SHA-256 values match the files currently present. Representative full-size RU/EN HTML/text desktop/mobile images were readable, responsive, unclipped, and contained only the documented synthetic fixtures.

## Focused verification performed

- `CI=1 corepack pnpm --filter @vbtech/contact-function test:e2e` — PASS as the intended unconfigured gate: one file/two tests skipped.
- `CI=1 corepack pnpm --filter @vbtech/contact-function typecheck` — PASS.
- `docker compose -f deploy/local/compose.yml config` — PASS; exact pins and loopback-only published ports confirmed.
- `git diff --check 9cf3ee9..93fd4e6` — PASS.
- Evidence integrity/matrix inspection — PASS for the current local files: 24 unique captures, 12 HTML/12 text, 12 light/12 dark, 12 desktop/12 mobile, zero non-empty `remoteRequests`; recorded manifest/contact-sheet hashes match.
- Visual inspection — PASS for readability/responsiveness of the contact sheet and representative full-size captures; dark-HTML proof remains invalid for the reason above.

The configured PostgreSQL 17 + Mailpit E2E was not rerun because the documented stack had already been removed and the review instruction discouraged restarting it absent a reproduction need. The report's 2/2 configured run is consistent with the inspected code and current local evidence, but the four findings above remain source/evidence defects independent of rerunning services.

## Fixture and evidence data triage

- The committed request fixtures (`task7.ru@example.test`, `@task7fixture`, generic RU/EN names/messages), fixed local encryption key, captcha placeholder, and `vbtech_test_only` database password are clearly synthetic/test-only. They are not production secrets or real visitor data.
- The ignored screenshots/manifest contain the same synthetic message content, random request UUIDs, timestamps, `VBT-PD-02/DRAFT`, and the already-public direct contact links. No production secret, IAM/captcha token, real mailbox address, or real visitor content was found.
- Generated message bodies and screenshots should remain uncommitted by default: they are dynamic, contain complete fixture correspondence, and add brittle binaries. Commit the deterministic generator/validator instead. A deliberately sanitized, stable contact sheet could be committed later only if the project wants durable visual documentation and accepts its maintenance cost.

## Out-of-scope observations

- Live Postbox has no documented idempotency key, so the already-recorded accepted-then-lost-response ambiguity remains an external provider limitation, not a Task 7 regression.
- The two deferred Task 3 minors about exhaustive schema/plaintext and durable-hash mutation coverage remain whole-branch-review items; they were not introduced by Task 7.
- Actual dark behavior varies materially across email clients. A browser harness can provide a controlled regression surface but cannot replace final real-client/mailbox acceptance, which the documentation correctly leaves external.

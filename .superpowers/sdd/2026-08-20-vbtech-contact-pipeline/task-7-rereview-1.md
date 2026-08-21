# Task 7 fix round 1 independent re-review

**Review range:** `93fd4e6fe5afed6e2da3cccffe9c848c6be0d386..f41151194f61a0dcca6d50bedac73d1fba37e498`

**Scope:** the four Important and one Minor findings from `task-7-review.md`, plus any Critical/Important regression introduced by the fix range. The review read the changed code, updated acceptance/runbook, Task 7 report/ledger, ignored evidence manifest/images, and applicable Playwright/visual/mobile/accessibility guidance. No production or test source was edited and no service was started or restarted.

## Verdict

**Needs one more fix.** Findings 1, 2, 3, and the Minor header finding are fixed. Finding 4 is materially improved but remains Important because the committed generator has no enforceable input/body or rendered-output ceiling while the runbook and test call it bounded. No new Critical finding was found.

## Critical findings

None.

## Important findings

### 1. The committed visual generator still has unbounded Mailpit-body and screenshot output

This is the remaining part of original Important finding 4.

**Evidence:**

- `tools/browser/email-acceptance/capture.ts:93-99` calls `response.json()` directly. Unlike the E2E helper's one-megabyte bounded reader at `apps/contact-function/test/mailpit-test-client.ts:70-89`, the generator places no byte ceiling on Mailpit responses.
- `tools/browser/email-acceptance/capture.ts:111-133` validates count, tag, subject, and that `HTML`/`Text` are strings, but never bounds either body. A tagged message with one of the four exact subjects can therefore carry arbitrarily large HTML/text into the renderer.
- `tools/browser/email-acceptance/capture.ts:325-337` captures every message with `fullPage: true` and has no maximum document height or PNG byte-size assertion. `tools/browser/email-acceptance/capture.ts:275-292` then embeds all captures into another unbounded `fullPage` contact-sheet screenshot.
- `tools/browser/tests/email-acceptance.spec.ts:4-32` asserts 32 result records, mode application, contrast, and light/dark hash divergence, but asserts no maximum body bytes, document height, screenshot dimensions, per-file bytes, total bytes, or contact-sheet dimensions.
- `docs/runbooks/contact-delivery.md:78` calls this output bounded. The current evidence is benign and totals about 2 MiB, but it already demonstrates that viewport metadata is not an output bound: the manifest records mobile `390x844` and desktop `1280x900`, while actual full-page PNGs reach `390x1402` and `1280x1234`, and the contact sheet is `1120x3026`.

The exact origin/marker prevents use against an unrelated service, but it does not prove that the four tagged mailbox bodies are the expected bounded renderer outputs. This is not a hypothetical browser issue: the source accepts any string length, and `fullPage` explicitly expands to content height. A stale or locally injected exact-subject/tag fixture can consume unbounded memory and disk instead of failing closed, so the original requirement for a deterministic **bounded** generator is not yet met.

**Required correction:** add explicit constants and fail-closed checks for Mailpit response bytes, individual HTML/text characters or UTF-8 bytes, rendered document width/height, each PNG size, total evidence bytes, and contact-sheet dimensions/bytes. Record actual screenshot dimensions/bytes in the manifest and assert the exact maxima in the Playwright test. Keep full-page capture only within those ceilings, or capture a deliberately bounded element/clip. Update the runbook's bound claim to name the enforced values.

## Original finding-by-finding verdict

### Original Important 1 — arbitrary Mailpit deletion: fixed

- `apps/contact-function/test/mailpit-test-client.ts:44-64` accepts only `http://127.0.0.1:58025/`; aliases, alternate ports, paths, credentials, query, and fragment fail closed.
- `apps/contact-function/test/mailpit-test-client.ts:119-139` verifies the exact `vbtech-task7-dedicated` label before returning the branded handle used by mutation methods.
- `apps/contact-function/test/mailpit-test-client.ts:194-218` searches `tag:vbtech-task7` and deletes only returned IDs; the former global mailbox delete is gone.
- `apps/contact-function/test/contact-pipeline.e2e.test.ts:94-102` connects and verifies the marker before tagged deletion. The real-service regression at `apps/contact-function/test/contact-pipeline.e2e.test.ts:123-146` seeds an untagged message, deletes the owned tagged message, and proves the unrelated subject survives.
- `deploy/local/compose.yml:21-36` supplies the marker on the pinned, loopback-only Mailpit service.

The focused pure guard test passed 3/3. The real survival test was not rerun because the documented services had been removed and this scoped review did not need to recreate them; its source uses actual Mailpit send/list/delete behavior rather than a mocked mailbox.

### Original Important 2 — missing English confirmation: fixed

- The durable contour remains correctly limited to RU email and EN Telegram at `apps/contact-function/test/contact-pipeline.e2e.test.ts:148-259`.
- `apps/contact-function/test/contact-pipeline.e2e.test.ts:276-312` renders a deterministic EN confirmation through the shared `renderContactConfirmation`, sends it through the verified Mailpit sender, reads it back from Mailpit, and checks its exact request ID and routing headers.
- `tools/browser/email-acceptance/capture.ts:18-23,111-134` requires all four exact subject/kind combinations. The ignored manifest contains `en-confirmation`, and the inspected full-size light/dark mobile EN confirmation captures are readable and visibly distinct.

This is real Mailpit visual-contour coverage without changing Telegram's durable no-confirmation routing.

### Original Important 3 — identical light/dark captures: fixed

- `tools/browser/email-acceptance/capture.ts:7-11,164-205,207-216` names and implements the deterministic `controlled-local-email-client-emulation-v1` palette for HTML and text previews.
- `tools/browser/email-acceptance/capture.ts:218-247` measures key computed foreground/background contrast and confirms the requested mode marker.
- `tools/browser/tests/email-acceptance.spec.ts:15-31` requires all 32 captures, every mode applied, minimum contrast at least 4.5:1, and distinct light/dark pixel hashes for all 16 content/size pairs.
- `docs/reviews/contact-pipeline-local-acceptance.md:86` and `docs/runbooks/contact-delivery.md:80` accurately call this controlled local regression evidence and explicitly exclude Gmail, Outlook, Apple Mail, and other real-client acceptance.

The current manifest reports a 4.93:1 minimum and all 16 pairs diverge. The contact sheet and representative EN confirmation images visibly confirm meaningful light/dark treatment.

### Original Important 4 — non-reproducible evidence: partially fixed; Important remains

The core reproducibility gap is fixed: `tools/browser/email-acceptance/capture.ts`, `tools/browser/email.playwright.config.ts`, `tools/browser/tests/email-acceptance.spec.ts`, and the `accept:contact-emails` package command are committed. The command collects exactly one opt-in test; it requires the exact origin/marker/version/tag, exactly four messages, 32 unique capture records, request IDs, links, mode/contrast/hash assertions, and zero page requests. The ignored manifest and contact-sheet hashes match the acceptance report, and all 32 manifest pixel hashes match their PNGs.

The finding is not closed because the promised bounded-output half is missing, as detailed above.

### Original Minor 1 — missing header assertions: fixed

`apps/contact-function/test/contact-pipeline.e2e.test.ts:231-252,299-310` binds the real terminal outbox IDs to exact Mailpit `From`, route-specific `ReplyTo`, and deterministic `MessageID` values for RU notification, RU confirmation, EN Telegram notification, and the visual EN confirmation.

## Additional scoped checks

- **Canonical isolation:** fixed. `tools/browser/playwright.config.ts:8-12` excludes `email-acceptance.spec.ts`; default collection listed 106 ordinary tests in two files and did not collect the opt-in email test. `email.playwright.config.ts:3-14` independently collected exactly one email-acceptance test.
- **Service cleanup documentation:** accurate. `docs/runbooks/contact-delivery.md:103-110` uses `down -v --remove-orphans` and requires an empty final listing. Compose configuration resolves both services to the reviewed loopback ports, exact image digests, marker, and disposable volumes. Runtime cleanup was not independently rechecked because Docker API access was unavailable in the review sandbox; services were not restarted merely to repeat an already reported cleanup gate.
- **Public/legal boundary:** unchanged and honest. `docs/reviews/contact-pipeline-local-acceptance.md:88-98` keeps `VBT-PD-02/DRAFT`, public activation, live providers, real mailbox/client, deployment, DNS/TLS, and physical-device acceptance outside this local result.

## Evidence and content-safety triage

The ignored PNGs visibly contain the documented synthetic fixture names, synthetic `.test` contacts, synthetic messages, reserved documentation IP, request UUIDs, and the DRAFT consent ID. The manifest contains local filenames, request UUIDs, links, hashes, Mailpit version/label, and contrast metadata. No real personal content, credentials, encryption keys, captcha/IAM tokens, provider responses, or live mailbox data were observed.

Keeping `task-7-evidence/` ignored is correct: screenshots and message-derived metadata should not be committed even when fixtures are synthetic. The committed generator and prose contain no captured body. As an out-of-scope repository-hygiene observation, fix commit `f411511` force-tracks the otherwise ignored prior `task-7-review.md`; it contains no secret or personal content, but it is a process artifact rather than necessary executable proof.

## Focused verification performed

- `CI=1 corepack pnpm --filter @vbtech/contact-function test` — PASS, 130/130.
- Unconfigured `test:e2e` — PASS as the intended gate, one file/three tests skipped.
- Focused Mailpit guard Vitest — PASS, 3/3.
- Browser TypeScript check — PASS.
- Email Playwright config `--list` — exactly 1 test in 1 file.
- Default Playwright config `--list` — 106 tests in 2 files; email acceptance absent.
- Compose config — PASS; exact pins, loopback mappings, marker, and volumes present.
- `git diff --check` / commit check — PASS.
- Ignored evidence audit — 32 captures plus manifest/contact sheet; manifest and contact-sheet SHA-256 match the acceptance report; all 32 PNG hashes match the manifest; zero external requests; four kinds; minimum contrast 4.93; 16/16 light-dark pairs divergent.

## Final verdict

**Needs fixes: one Important remains, zero Critical.** Add and test explicit input/render/file/total output ceilings, then update the runbook with those exact bounds. The Mailpit safety, EN confirmation, meaningful controlled dark preview, exact delivery headers, canonical test isolation, cleanup instructions, and evidence privacy boundary are otherwise accepted in this scoped re-review.

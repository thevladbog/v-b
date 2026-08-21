# Task 7 implementation report — local contact delivery acceptance

## Status

Implemented and verified the isolated PostgreSQL 17 + Mailpit contour, real local delivery E2E, bilingual email visual acceptance, and operating runbook. No live provider, cloud, DNS, deployment, GitHub, or public resource was called or mutated.

## TDD

RED: the configured `test:e2e` command failed with one suite because `./mailpit-test-client.js` did not exist. No production or test-helper implementation existed at that boundary.

GREEN: after the minimum helper/compose implementation, the real configured E2E passed 2/2. The unconfigured command reports one file/two tests skipped.

## Runtime proof

- PostgreSQL: 17.10, `postgres:17-alpine@sha256:dc17045ccfd343b49600570ea734b9c4991cf1c3f3302e67df51e3b402dd55c4`, `127.0.0.1:55432`.
- Mailpit: v1.30.7, `axllent/mailpit:v1.30.7@sha256:a0ec6df78d03abfa0328c76ccb16ff164eb9e08623ef7ddd6f0fd5a43ab35ed8`, SMTP `127.0.0.1:51025`, API/UI `127.0.0.1:58025`.
- Actual Mailpit HTTP send API, list API, and message-detail API; no mocked mailbox/provider.
- RU email: notification + confirmation. EN Telegram: notification only.
- Same canonical UUID before/after delivery: existing acceptance, zero leased retry, mailbox stays at three.
- Exact consent ID in notification HTML/text; terminal ciphertext/IV/tag null; telemetry contains no visitor content.

## Visual proof

24 Chromium captures: three actual Mailpit messages × HTML/text × light/dark × desktop/mobile. Remote-request count was zero. Controller and implementer visually inspected the contact sheet. Evidence directory is ignored under `task-7-evidence`; contact sheet SHA-256 is `9e60e8ecad1f4e3c51f8e9fb56d7970b3c150edeac375310bdc86446dfaf3bb6`.

## Final gates

- configured E2E: 2/2;
- PostgreSQL 17 integration: 35/35;
- lint: 3/3 tasks;
- typecheck: 8/8 tasks;
- canonical root test: 443 unit + 95 standard browser + 65 enabled browser = 603 passed; 12 intentional device/project skips;
- build: 2/2;
- package-manager contract: 7/7;
- public flag under DRAFT: expected exit 1 with exact legal error;
- fresh normal build after expected failure: nine HTML files, zero JS, deny-list clean;
- compose config and `git diff --check`: pass.

The first sandboxed canonical root test attempt could not bind `127.0.0.1:43218` (`EPERM`). The exact command was rerun outside the filesystem sandbox and passed uninterrupted; no code change was made for the environment-only failure.

## Cleanup and boundary

`docker compose -f deploy/local/compose.yml down -v --remove-orphans` removed both containers, both disposable volumes, and the network. Final `ps --all` and volume filters were empty.

Unrun: live SmartCaptcha, Postbox/IAM, Cloud Functions/Timer Trigger, managed PostgreSQL, Timeweb, Caddy, DNS/TLS, deployment, public form, real mailbox, and physical mobile-device acceptance. Consent remains `VBT-PD-02/DRAFT` and production remains disabled.

## Fix round 1/5 — safe and reproducible acceptance

All four Important findings and the one Minor finding in `task-7-review.md` were verified and addressed.

### RED evidence

- Mailpit guard: 3/3 focused tests failed before the fix because a wrong port, `localhost` alias, and an unverified instance marker were accepted.
- Real Mailpit cleanup: 1 failed/2 passed because the old global delete removed a seeded unrelated message.
- Visual matrix: 1 failed/2 passed because the actual mailbox lacked the EN confirmation subject.
- Reproducibility: the new Playwright command failed at collection because `email-acceptance/capture.js` did not exist.
- Headers: a deliberate local Message-ID mutation failed with the exact expected `outbox-...@v-b.tech` versus received `mutated-...@v-b.tech` diff; it was restored before final gates.
- Integration: the first canonical rerun correctly exposed the opt-in Mailpit spec in the default browser glob (95 standard passed/11 skipped plus 2 env failures). Root cause was the default config's broad match; the visual spec was explicitly excluded and the complete canonical command then passed.

### Final implementation proof

- Exact Mailpit origin `http://127.0.0.1:58025/`, exact marker `vbtech-task7-dedicated`, and exact tag `vbtech-task7`; wrong origin/port/hostname/path/marker fails closed.
- Real-Mailpit safety regression proves a pre-existing untagged message survives scoped setup/cleanup while the tagged Task 7 fixture is removed.
- Durable contour remains RU email notification + confirmation and EN Telegram notification: three real repository/worker deliveries, three terminal erased rows, three bounded telemetry events, and no visitor content in logs.
- Visual-only EN confirmation uses the real shared renderer and actual Mailpit storage, producing four exact acceptance kinds without changing durable Telegram routing.
- Exact From, routing-specific Reply-To, and deterministic outbox Message-ID are asserted for notification/Telegram notification/confirmation deliveries.
- Committed generator version `1.0.0` produces 32 unique local captures and a manifest/contact sheet from actual tagged Mailpit messages. Desktop is 1280×900; mobile is 390×844; HTML and plain text are covered.
- Controlled deterministic dark-client emulation is explicitly regression-only evidence, not real-client acceptance. All modes were applied, minimum measured contrast was 4.93:1, all 16 light/dark pairs had distinct pixel hashes, links/request IDs passed, and remote requests were zero.
- Final contact sheet: `.superpowers/sdd/2026-08-20-vbtech-contact-pipeline/task-7-evidence/contact-sheet.png`, SHA-256 `cbb919d9ac099298e66f2f3a7e496a655c22ea098b4734408d77e6dc50009388`; implementer and controller visually reviewed it.

### Final gates

- focused Mailpit guards: 3/3;
- contact pure: 130/130;
- PostgreSQL 17 integration: 35/35;
- configured PG17 + Mailpit E2E: 3/3;
- visual Playwright generator/validator: 1/1;
- lint: 3/3; typecheck: 8/8; build: 2/2; package-manager: 7/7;
- canonical root: 446 unit + 95 standard browser + 65 enabled browser = 606 passed; 12 intentional device/project skips;
- public flag under DRAFT: expected exit 1 with the exact legal error;
- fresh normal build: nine HTML, zero JS, recursive contact/captcha/request-capability deny-list clean;
- `git diff --check` and Compose config: pass.

Final cleanup removed both containers, both disposable volumes, and the network with `docker compose ... down -v --remove-orphans`. Final Compose `ps --all`, container-name filter, and volume-name filter were empty.

Live SmartCaptcha, Postbox/IAM, Yandex Cloud Functions/Timer Trigger, managed PostgreSQL, Timeweb, Caddy, DNS/TLS, public deployment/form, GitHub, a real mailbox, and Gmail/Outlook/Apple Mail acceptance remain unrun and untouched.

## Fix round 2/5 — bounded evidence generation

The single Important finding in `task-7-rereview-1.md` was independently verified: Mailpit JSON was parsed without a byte ceiling, message bodies and rendered documents were unbounded, screenshots/sheet had no dimension or byte checks, aggregate disk output was unchecked, and failure could leave partial evidence.

### RED and mutation evidence

- Eight focused tests were added first and failed 8/8 because no exported limits or bounded JSON/body/document/PNG/aggregate/cleanup helpers existed.
- After the minimum implementation, the focused boundary suite passed 8/8.
- A deliberate mutation doubled all internal enforcement thresholds while the exported limits stayed unchanged. Six boundary tests failed and two unaffected contract/cleanup tests passed, proving the fixtures detect relaxed JSON, body, document, capture, aggregate, and sheet bounds. The mutation was restored and the suite passed 8/8 again.

### Exact bounds and final local evidence

- Mailpit JSON: 1,048,576 bytes, streamed before fatal UTF-8 decode and parse.
- HTML: 32,768 characters / 65,536 UTF-8 bytes; text: 8,192 characters / 16,384 UTF-8 bytes.
- Rendered document and each PNG: 1,440×2,048 pixels; each capture PNG: 524,288 bytes.
- All generated evidence including manifest: 8,388,608 bytes.
- Contact sheet: 1,280×4,096 pixels / 4,194,304 bytes.
- Failure removes the entire partial bounded output; the manifest records actual content, document, image, and file measurements for all 32 captures and the sheet.

The values are comfortably above the current controlled set while still bounding memory and disk cost: 2,085,570 total bytes; largest capture `1280×1402`/74,652 bytes; sheet `1120×3026`/396,659 bytes. Real marked PostgreSQL 17 + Mailpit E2E passed 3/3; the real-message Playwright acceptance passed 9/9 (eight boundary cases plus the four-kind generator). The regenerated sheet was visually inspected and remains readable/distinct across HTML/text, desktop/mobile, and light/controlled-dark. Manifest SHA-256 is `56fb097de27c49c7c5b8aefbfc5065c256effd9f4cc91f6db2019c69036a86c5`; sheet SHA-256 is `4222140c1eab3486cef607919c52ed9627ca15034474603ee2e018182c7fd1d0`.

### Final gates and cleanup

- focused boundary suite: 8/8; browser typecheck/lint: pass;
- contact pure: 130/130; PostgreSQL 17 integration: 35/35; configured PG17 + Mailpit E2E: 3/3;
- real-message email acceptance: 9/9;
- canonical root: 446 unit + 95 standard browser + 65 enabled browser = 606 passed; 12 intentional device/project skips;
- lint: 3/3; typecheck: 8/8; build: 2/2; package-manager: 7/7;
- public flag under DRAFT: expected exit 1 with exact `Draft consent VBT-PD-02/DRAFT cannot be used when submission is enabled` error;
- restored normal build: nine HTML files, zero JS/MJS, and zero request/captcha client capability matches;
- Compose config and `git diff --check`: pass.

Final `docker compose -f deploy/local/compose.yml down -v --remove-orphans` removed the exact marked Mailpit and PostgreSQL containers, both disposable volumes, and the network. Compose `ps --all` plus exact container, volume, and network name filters were empty. Live SmartCaptcha, Postbox/IAM, Yandex Cloud Functions/Timer Trigger, managed PostgreSQL, Timeweb, Caddy, DNS/TLS, public deployment/form, GitHub, a real mailbox, and Gmail/Outlook/Apple Mail acceptance remain unrun and untouched.

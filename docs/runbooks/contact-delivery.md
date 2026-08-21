# Contact delivery runbook

## Purpose and safety boundary

This runbook verifies the v-b.tech contact outbox locally and describes the production operating sequence. The repository's current consent identity is `VBT-PD-02/DRAFT`; the public form and production handler must remain disabled and route-neutral until the legal wording receives explicit approval and a non-draft revision is published.

The local contour uses only synthetic data, PostgreSQL 17, and Mailpit. It does not call SmartCaptcha, Postbox, Yandex Cloud, Timeweb, DNS, or a public endpoint.

## Local prerequisites

- Node.js 24 or newer and the repository-pinned pnpm 11.10.0;
- Docker Compose with ports `55432`, `51025`, and `58025` available on `127.0.0.1`;
- a clean checkout at the repository root.

Inspect port ownership before stopping anything. Do not stop unrelated containers. The historical `vbtech-contact-pg17-task3` container is agent-owned and may be removed only when it alone occupies `127.0.0.1:55432`.

## Start and verify the isolated stack

```bash
docker compose -f deploy/local/compose.yml up -d --wait
docker compose -f deploy/local/compose.yml ps
docker compose -f deploy/local/compose.yml exec -T postgres \
  psql -U vbtech_test -d vbtech_contact_test -Atc 'SHOW server_version;'
curl -fsS http://127.0.0.1:58025/api/v1/info
curl -fsS http://127.0.0.1:58025/api/v1/webui
```

Expected boundaries:

- PostgreSQL is 17.x and is published only as `127.0.0.1:55432`;
- Mailpit is v1.30.7, SMTP is `127.0.0.1:51025`, and UI/API is `127.0.0.1:58025`;
- the Mailpit Web UI label is exactly `vbtech-task7-dedicated`; the test fails closed on any other origin, port, hostname alias, path, or label;
- the local database, role, and password are disposable test-only values declared in Compose;
- the images are pinned by both version tag and immutable digest.

## Run the local delivery proof

The test accepts only `http://127.0.0.1:58025/`, verifies the dedicated instance label, and queries/deletes only messages tagged `vbtech-task7`. It never clears an arbitrary loopback mailbox. A real-Mailpit regression seeds an unrelated untagged message and proves it survives Task 7 setup/cleanup. The existing database helper separately requires exact role/database identity `vbtech_test@vbtech_contact_test` on loopback before any schema reset.

```bash
VBTECH_E2E=1 \
VBTECH_TEST_DATABASE_URL='postgresql://vbtech_test:vbtech_test_only@127.0.0.1:55432/vbtech_contact_test' \
VBTECH_MAILPIT_API_URL='http://127.0.0.1:58025' \
CI=1 corepack pnpm --filter @vbtech/contact-function test:e2e
```

Without `VBTECH_E2E=1`, the three real-service tests are reported as skipped. When the flag is set, missing or unsafe URLs fail before service use.

The configured run proves:

- the production public handler stays a neutral 404 while consent is DRAFT;
- a RU email request creates an operator notification and visitor confirmation;
- an EN Telegram request creates only the operator notification;
- repeated acceptance of the same canonical UUID does not create or send another job;
- notification HTML and text contain the exact accepted consent ID;
- delivered rows atomically clear ciphertext, IV, and authentication tag;
- JSON telemetry contains request IDs and bounded state only, never synthetic visitor fields or captcha tokens.
- `From`, `Reply-To`, and the outbox-derived deterministic `Message-ID` are exact for email notifications, Telegram notifications, and confirmations.

## Inspect the actual Mailpit messages

Open `http://127.0.0.1:58025`. Exactly four Task 7-tagged messages should exist after a clean run:

1. `Новое обращение с v-b.tech` to `hello@v-b.tech`;
2. `Ваше обращение с v-b.tech получено` to the synthetic RU visitor address;
3. `New v-b.tech enquiry` to `hello@v-b.tech`.
4. `We received your v-b.tech enquiry` to the synthetic EN acceptance address.

The first three messages are the durable repository/worker routing proof. The fourth is a visual-only EN confirmation rendered by the same shared production renderer and stored through the same Mailpit sender; it does not change the durable rule that Telegram receives no confirmation.

Rebuild the complete ignored evidence set from the actual tagged Mailpit messages with the committed Playwright generator (version `1.0.0`):

```bash
VBTECH_MAILPIT_API_URL='http://127.0.0.1:58025' \
CI=1 corepack pnpm --dir tools/browser accept:contact-emails
```

The bounded output is `.superpowers/sdd/2026-08-20-vbtech-contact-pipeline/task-7-evidence/`: 32 uniquely named captures, `manifest.json`, and `contact-sheet.png`. The generator enforces the exact origin and instance label, four exact subjects, desktop `1280×900` and mobile `390×844`, HTML/plain text, request IDs, confirmation links, no external body requests, and content/pixel SHA-256 hashes.

Generation fails closed at these committed ceilings:

- Mailpit JSON response: 1,048,576 bytes, consumed as a bounded stream before UTF-8 decoding and JSON parsing;
- each HTML part: 32,768 Unicode characters and 65,536 UTF-8 bytes;
- each plain-text part: 8,192 Unicode characters and 16,384 UTF-8 bytes;
- each rendered document and capture: 1,440 × 2,048 pixels, measured before capture; each PNG: 524,288 bytes;
- complete generated evidence, including the stable manifest: 8,388,608 bytes;
- contact sheet: 1,280 × 4,096 pixels and 4,194,304 bytes.

The current synthetic set uses about 2.1 MB in total. Its independent capture maxima are 1,280 pixels wide, 1,402 pixels high, and 74,652 PNG bytes: the height belongs to a `390×1402` RU notification plain-text mobile capture, while the byte maximum belongs to `ru-notification-text-desktop-light.png` at `1280×1234`. The sheet is `1120×3026` and 396,659 bytes. The ceilings intentionally leave practical copy/layout headroom while preventing an unexpected mailbox response or page from causing unbounded JSON parsing, browser expansion, memory use, or disk output. PNG dimensions and bytes are inspected before write, the stable manifest records actual dimensions/bytes for all captures and the sheet, and any failure removes partial output.

For every message, inspect HTML and plain text at both sizes and modes. Dark captures use the documented deterministic `controlled-local-email-client-emulation-v1` palette layer. It mechanically proves that the requested mode was applied, that key text contrast is at least 4.5:1, and that every dark pixel hash differs from its light counterpart. It is regression evidence only, not a claim of Gmail, Outlook, Apple Mail, or other real-client acceptance. Confirm:

- no horizontal clipping or unreadable contrast;
- the RU and EN copy, subject, and footer are appropriate;
- the request UUID is visible in HTML and text;
- operator notifications show `VBT-PD-02/DRAFT` as the test consent identity;
- confirmation links are exactly `mailto:hello@v-b.tech` and `https://t.me/thevladbog`;
- the browser Network panel shows no remote image, font, stylesheet, tracking, or other request from the message body.

Do not use real personal data in Mailpit evidence. Screenshots and exported message bodies are local evidence artifacts and are not committed.

## Prove the public build remains fail-closed

This command must fail while the legal identity is DRAFT:

```bash
PUBLIC_CONTACT_SUBMISSION_ENABLED=true CI=1 corepack pnpm --dir apps/web build
```

Expected error: `Draft consent VBT-PD-02/DRAFT cannot be used when submission is enabled`.

Run a normal build afterward so `apps/web/dist` is restored to the disabled, client-free artifact.

## Stop and erase local state

```bash
docker compose -f deploy/local/compose.yml down -v --remove-orphans
docker compose -f deploy/local/compose.yml ps --all
```

The final listing must contain no Task 7 service. Volumes are retained only during an explicitly documented active investigation; the normal acceptance path removes them.

## Production operating sequence (not executed by this runbook)

The private ACTIVE contour is a release gate, not a deployable artifact. It is restricted to `http://127.0.0.1:43229`, writes only to the OS temporary directory, requires `VBTECH_PRIVATE_ACTIVE_LEGAL_ARTIFACT=1`, and uses a test-only legal alias. It cannot be selected by `PUBLIC_CONTACT_SUBMISSION_ENABLED`, cannot target `https://v-b.tech`, and must never be copied to the public output.

1. Approve the exact Russian legal wording, paired English translation, non-DRAFT revisions and effective dates, operator profile, and complete provider inventory in `@vbtech/legal-documents`. Publish the current `VBT-PD-01` policy and `VBT-PD-02` consent atomically as one code-enforced personal-data legal contour. The shared contour must return `active` only when both independently valid current releases are ACTIVE; either mixed direction is an incoherent state that aborts every static build before artifact emission. Treat this atomic publication as a separately reviewed legal change.
2. Approve the exact state-aware RU/EN interface copy together with the active legal wording. Review the direct-contact context, form title/note, policy and consent link labels, consent instruction/context/error, register, status banner, metadata, and all RU/EN legal pages. An ACTIVE artifact must describe actual transmission and current consent; it must contain no DRAFT, disabled, no-transmission, or cannot-accept wording.
3. Before changing the production registry, run `corepack pnpm --dir apps/web build:contact-active` and `corepack pnpm --dir tools/browser test:contact-active`. Require the actual production layouts/pages to produce nine HTML files, one shared initialized contact client, the reviewed test public key, exact same-origin JSON submission, a one-time SmartCaptcha lifecycle, exact state-appropriate RU/EN landing and legal copy, and no fixture marker or secret. Also run the guarded mixed-contour artifact regression and require both PD01-ACTIVE/PD02-DRAFT and PD01-DRAFT/PD02-ACTIVE to abort with no output whether the public submission flag is off or on.
4. Provision a separate v-b.tech database/user and apply `0001_contact_outbox.sql` with least privilege. Never point reset helpers or local credentials at a managed database.
5. Store independent outbox-encryption and rate-limit HMAC keys plus `SMARTCAPTCHA_SECRET` in the approved server-side secret store. Never compile them into the site or log them.
6. Configure the reviewed public SmartCaptcha site key as `PUBLIC_SMARTCAPTCHA_SITE_KEY`. This value is intentionally public; it must match the reviewed production SmartCaptcha site and must never be replaced with `SMARTCAPTCHA_SECRET`.
7. Configure the verified `hello@v-b.tech` Postbox sender, function service-account permissions, database access, HTTP handler route, and timer trigger. Keep server-side `CONTACT_SUBMISSION_ENABLED` disabled.
8. Deploy the handler/backend with submission disabled. Verify `/api/contact` remains a neutral 404, alternate paths/methods stay 404, the worker can reach the dedicated database and Postbox, and bounded synthetic notification/confirmation delivery succeeds.
9. After the shared personal-data legal contour reports ACTIVE for both current releases, build the real `https://v-b.tech` artifact with `PUBLIC_CONTACT_SUBMISSION_ENABLED=true` and the reviewed `PUBLIC_SMARTCAPTCHA_SITE_KEY`. Require nine HTML files and exactly one shared request-capable JS/MJS chunk containing the active consent identity, public site key, SmartCaptcha URL, and `/api/contact`, with no fixture marker, secret name/value, or developer path.
10. Enable the backend handler, then deploy the reviewed active web artifact as separate approved changes. Verify SmartCaptcha domain restrictions, exact route behavior, same-origin TLS/DNS/Caddy routing, Postbox sender identity, mailbox receipt, timer delivery, and the public form with controlled non-sensitive data.
11. Keep the default/DRAFT regression mandatory throughout: a normal build produces nine HTML files and zero JS/MJS; the recursive deny-list contains no `/api/contact`, SmartCaptcha endpoint/API/client, public site key, enabled marker, fixture marker, request-capable fetch/XHR/beacon, secret, or developer path. A public-flag build against DRAFT must fail with the exact documented error.

### Queue diagnosis

Use metadata-only queries: public request UUID, kind, timestamps, attempt counters, next attempt, lease, terminal state, and bounded provider ID. Never select or print encrypted payload columns during routine diagnosis. Do not log request bodies, decrypted payloads, rendered email, captcha/IAM tokens, or provider error bodies.

- Pending with a future `next_attempt_at`: bounded retry is scheduled.
- Pending with an expired lease: the next timer invocation can recover it.
- Five provider attempts: the worker closes the job without a sixth provider call.
- Delivered/failed with a non-null envelope: run the bounded retention repair and investigate the version path.
- A provider-accepted request followed by a lost response remains an explicit at-least-once ambiguity because Postbox documents no idempotency key; correlate through the deterministic MIME Message-ID and request UUID without exposing visitor content.

### Disable and rollback

1. Disable public submission first by rebuilding/redeploying the web artifact without `PUBLIC_CONTACT_SUBMISSION_ENABLED=true`; keep legal pages and direct email/Telegram contacts available.
2. Disable server-side `CONTACT_SUBMISSION_ENABLED` so the handler returns the neutral response. Keep the timer worker running long enough to process already accepted jobs unless incident handling requires a deliberate stop.
3. Roll back function and web artifacts independently; verify the restored web artifact again has nine HTML files, zero JS/MJS, and no request-capable contact runtime.
4. Preserve only the minimum metadata needed for recovery and follow the approved mailbox/outbox retention policy.
5. DNS, public exposure, replay, deletion, and live infrastructure changes require separate explicit approval.

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
```

Expected boundaries:

- PostgreSQL is 17.x and is published only as `127.0.0.1:55432`;
- Mailpit is v1.30.7, SMTP is `127.0.0.1:51025`, and UI/API is `127.0.0.1:58025`;
- the local database, role, and password are disposable test-only values declared in Compose;
- the images are pinned by both version tag and immutable digest.

## Run the local delivery proof

The test refuses a non-loopback Mailpit origin. The existing database helper separately requires exact role/database identity `vbtech_test@vbtech_contact_test` on loopback before any schema reset.

```bash
VBTECH_E2E=1 \
VBTECH_TEST_DATABASE_URL='postgresql://vbtech_test:vbtech_test_only@127.0.0.1:55432/vbtech_contact_test' \
VBTECH_MAILPIT_API_URL='http://127.0.0.1:58025' \
CI=1 corepack pnpm --filter @vbtech/contact-function test:e2e
```

Without `VBTECH_E2E=1`, the two real-service tests are reported as skipped. When the flag is set, missing or unsafe URLs fail before service use.

The configured run proves:

- the production public handler stays a neutral 404 while consent is DRAFT;
- a RU email request creates an operator notification and visitor confirmation;
- an EN Telegram request creates only the operator notification;
- repeated acceptance of the same canonical UUID does not create or send another job;
- notification HTML and text contain the exact accepted consent ID;
- delivered rows atomically clear ciphertext, IV, and authentication tag;
- JSON telemetry contains request IDs and bounded state only, never synthetic visitor fields or captcha tokens.

## Inspect the actual Mailpit messages

Open `http://127.0.0.1:58025`. Exactly three messages should exist after a clean run:

1. `Новое обращение с v-b.tech` to `hello@v-b.tech`;
2. `Ваше обращение с v-b.tech получено` to the synthetic RU visitor address;
3. `New v-b.tech enquiry` to `hello@v-b.tech`.

For every message, inspect HTML and plain text at a desktop width near 1280 px and a mobile width near 390 px. Repeat with the browser/client colour scheme set to light and dark. Confirm:

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

1. Approve and publish the exact Russian legal wording, paired English translation, active consent revision, effective date, operator profile, and provider inventory.
2. Provision a separate v-b.tech database/user and apply `0001_contact_outbox.sql` with least privilege. Never point reset helpers or local credentials at a managed database.
3. Store independent outbox-encryption and rate-limit HMAC keys plus SmartCaptcha secret in the approved secret store. Never compile them into the site or log them.
4. Configure the verified `hello@v-b.tech` Postbox sender and the function service-account permissions.
5. Deploy the function with contact submission disabled. Verify the exact route remains neutral and alternate API paths/methods stay 404.
6. Start the timer worker, observe only bounded telemetry fields, and verify notification/confirmation routing with controlled non-sensitive data.
7. Activate public submission only as a separate approved change after live SmartCaptcha, Postbox, mailbox, DNS/TLS, and legal gates pass.

### Queue diagnosis

Use metadata-only queries: public request UUID, kind, timestamps, attempt counters, next attempt, lease, terminal state, and bounded provider ID. Never select or print encrypted payload columns during routine diagnosis. Do not log request bodies, decrypted payloads, rendered email, captcha/IAM tokens, or provider error bodies.

- Pending with a future `next_attempt_at`: bounded retry is scheduled.
- Pending with an expired lease: the next timer invocation can recover it.
- Five provider attempts: the worker closes the job without a sixth provider call.
- Delivered/failed with a non-null envelope: run the bounded retention repair and investigate the version path.
- A provider-accepted request followed by a lost response remains an explicit at-least-once ambiguity because Postbox documents no idempotency key; correlate through the deterministic MIME Message-ID and request UUID without exposing visitor content.

### Disable and rollback

1. Disable public submission first; keep legal pages and direct email/Telegram contacts available.
2. Keep the timer worker running long enough to process already accepted jobs unless incident handling requires a deliberate stop.
3. Roll back function and web artifacts independently.
4. Preserve only the minimum metadata needed for recovery and follow the approved mailbox/outbox retention policy.
5. DNS, public exposure, replay, deletion, and live infrastructure changes require separate explicit approval.

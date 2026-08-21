# Contact pipeline local acceptance

**Date:** 2026-08-21

**Scope:** isolated PostgreSQL 17 + Mailpit delivery proof with synthetic data

**Result:** accepted locally; all live-provider and publication gates remain unrun

## Runtime contour

| Service | Exact image | Loopback ports | Observed runtime |
| --- | --- | --- | --- |
| PostgreSQL | `postgres:17-alpine@sha256:dc17045ccfd343b49600570ea734b9c4991cf1c3f3302e67df51e3b402dd55c4` | `127.0.0.1:55432 → 5432` | `17.10` |
| Mailpit | `axllent/mailpit:v1.30.7@sha256:a0ec6df78d03abfa0328c76ccb16ff164eb9e08623ef7ddd6f0fd5a43ab35ed8` | SMTP `127.0.0.1:51025 → 1025`; UI/API `127.0.0.1:58025 → 8025` | `v1.30.7` |

Compose reported both services healthy. Mailpit exposed the exact Task 7 marker `vbtech-task7-dedicated`. The test and generator accept only `http://127.0.0.1:58025/`, verify that marker, and operate only on messages tagged `vbtech-task7`. Mailpit's v1.30.7 Swagger document was inspected before implementation; the local sender uses its documented `POST /api/v1/send` JSON shape and preserves separate HTML/plain-text parts, envelope routing, Reply-To, subject, and deterministic Message-ID.

## TDD evidence

Initial configured command before the Mailpit test client existed:

```text
VBTECH_E2E=1 ... corepack pnpm --filter @vbtech/contact-function test:e2e
FAIL test/contact-pipeline.e2e.test.ts
Error: Cannot find module './mailpit-test-client.js'
Test Files 1 failed (1); exit 1
```

Final configured real-service command:

```text
VBTECH_E2E=1 \
VBTECH_TEST_DATABASE_URL=postgresql://vbtech_test:vbtech_test_only@127.0.0.1:55432/vbtech_contact_test \
VBTECH_MAILPIT_API_URL=http://127.0.0.1:58025 \
CI=1 corepack pnpm --filter @vbtech/contact-function test:e2e

Test Files 1 passed (1)
Tests 3 passed (3)
```

The unconfigured gate also passed with one file/three tests reported skipped.

Fix-round RED evidence was captured independently for all review findings: origin aliases/wrong ports and a wrong instance label were initially accepted (3/3 focused guard failures); the former global delete removed a seeded unrelated message (real-Mailpit E2E 1 failed/2 passed); the four-message assertion failed on the missing EN confirmation (1 failed/2 passed); the committed visual command failed because its capture module did not yet exist; and a deliberate local Message-ID mutation produced the exact expected-versus-received header diff. Each mutation was restored before final verification.

## Delivery assertions

| Synthetic request | Durable jobs | Actual Mailpit messages | Result |
| --- | ---: | ---: | --- |
| RU email | notification + confirmation | 2 | correct subjects and recipients; confirmation only for email |
| EN Telegram | notification | 1 | operator notification only |

The test repeated the complete RU request with the same canonical UUID before and after delivery. Repository acceptance returned `existing`, the subsequent drain leased zero rows, and the Mailpit count remained exactly three.

The mailbox safety regression seeded a pre-existing untagged message, created a tagged Task 7 fixture, ran scoped cleanup, and proved that the unrelated subject survived while the owned fixture was removed. Wrong origin, port, hostname alias, or marker fails closed before mailbox mutation.

Every operator notification contained the exact consent identity `VBT-PD-02/DRAFT` in HTML and text. The current public production handler returned the same bounded neutral 404 while `CONTACT_SUBMISSION_ENABLED=true`; the internal local readiness path did not present DRAFT consent as public/legal acceptance.

All three terminal rows had `delivered_at` set and `payload_ciphertext`, `payload_iv`, and `payload_auth_tag` set to null. Captured JSON telemetry contained three bounded delivered events and none of the synthetic names, contact values, messages, or captcha tokens. E2E asserted exact `From`, routing-specific `Reply-To`, and deterministic outbox `Message-ID` for the RU email notification and confirmation, EN Telegram notification, and visual EN confirmation.

## Rendered email review

Actual message bodies were read back from Mailpit and rendered in Chromium by the committed generator `tools/browser/email-acceptance/capture.ts`, invoked through `corepack pnpm --dir tools/browser accept:contact-emails` with Playwright `1.62.0`. Durable routing remains RU email notification + confirmation and EN Telegram notification. A fourth visual-only EN confirmation was produced by the real shared renderer and stored in Mailpit through the same local sender. The matrix covered four message kinds × HTML/plain text × light/controlled-dark × desktop/mobile viewport: **32 captures**. The request monitor observed **0 remote requests**.

Local evidence directory (ignored by Git):

```text
.superpowers/sdd/2026-08-20-vbtech-contact-pipeline/task-7-evidence/
```

Evidence integrity:

```text
manifest.json     sha256 f548debee342589b97adc805ae23e3b75e7ba4f44dbb665912f1a4b6740e819d
contact-sheet.png sha256 cbb919d9ac099298e66f2f3a7e496a655c22ea098b4734408d77e6dc50009388
```

Mail content hashes from the captured run:

| Message | HTML SHA-256 | Plain-text SHA-256 |
| --- | --- | --- |
| RU notification | `85c5b4c8f961a6a7bf5c82df0ecd51ead35ce1b85351087cf3ce969ac892082e` | `100d7010a691a89b33eb2c67da1cba30dc82edf270f59a040a8aa8d737ab288b` |
| RU confirmation | `4934a32292f3775c14e70e1cb0be067d76d4c616ece137ec9abc7ec8dd385c06` | `1e32db4f23668ef337b1a5d0a694afa652024d858bbda3501003376c7d960c10` |
| EN notification | `247357bade5540f3e9f50240dad29c52491fb321284ea6b3b5aacc3e60ca8254` | `eee037fc2e085bafb801816120c7dac2008171f6b687b3f5023f305172149d96` |
| EN confirmation | `6cfc363703073e7ff39da0deee07850239147d1851436753b7067ff275d908e8` | `ce2b253580efbbc3331970082b198a4418b2f2a6659f7c15bb0bca6901b2c6bb` |

Visual inspection confirmed readable graphite/warm-light branding, signal amber links, no horizontal clipping at 390 px, visible request IDs, full RU/EN operational fields, exact consent ID in notifications, and the confirmation links `mailto:hello@v-b.tech` and `https://t.me/thevladbog`. The deterministic `controlled-local-email-client-emulation-v1` layer was mechanically applied to every dark capture; the minimum measured key-text contrast was **4.93:1**, and all 16 HTML/text/size light-dark pairs had different pixel hashes. This is reproducible local regression evidence, not real Gmail/Outlook/Apple Mail acceptance.

## Fail-closed and confidence boundary

The public-flag build under current DRAFT consent is required to fail with:

```text
Draft consent VBT-PD-02/DRAFT cannot be used when submission is enabled
```

A normal build must follow that expected failure before completion.

This acceptance did **not** call or mutate live SmartCaptcha, Postbox, IAM, Yandex Cloud Functions/Timer Trigger, managed PostgreSQL, Timeweb, DNS, TLS, Caddy, public deployment, GitHub, or a real mailbox/client. It did not use real visitor data. Live provider identity, delivery, legal approval, public form smoke, DNS/TLS, Gmail/Outlook/Apple Mail, physical mobile-device, and production rollback acceptance remain separate explicit release gates.

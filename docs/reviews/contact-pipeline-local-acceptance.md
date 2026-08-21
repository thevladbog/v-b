# Contact pipeline local acceptance

**Date:** 2026-08-21

**Scope:** isolated PostgreSQL 17 + Mailpit delivery proof with synthetic data

**Result:** accepted locally; all live-provider and publication gates remain unrun

## Runtime contour

| Service | Exact image | Loopback ports | Observed runtime |
| --- | --- | --- | --- |
| PostgreSQL | `postgres:17-alpine@sha256:dc17045ccfd343b49600570ea734b9c4991cf1c3f3302e67df51e3b402dd55c4` | `127.0.0.1:55432 → 5432` | `17.10` |
| Mailpit | `axllent/mailpit:v1.30.7@sha256:a0ec6df78d03abfa0328c76ccb16ff164eb9e08623ef7ddd6f0fd5a43ab35ed8` | SMTP `127.0.0.1:51025 → 1025`; UI/API `127.0.0.1:58025 → 8025` | `v1.30.7` |

Compose reported both services healthy. Mailpit's v1.30.7 Swagger document was inspected before implementation; the local sender uses its documented `POST /api/v1/send` JSON shape and preserves separate HTML/plain-text parts, envelope routing, Reply-To, subject, and deterministic Message-ID.

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
Tests 2 passed (2)
```

The unconfigured gate also passed with one file/two tests reported skipped.

## Delivery assertions

| Synthetic request | Durable jobs | Actual Mailpit messages | Result |
| --- | ---: | ---: | --- |
| RU email | notification + confirmation | 2 | correct subjects and recipients; confirmation only for email |
| EN Telegram | notification | 1 | operator notification only |

The test repeated the complete RU request with the same canonical UUID before and after delivery. Repository acceptance returned `existing`, the subsequent drain leased zero rows, and the Mailpit count remained exactly three.

Every operator notification contained the exact consent identity `VBT-PD-02/DRAFT` in HTML and text. The current public production handler returned the same bounded neutral 404 while `CONTACT_SUBMISSION_ENABLED=true`; the internal local readiness path did not present DRAFT consent as public/legal acceptance.

All three terminal rows had `delivered_at` set and `payload_ciphertext`, `payload_iv`, and `payload_auth_tag` set to null. Captured JSON telemetry contained three bounded delivered events and none of the synthetic names, contact values, messages, or captcha tokens.

## Rendered email review

Actual message bodies were read back from Mailpit and rendered in Chromium. The matrix covered three delivered messages × HTML/plain text × light/dark client colour scheme × desktop/mobile viewport: **24 captures**. The request monitor observed **0 remote requests**.

Local evidence directory (ignored by Git):

```text
.superpowers/sdd/2026-08-20-vbtech-contact-pipeline/task-7-evidence/
```

Evidence integrity:

```text
manifest.json     sha256 b6ad48c7685227fcc3ffb4c6b0a533eb11af55094feb1980b77aff361cda8a4c
contact-sheet.png sha256 9e60e8ecad1f4e3c51f8e9fb56d7970b3c150edeac375310bdc86446dfaf3bb6
```

Mail content hashes from the captured run:

| Message | HTML SHA-256 | Plain-text SHA-256 |
| --- | --- | --- |
| RU notification | `309d621e8f5879be6457751e08c04f55a6e2af06904694dbcae5401d847e5771` | `1a2480e30ef70c1201346d826e0db7108adaf05c80734c9993bf6e4bcf78bb4d` |
| RU confirmation | `42b163ccb5678f671c771326e1acc63c12fcd9ba252d8be65e887b26a5ab28ae` | `186bb405a18bb1e31d0217051ef24be22f9c82a05030902025b03aa8bc7180f0` |
| EN notification | `7c0f8ac1667676246da6a7e88069bd2966510c04b6c2754d9dc7193408f0e997` | `11db6db2b3925e91201c490cd4dd29334ca72fb582cbd8afb964ca3d54eae48e` |

Visual inspection confirmed readable graphite/warm-light branding, signal amber links, no horizontal clipping at 390 px, visible request IDs, full RU/EN operational fields, exact consent ID in notifications, and the confirmation links `mailto:hello@v-b.tech` and `https://t.me/thevladbog`. Plain-text captures remained readable in both light and dark controlled client surfaces.

## Fail-closed and confidence boundary

The public-flag build under current DRAFT consent is required to fail with:

```text
Draft consent VBT-PD-02/DRAFT cannot be used when submission is enabled
```

A normal build must follow that expected failure before completion.

This acceptance did **not** call or mutate live SmartCaptcha, Postbox, IAM, Yandex Cloud Functions/Timer Trigger, managed PostgreSQL, Timeweb, DNS, TLS, Caddy, public deployment, GitHub, or a real mailbox. It did not use real visitor data. Live provider identity, delivery, legal approval, public form smoke, DNS/TLS, mobile-device, and production rollback acceptance remain separate explicit release gates.

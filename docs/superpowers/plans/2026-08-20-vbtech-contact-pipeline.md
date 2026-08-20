# v-b.tech Contact and Email Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a privacy-gated, idempotent contact API with SmartCaptcha, encrypted PostgreSQL outbox delivery, and branded RU/EN notification and confirmation emails.

**Architecture:** The static Astro form posts an exact shared Zod contract to a Yandex-compatible HTTP handler. The handler validates and commits encrypted delivery jobs transactionally; a separately triggered worker leases jobs and sends through Postbox. The web, function, legal and email packages compile the same active consent identifier.

**Tech Stack:** TypeScript 6.0.3, Zod 4.4.3, pg 8.22.0, React 19.2.7, React Email 6.9.1, Vitest 4.1.10, PostgreSQL 17, Yandex Cloud Functions, Postbox, SmartCaptcha, Mailpit

**Spec:** `docs/superpowers/specs/2026-08-20-vbtech-production-site-design.md`

## Global Constraints

- Exact public route: same-origin `POST /api/contact`; every alternate method/path is rejected.
- JSON body is limited to 8 KiB and unknown properties are rejected.
- User fields are name ≤100, contact ≤254, message ≤4,000; attachments are excluded.
- Current consent identity is imported from `@vbtech/legal-documents`, never configured independently.
- Public acceptance occurs only after durable transactional enqueue.
- User content and captcha tokens never enter logs.
- Durable payload is encrypted; v-b.tech uses a separate DB/user and cannot read Markiro schemas.
- Notification always queues; confirmation queues only for email contacts.
- Public form remains feature-gated and fail-closed.
- Every task follows RED → GREEN → REFACTOR and ends in a focused commit.

---

### Task 1: Shared contact contract and public errors

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/src/contact.ts`
- Create: `packages/contracts/src/errors.ts`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/test/contact.test.ts`

**Interfaces:**
- Produces: `contactRequestSchema`, `ContactRequest`, `ContactLocale`, `CONTACT_SOURCE_PATHS`.
- Produces: `ContactErrorCode` and `ContactAcceptedResponse`.

- [ ] **Step 1: Write failing boundary tests**

```ts
const valid = {
  requestId: "11111111-1111-4111-8111-111111111111",
  locale: "en",
  name: "Vlad",
  contact: "@thevladbog",
  message: "A concrete product problem",
  sourcePath: "/en/",
  consentId: CURRENT_CONTACT_CONSENT_ID,
  captchaToken: "opaque-token",
  website: "",
};
expect(contactRequestSchema.parse(valid).contact).toBe("@thevladbog");
expect(() => contactRequestSchema.parse({ ...valid, unexpected: true })).toThrow();
```

- [ ] **Step 2: Run and verify RED**

Run: `corepack pnpm --filter @vbtech/contracts test`  
Expected: FAIL because the package does not exist.

- [ ] **Step 3: Implement strict schema and normalization**

```ts
export const contactRequestSchema = z.object({
  requestId: z.uuid(),
  locale: z.enum(["ru", "en"]),
  name: z.string().trim().min(1).max(100),
  contact: z.string().trim().min(1).max(254),
  message: z.string().trim().min(1).max(4_000),
  sourcePath: z.enum(CONTACT_SOURCE_PATHS),
  consentId: z.string().trim().min(1).max(64),
  captchaToken: z.string().trim().min(1).max(4_096),
  website: z.string().max(200),
}).strict();
```

Refine `contact` to accept only a valid lower-cased email or `@[A-Za-z0-9_]{5,32}`. Reject CR/LF header characters and unsupported Unicode controls.

- [ ] **Step 4: Run tests and commit**

Run: `corepack pnpm --filter @vbtech/contracts test && corepack pnpm --filter @vbtech/contracts typecheck`  
Expected: PASS.

```bash
git add packages/contracts pnpm-lock.yaml
git commit -m "feat: define contact request contract"
```

### Task 2: Branded email templates

**Files:**
- Create: `packages/email/package.json`
- Create: `packages/email/src/types.ts`
- Create: `packages/email/src/theme.tsx`
- Create: `packages/email/src/notification.tsx`
- Create: `packages/email/src/confirmation.tsx`
- Create: `packages/email/src/render.tsx`
- Create: `packages/email/src/index.ts`
- Create: `packages/email/test/render.test.tsx`
- Create: `packages/email/emails/*-preview.tsx`

**Interfaces:**
- Produces: `renderContactNotification(input): RenderedEmail`.
- Produces: `renderContactConfirmation(input): RenderedEmail`.
- `RenderedEmail = { subject: string; html: string; text: string }`.

- [ ] **Step 1: Write failing deterministic render tests**

```tsx
const rendered = await renderContactNotification({
  locale: "en",
  requestId: "11111111-1111-4111-8111-111111111111",
  receivedAt: new Date("2026-08-20T12:00:00Z"),
  sourcePath: "/en/",
  consentId: CURRENT_CONTACT_CONSENT_ID,
  name: '<Vlad & "team">',
  contact: "hello@example.com",
  message: "Build the product safely.",
});
expect(rendered.html).toContain("&lt;Vlad &amp; &quot;team&quot;&gt;");
expect(rendered.html).not.toMatch(/<script|https?:\/\/.*\.(png|gif|woff)/i);
expect(rendered.text).toContain("11111111-1111-4111-8111-111111111111");
```

- [ ] **Step 2: Run and verify RED**

Run: `corepack pnpm --filter @vbtech/email test`  
Expected: FAIL because templates do not exist.

- [ ] **Step 3: Implement shared email theme and notification**

Use table layout, inline CSS, graphite/light surfaces and signal amber; include no external resource. Notification includes all approved fields and exact consent ID.

- [ ] **Step 4: Implement conditional visitor confirmation**

Confirmation includes request ID, reply address and neutral next step, but does not repeat the message. Export a pure `isEmailContact` guard from contracts and never render confirmation for Telegram.

- [ ] **Step 5: Verify HTML, text and Mailpit previews**

Run: `corepack pnpm --filter @vbtech/email test && corepack pnpm --filter @vbtech/email typecheck && corepack pnpm --filter @vbtech/email build`  
Expected: PASS; snapshots contain no tracking or remote assets.

- [ ] **Step 6: Commit**

```bash
git add packages/email packages/contracts pnpm-lock.yaml
git commit -m "feat: add branded bilingual contact emails"
```

### Task 3: Isolated encrypted outbox schema

**Files:**
- Create: `apps/contact-function/migrations/0001_contact_outbox.sql`
- Create: `apps/contact-function/src/db.ts`
- Create: `apps/contact-function/src/crypto.ts`
- Create: `apps/contact-function/src/outbox-repository.ts`
- Create: `apps/contact-function/test/outbox-repository.test.ts`
- Create: `apps/contact-function/test/crypto.test.ts`

**Interfaces:**
- Produces: `encryptPayload(payload, key, context): EncryptedPayload` and `decryptPayload(...)` using AES-256-GCM.
- Produces: `OutboxRepository.accept(request): Promise<"created" | "existing">`.
- Produces: `leaseDue(limit, workerId)` and terminal-state methods.

- [ ] **Step 1: Write failing crypto and idempotency tests**

```ts
expect(decryptPayload(encryptPayload(payload, key, context), key, context)).toEqual(payload);
await expect(repository.accept(request)).resolves.toBe("created");
await expect(repository.accept(request)).resolves.toBe("existing");
await expect(repository.accept({ ...request, message: "different" })).rejects.toThrow("request_id_reused");
```

- [ ] **Step 2: Run and verify RED**

Run: `corepack pnpm --filter @vbtech/contact-function test -- crypto outbox-repository`  
Expected: FAIL because DB modules and migration are absent.

- [ ] **Step 3: Add minimal schema and transaction contract**

Migration creates `contact_requests` and `email_outbox` with UUID keys, content hash, encrypted payload columns, delivery kind, attempt count, next attempt, lease, terminal timestamps and created timestamps. It also creates `contact_rate_limits`, keyed by an HMAC of the bounded network source and fixed time window with short expiry; raw IP addresses are never stored. Unique `(public_request_id, kind)` guarantees one notification and at most one confirmation.

- [ ] **Step 4: Implement advisory-lock acceptance and AES-GCM envelope**

Use `pg_advisory_xact_lock(hashtextextended(requestId, 0))`, compare a SHA-256 normalized-content hash on repeat, and enqueue the required pair in one transaction. Bind request ID and delivery kind as authenticated encryption context.

- [ ] **Step 5: Run integration tests against disposable PostgreSQL 17**

Run: `corepack pnpm --filter @vbtech/contact-function test:db`  
Expected: PASS for concurrent duplicate, mismatched reuse, rollback, lease expiry and decrypt failure.

- [ ] **Step 6: Commit**

```bash
git add apps/contact-function/migrations apps/contact-function/src apps/contact-function/test
git commit -m "feat: add isolated encrypted contact outbox"
```

### Task 4: Submission feature gate, rate limit and SmartCaptcha

**Files:**
- Create: `apps/contact-function/src/config.ts`
- Create: `apps/contact-function/src/errors.ts`
- Create: `apps/contact-function/src/rate-limit.ts`
- Create: `apps/contact-function/src/captcha.ts`
- Create: `apps/contact-function/src/submit.ts`
- Create: `apps/contact-function/src/http-handler.ts`
- Create: `apps/contact-function/test/submit.test.ts`
- Create: `apps/contact-function/test/captcha.test.ts`
- Create: `apps/contact-function/test/http-handler.test.ts`

**Interfaces:**
- Produces: `submitContact(input, source): Promise<ContactAcceptedResponse>`.
- Produces: Yandex-compatible `httpHandler(event, context)`.
- Consumes: `CURRENT_CONTACT_CONSENT_ID`, schema, limiter, captcha and repository.
- Rate limiter consumes the PostgreSQL-backed `contact_rate_limits` repository and a distinct HMAC key from Lockbox.

- [ ] **Step 1: Write failing service-order and public-error tests**

Test disabled mode, invalid consent, honeypot, rate limit, captcha rejection/timeout, repository failure, accepted enqueue, exact method/path, wrong origin, wrong content type and oversized body. Assert that invalid requests never call later dependencies.

- [ ] **Step 2: Run and verify RED**

Run: `corepack pnpm --filter @vbtech/contact-function test -- submit captcha http-handler`  
Expected: FAIL because handlers do not exist.

- [ ] **Step 3: Implement fail-closed validation order**

```ts
if (!config.enabled) throw publicError("submission_disabled", 404);
limiter.assertAllowed(source);
if (input.website !== "") throw publicError("invalid_request", 400);
if (input.consentId !== CURRENT_CONTACT_CONSENT_ID) {
  throw publicError("consent_revision_changed", 409);
}
await captcha.assertHuman(input.captchaToken, source);
await repository.accept(input);
return { accepted: true, requestId: input.requestId };
```

- [ ] **Step 4: Implement bounded SmartCaptcha validation**

Send only token and required IP/network context to `https://captcha-api.yandex.cloud/validate`, enforce an abort timeout, reject malformed provider responses and never log token/form fields.

The rate limiter performs an atomic fixed-window increment against the HMAC source key, expires rows after the short abuse-prevention window, and fails closed when its storage is unavailable.

- [ ] **Step 5: Run focused tests and commit**

Run: `corepack pnpm --filter @vbtech/contact-function test && corepack pnpm --filter @vbtech/contact-function typecheck`  
Expected: PASS.

```bash
git add apps/contact-function packages/legal-documents
git commit -m "feat: validate and durably accept contact requests"
```

### Task 5: Scheduled Postbox delivery worker and retention

**Files:**
- Create: `apps/contact-function/src/postbox.ts`
- Create: `apps/contact-function/src/worker.ts`
- Create: `apps/contact-function/src/timer-handler.ts`
- Create: `apps/contact-function/src/telemetry.ts`
- Create: `apps/contact-function/src/retention.ts`
- Create: `apps/contact-function/test/worker.test.ts`
- Create: `apps/contact-function/test/retention.test.ts`

**Interfaces:**
- Produces: `drainOutbox({ limit, workerId }): Promise<DrainSummary>`.
- Produces: `timerHandler(event, context)`.
- Produces: `eraseTerminalPayloads(cutoff)` and bounded metadata cleanup.

- [ ] **Step 1: Write failing worker state-machine tests**

Cover success, transient provider error/backoff, terminal rejection, lost lease, Telegram notification-only, email notification+confirmation, confirmation failure after notification success, and payload erasure.

- [ ] **Step 2: Run and verify RED**

Run: `corepack pnpm --filter @vbtech/contact-function test -- worker retention`  
Expected: FAIL because delivery worker is absent.

- [ ] **Step 3: Implement Postbox adapter and bounded retry classification**

Adapter accepts only `RenderedEmail`, verified sender, exact recipient and reply-to. Treat network/5xx/429 as transient and bounded 4xx address/content errors as terminal. Record provider message ID but never response bodies containing user content.

- [ ] **Step 4: Implement leases, exponential backoff and terminal erasure**

Lease due jobs with `FOR UPDATE SKIP LOCKED`; renew no lease inside provider call; cap attempts and delay; clear encrypted subject/body immediately after terminal processing schedule while keeping minimal state.

- [ ] **Step 5: Run worker tests and commit**

Run: `corepack pnpm --filter @vbtech/contact-function test && corepack pnpm --filter @vbtech/contact-function test:db`  
Expected: PASS.

```bash
git add apps/contact-function/src apps/contact-function/test
git commit -m "feat: deliver contact emails through durable outbox"
```

### Task 6: Enable progressive Astro form integration

**Files:**
- Modify: `apps/web/src/components/ContactForm.astro`
- Modify: `apps/web/src/scripts/contact-form.ts`
- Create: `apps/web/src/lib/contact-client.ts`
- Create: `apps/web/test/contact-client.test.ts`
- Modify: `tools/browser/tests/site.spec.ts`
- Create: `tools/browser/tests/contact.spec.ts`

**Interfaces:**
- Consumes: shared contact schema/errors and `CURRENT_CONTACT_CONSENT_ID`.
- Produces: `submitContactDraft(draft, dependencies)` with retry-safe request ID.

- [ ] **Step 1: Write failing browser/client tests**

Test required unchecked consent, local field errors, UUID reuse on safe retry, new UUID after accepted response, consent conflict refresh state, disabled mode, captcha failure, rate limit, success reset and preserved input on recoverable errors.

- [ ] **Step 2: Run and verify RED**

Run: `corepack pnpm --filter @vbtech/web test -- contact-client && corepack pnpm --dir tools/browser test -- contact.spec.ts`  
Expected: FAIL because the production client is absent.

- [ ] **Step 3: Implement progressive submission state machine**

Create request ID with `crypto.randomUUID`, load SmartCaptcha only when enabled, submit exact JSON, map stable public errors to RU/EN copy, focus the first invalid field and announce status through `aria-live`.

- [ ] **Step 4: Prove consent parity in generated HTML and function build**

Add a test importing both packages and asserting generated `data-consent-id`, function validator and both email templates use the same `CURRENT_CONTACT_CONSENT_ID`.

- [ ] **Step 5: Run complete pipeline gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build && corepack pnpm --dir tools/browser test`  
Expected: PASS with mocked provider integration and enabled/disabled browser projects.

- [ ] **Step 6: Commit**

```bash
git add apps/web apps/contact-function packages tools/browser
git commit -m "feat: connect privacy-gated contact workflow"
```

### Task 7: Mailpit and end-to-end operational proof

**Files:**
- Create: `deploy/local/compose.yml`
- Create: `apps/contact-function/test/contact-pipeline.e2e.test.ts`
- Create: `docs/runbooks/contact-delivery.md`
- Create: `docs/reviews/contact-pipeline-local-acceptance.md`

**Interfaces:**
- Produces: local PostgreSQL 17 + Mailpit verification contour.
- Produces: reproducible evidence for one RU email request and one EN Telegram request.

- [ ] **Step 1: Write the skipped-unless-configured end-to-end test**

The test submits a unique UUID, polls outbox state, queries Mailpit, asserts one internal notification plus conditional confirmation, verifies consent ID and then proves the same UUID does not duplicate delivery.

- [ ] **Step 2: Start isolated local dependencies**

Run: `docker compose -f deploy/local/compose.yml up -d --wait`  
Expected: PostgreSQL and Mailpit healthy on loopback-only ports.

- [ ] **Step 3: Run the real local pipeline**

Run: `VBTECH_E2E=1 corepack pnpm --filter @vbtech/contact-function test:e2e`  
Expected: PASS for RU email and EN Telegram cases; no user payload appears in logs.

- [ ] **Step 4: Render and inspect both branded emails**

Capture Mailpit previews at desktop and mobile widths, verify HTML/plain-text parts, dark/light client rendering, links, request IDs and absence of remote requests.

- [ ] **Step 5: Record acceptance and stop local dependencies**

Run: `docker compose -f deploy/local/compose.yml down`  
Expected: containers stopped; volumes retained only if the runbook explicitly requests investigation.

- [ ] **Step 6: Commit**

```bash
git add deploy/local apps/contact-function/test docs/runbooks docs/reviews
git commit -m "test: verify contact delivery pipeline end to end"
```

## Plan completion checkpoint

The contact phase is complete when enabled and disabled form modes pass, accepted requests survive provider failure without duplicate mail, branded emails are reviewed, terminal payload erasure is proven, and no live Yandex resource has been mutated.

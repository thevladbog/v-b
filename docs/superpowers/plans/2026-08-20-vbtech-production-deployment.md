# v-b.tech Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package and stage v-b.tech on the existing Yandex Cloud production contour without a new VM, integrate exact host routing into the Markiro edge, prepare isolated cloud/database resources, and produce a safe external DNS handoff.

**Architecture:** The v-b repository publishes a read-only static container and versioned Cloud Function artifact. The existing Markiro Caddy remains the sole 80/443 edge and routes the exact v-b.tech authority to the internal container and exact contact POST to the function. A separate database/user, Lockbox secrets and service account share existing managed resources without sharing application privileges.

**Tech Stack:** Docker, Caddy 2.11.4, Yandex Cloud Functions, Lockbox, Postbox, SmartCaptcha, managed PostgreSQL 17, Terraform matching the Markiro production lockfile, Node.js 24+, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-08-20-vbtech-production-site-design.md`

## Global Constraints

- No new virtual machine.
- No DNS, production deploy, public exposure, GitHub publication, secret creation or database mutation without separate explicit approval.
- Markiro production remains available and independently releasable.
- v-b.tech web, function, secrets, DB/user and release identity are isolated.
- The form deploys disabled and is enabled only after legal, DNS/TLS, provider and delivery smoke gates.
- Exact route is `POST /api/contact`; every other v-b `/api` request is rejected.
- External DNS is inventoried before a record sheet is written; existing MX/SPF/DKIM/DMARC records are preserved.
- Rollback disables the form first and keeps legal pages/direct contacts available.
- Every task follows RED → GREEN → REFACTOR and ends in a focused commit.

---

### Task 1: Static runtime image and release identity

**Files:**
- Create: `deploy/container/web.Dockerfile`
- Create: `deploy/container/Caddyfile`
- Create: `deploy/container/entrypoint.sh`
- Create: `deploy/container/healthcheck.mjs`
- Create: `deploy/container/test/image-contract.test.mjs`
- Create: `.dockerignore`
- Modify: `apps/web/src/layouts/BaseLayout.astro`

**Interfaces:**
- Produces: `ghcr.io/thevladbog/vbtech-web:<git-sha>` after separately approved publication.
- Produces: response header `x-vbtech-release-sha`.
- Container listens only on unprivileged internal port 8080.

- [ ] **Step 1: Write failing Dockerfile contract tests**

```js
assert.match(dockerfile, /FROM caddy:2\.11\.4-alpine AS runtime/);
assert.match(dockerfile, /COPY --from=web-build .*\/dist \/srv\/vbtech/);
assert.doesNotMatch(dockerfile, /USER root\s*$/m);
assert.match(caddyfile, /root \* \/srv\/vbtech/);
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test deploy/container/test/image-contract.test.mjs`  
Expected: FAIL because container files do not exist.

- [ ] **Step 3: Implement deterministic multi-stage build**

Build with the pinned lockfile, `--frozen-lockfile`, static Astro output and build arg `VBTECH_RELEASE_SHA`. Runtime is read-only, non-root, health-checked and contains no source, package manager, secret or function artifact.

- [ ] **Step 4: Build and inspect locally**

Run: `docker build -f deploy/container/web.Dockerfile --build-arg VBTECH_RELEASE_SHA=$(git rev-parse HEAD) -t vbtech-web:local .`  
Expected: build succeeds and image history contains no environment secret.

- [ ] **Step 5: Run image contract and smoke**

Run: `node --test deploy/container/test/image-contract.test.mjs && docker run --rm --read-only --cap-drop ALL -p 127.0.0.1:18080:8080 vbtech-web:local`  
Expected: root/legal routes return 200, unknown route returns branded 404, headers contain exact local SHA.

- [ ] **Step 6: Commit**

```bash
git add deploy/container .dockerignore apps/web/src/layouts/BaseLayout.astro
git commit -m "build: package static v-b.tech runtime"
```

### Task 2: v-b deployment contract in this repository

**Files:**
- Create: `deploy/production/release-manifest.mjs`
- Create: `deploy/production/preflight.mjs`
- Create: `deploy/production/smoke.mjs`
- Create: `deploy/production/test/preflight.test.mjs`
- Create: `deploy/production/test/smoke.test.mjs`
- Create: `.env.example`

**Interfaces:**
- Produces: validated inputs `VBTECH_IMAGE_TAG`, `VBTECH_DOMAIN`, `VBTECH_WWW_DOMAIN`, function URL/audience and submission state.
- Produces: private and public smoke modes.

- [ ] **Step 1: Write failing preflight tests**

Cover missing tag, mutable `latest`, malformed domains, domain collision with Markiro authorities, HTTP function URL, enabled form without exact consent release, and unknown submission state.

- [ ] **Step 2: Run and verify RED**

Run: `node --test deploy/production/test/*.test.mjs`  
Expected: FAIL because preflight/smoke modules do not exist.

- [ ] **Step 3: Implement strict environment parsing and manifest**

Accept only lowercase FQDNs `v-b.tech` and `www.v-b.tech`, immutable SHA image tags, HTTPS function origins and explicit `disabled|enabled`. Never print secret values.

- [ ] **Step 4: Implement route-table smoke**

Smoke checks root, EN, legal routes, 404, sitemap/robots/llms, exact release header, CSP, theme bootstrap, disabled/enabled form signature and exact API rejection surface.

- [ ] **Step 5: Run focused tests and commit**

Run: `node --test deploy/production/test/*.test.mjs`  
Expected: PASS without network.

```bash
git add deploy/production .env.example
git commit -m "build: add v-b.tech release and smoke contracts"
```

### Task 3: Existing Markiro edge integration in the Markiro repository

**Files in `/Users/thevladbog/PRSOME/q`:**
- Modify: `deploy/production/Caddyfile`
- Modify: `deploy/production/compose-files.mjs`
- Modify: `deploy/production/deploy.mjs`
- Modify: `deploy/production/release-manifest.mjs`
- Modify: `deploy/production/preflight.mjs`
- Modify: `deploy/production/production-domain.mjs`
- Modify: `deploy/production/smoke.mjs`
- Modify: `deploy/production/test/edge-contract.test.mjs`
- Modify: `deploy/production/test/compose-contract.test.mjs`
- Modify: `deploy/production/test/smoke-route-table.test.mjs`

**Interfaces:**
- Consumes: immutable v-b web image and exact internal service name `vbtech-web`.
- Produces: isolated Caddy authorities for `v-b.tech` and `www.v-b.tech`.
- Produces: exact proxy for `POST /api/contact` and plain 404 for every alternate API surface.

- [ ] **Step 1: Create an isolated Markiro worktree using `superpowers:using-git-worktrees`**

Do not edit the user's active Markiro checkout. Record current status, branch, remote and existing production changes before creating the worktree.

- [ ] **Step 2: Extend edge contract tests before Caddy changes**

Assert exact approved host set, v-b root target, www redirect, no host overlap, no Markiro route exposure, exact method/path proxy, body limit, v-b CSP and independent image tag.

- [ ] **Step 3: Run and verify RED**

Run: `corepack pnpm test:production-bundle:contract`  
Expected: focused failures because v-b authorities and service are absent; unrelated baseline tests remain green.

- [ ] **Step 4: Implement minimal host/service integration**

Add one internal `vbtech-web` service without host ports. Add Caddy host blocks and function upstream configuration without copying v-b assets into the Markiro edge image. Preserve existing admin, kiosk and landing snippets unchanged except shared approved header helpers.

- [ ] **Step 5: Run Markiro production gates**

Run: `corepack pnpm test:production-bundle:contract && corepack pnpm test:yandex-infra:contract`  
Expected: PASS; adapted Caddy contains all previous authorities plus exact v-b authorities.

- [ ] **Step 6: Commit only in the isolated Markiro worktree**

```bash
git add deploy/production infra/yandex
git commit -m "feat(production): route isolated v-b.tech service"
```

Do not push, merge or deploy without explicit approval.

### Task 4: Isolated Yandex resources and database bootstrap

**Files:**
- Create: `deploy/yandex/function.tf`
- Create: `deploy/yandex/iam.tf`
- Create: `deploy/yandex/lockbox.tf`
- Create: `deploy/yandex/scheduler.tf`
- Create: `deploy/yandex/variables.tf`
- Create: `deploy/yandex/outputs.tf`
- Create: `deploy/yandex/test/infra-contract.test.mjs`
- Create: `deploy/yandex/scripts/bootstrap-database.mjs`
- Create: `deploy/yandex/scripts/verify-permissions.mjs`

**Interfaces:**
- Produces: separate service account, HTTP function, timer trigger, Lockbox secret references and least-privilege DB bootstrap inputs.
- Consumes: existing VPC/subnet, managed PostgreSQL host/CA and Postbox/SmartCaptcha resources by approved identifiers.

- [ ] **Step 1: Write failing infrastructure contract tests**

Assert no compute instance resource, no public database, separate service account, explicit network, exact function memory/timeout floors, timer trigger, Lockbox references, disabled default and no secret output.

- [ ] **Step 2: Run and verify RED**

Run: `node --test deploy/yandex/test/*.test.mjs`  
Expected: FAIL because resource definitions are absent.

- [ ] **Step 3: Implement read-only-variable infrastructure definitions**

Reference existing network/cluster identifiers supplied through reviewed inputs. Do not create a VM or PostgreSQL cluster. Function runtime receives secret IDs, never secret values.

- [ ] **Step 4: Implement bounded database bootstrap**

Script creates only the approved database, role grants and migrations after confirming target cluster identity. It refuses localhost/unknown cluster, prints object names but not passwords, and supports a read-only `--check` mode used before mutation.

- [ ] **Step 5: Validate offline and plan-only**

Run: `terraform -chdir=deploy/yandex fmt -check && terraform -chdir=deploy/yandex validate && node --test deploy/yandex/test/*.test.mjs && node deploy/yandex/scripts/bootstrap-database.mjs --check`  
Expected: PASS without creating resources.

- [ ] **Step 6: Commit**

```bash
git add deploy/yandex
git commit -m "infra: define isolated v-b.tech serverless resources"
```

### Task 5: CI build and release gates

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/publish.yml`
- Create: `.github/workflows/deploy.yml`
- Create: `deploy/production/test/workflow-contract.test.mjs`
- Modify: `package.json`

**Interfaces:**
- CI runs all static, function, DB-contract, browser and image-contract gates.
- Publish produces immutable web image/function bundle and provenance manifest.
- Deploy is manual, protected and defaults to submission disabled.

- [ ] **Step 1: Write failing workflow contract tests**

Assert pinned action SHAs, least permissions, no pull-request secrets, immutable release SHA, artifact digest verification, protected manual deploy, concurrency control and disabled form default.

- [ ] **Step 2: Run and verify RED**

Run: `node --test deploy/production/test/workflow-contract.test.mjs`  
Expected: FAIL because workflows do not exist.

- [ ] **Step 3: Implement CI and artifact publication workflows**

CI uses Corepack with the committed lockfile. Publish signs/attests image and function archive, records digests and performs no deployment. No GitHub repository, package, image or workflow run is created until the user separately approves GitHub publication.

- [ ] **Step 4: Implement protected staged deployment workflow**

Deploy requires environment approval, verifies exact digests, runs preflight and inventory, deploys disabled, performs private smoke and stops before DNS/form activation unless the approved inputs explicitly authorize those gates.

- [ ] **Step 5: Run workflow contracts and commit**

Run: `node --test deploy/production/test/*.test.mjs`  
Expected: PASS.

```bash
git add .github package.json deploy/production/test
git commit -m "ci: add gated v-b.tech release workflows"
```

### Task 6: External DNS and mail-authentication handoff

**Files:**
- Create: `deploy/dns/record-schema.ts`
- Create: `deploy/dns/build-handoff.ts`
- Create: `deploy/dns/test/build-handoff.test.ts`
- Create: `docs/runbooks/external-dns.md`
- Create at approved release time: `docs/reviews/YYYY-MM-DD-vbtech-dns-handoff.md`

**Interfaces:**
- Consumes: read-only current DNS export, approved edge IP inventory and exact Postbox verification output.
- Produces: a dated table with name/type/value/TTL/purpose/current value/action/verification/rollback.

- [ ] **Step 1: Write failing merge-safety tests**

Test apex A, optional AAAA, www CNAME, Postbox verification, DKIM, custom MAIL FROM, single merged SPF, preserved MX, preserved unrelated TXT, reviewed DMARC and rejection of two SPF records.

- [ ] **Step 2: Run and verify RED**

Run: `corepack pnpm exec vitest run deploy/dns/test/build-handoff.test.ts`  
Expected: FAIL because handoff builder does not exist.

- [ ] **Step 3: Implement deterministic handoff builder**

The builder never calls a DNS mutation API. It refuses missing current-zone input, unresolved edge IP, duplicate owner/type conflicts, unverified provider values and destructive record replacement without an explicit merge rule.

- [ ] **Step 4: Document exact operator procedure**

Runbook covers exporting the current zone, generating the record sheet, applying records at the external provider, short migration TTL, propagation checks, Caddy TLS verification, restoring normal TTL and rollback. It states that exact values are release-time evidence, not invented examples.

- [ ] **Step 5: Run tests and commit**

Run: `corepack pnpm exec vitest run deploy/dns/test/build-handoff.test.ts`  
Expected: PASS.

```bash
git add deploy/dns docs/runbooks/external-dns.md
git commit -m "docs: add safe external DNS handoff generator"
```

### Task 7: Publication, retention and rollback runbooks

**Files:**
- Create: `docs/runbooks/publication.md`
- Create: `docs/runbooks/form-activation.md`
- Create: `docs/runbooks/data-retention.md`
- Create: `docs/runbooks/rollback.md`
- Create: `deploy/production/test/runbook-contract.test.mjs`

**Interfaces:**
- Produces: ordered gates with explicit read-only inventory, mutation approval, verification and recovery.
- Produces: monthly terminal-payload/mailbox retention evidence procedure.

- [ ] **Step 1: Write failing runbook-order tests**

Assert legal approval before form activation, runtime/DNS inventory before mutation, disabled deploy before DNS, private smoke before public smoke, form disable as first rollback action, and one-year mailbox review.

- [ ] **Step 2: Run and verify RED**

Run: `node --test deploy/production/test/runbook-contract.test.mjs`  
Expected: FAIL because runbooks are absent.

- [ ] **Step 3: Write exact command-oriented runbooks**

Every command names the target domain/resource, states whether it is read-only or mutating, records expected output and gives a bounded failure branch. No command exposes secret values or request payloads.

- [ ] **Step 4: Run contracts and conduct tabletop rollback**

Run: `node --test deploy/production/test/runbook-contract.test.mjs`  
Expected: PASS; tabletop walk proves form can be disabled without removing legal pages.

- [ ] **Step 5: Commit**

```bash
git add docs/runbooks deploy/production/test/runbook-contract.test.mjs
git commit -m "docs: define v-b.tech publication and rollback"
```

### Task 8: Private staging and production approval gates

**Files:**
- Create after approved execution: `docs/reviews/YYYY-MM-DD-vbtech-private-acceptance.md`
- Create after approved DNS execution: `docs/reviews/YYYY-MM-DD-vbtech-publication.md`

**Interfaces:**
- Produces: evidence with release SHA/image digest/function digest, routes, headers, delivery IDs and explicit unrun gates.

- [ ] **Step 1: Request explicit approval for cloud/database/private deployment mutations**

Do not bundle this approval with DNS, public exposure or form activation.

- [ ] **Step 2: Inventory exact existing resources read-only**

Verify VM capacity, Docker network, Caddy authorities, managed PostgreSQL identity/capacity, VPC, service accounts, Lockbox, Postbox sender, SmartCaptcha and current deployment SHA.

- [ ] **Step 3: Deploy disabled and smoke privately**

Deploy immutable artifacts, bootstrap isolated DB, verify internal host routing and run all routes with form disabled. Record actual CPU/memory/disk delta to prove no VM resize is needed.

- [ ] **Step 4: Request separate approval for external DNS changes**

Provide the generated exact record table in the approval request.

- [ ] **Step 5: Apply approved DNS and verify public read-only site**

Verify authoritative answers, TLS chain, canonical host redirect, release header, legal pages, 404, CSP and no form acceptance.

- [ ] **Step 6: Request separate approval to enable the public form**

Attach owner/legal approval, provider inventory, private delivery proof and rollback command.

- [ ] **Step 7: Enable and execute one controlled smoke request**

Use non-sensitive test data, verify durable acceptance, internal branded email, conditional confirmation, idempotent repeat, telemetry privacy and cleanup scheduling.

- [ ] **Step 8: Record final acceptance or roll back**

If any required gate fails, disable form first and follow the bounded rollback runbook. Report physical email-client/mobile acceptance separately from automated proof.

## Plan completion checkpoint

The deployment phase is complete only after approved live actions are independently verified. Until those approvals occur, a green local/CI/private result must be reported as staged, not published.

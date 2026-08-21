# v-b.tech Infrastructure Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the PR #5 security and correctness blockers while preserving an apply-free, no-new-VM deployment design.

**Architecture:** Terraform must enforce least privilege and fail closed before resource mutation. Yandex Cloud control-plane provisioning creates the dedicated managed database and user without placing credentials in Terraform state; PostgreSQL operational scripts then connect only as that owner through one strict TLS client boundary, prove protected-database denial before migration, and treat any unverified permission query as failure. Public HTTP invocation remains disabled until a separate abuse-control activation gate is approved.

**Tech Stack:** Terraform 1.15.8, Yandex provider 0.215.0, Node.js 24, pg 8.22.0, node:test, Yandex Managed PostgreSQL 15-18 (production target 17)

**Spec:** `docs/superpowers/specs/2026-08-20-vbtech-production-site-design.md` and Task 4 of `docs/superpowers/plans/2026-08-20-vbtech-production-deployment.md`

## Global Constraints

- Do not run Terraform plan/apply or mutate Yandex Cloud, PostgreSQL, Lockbox, DNS, or production.
- Do not create a VM, PostgreSQL cluster, subnet, WAF, or other paid resource.
- Keep contact submission and public invocation disabled by default.
- Never place secret values or real connection strings in source, test output, Terraform state, or PR comments.
- Require exact managed PostgreSQL host, cluster identity, CA file, pre-provisioned contact owner/database, and protected database before an approved apply.
- Preserve the pinned Terraform and provider versions.

---

### Task 1: Terraform fail-closed and least-privilege contracts

**Files:**
- Modify: `deploy/yandex/test/infra-contract.test.mjs`
- Modify: `deploy/yandex/iam.tf`
- Modify: `deploy/yandex/network.tf`
- Modify: `deploy/yandex/variables.tf`
- Modify: `deploy/yandex/function.tf`
- Modify: `deploy/yandex/scheduler.tf`

**Interfaces:**
- Consumes: pinned provider schema for `yandex_function_trigger` and Terraform 1.15 cross-variable validation.
- Produces: function-scoped worker invocation; exact three-zone inventory; enforced subnet identity; immutable artifact identity; disabled-by-default public invocation.

- [ ] **Step 1: Write failing source-contract assertions**

Assert that the worker invoker is a `yandex_function_iam_binding`, no folder-wide invoker exists, network guarantees use variable validation plus data-source postconditions, artifact identity is a blocking variable validation, retry values are strings, trigger labels are present, and public invocation requires both endpoint activation and abuse-control approval.

- [ ] **Step 2: Run the contract test and confirm RED**

Run: `node --test deploy/yandex/test/infra-contract.test.mjs`

Expected: failures identify the current folder-level role, warning-only `check` blocks, numeric retry values, missing labels, and unconditional public binding.

- [ ] **Step 3: Implement the minimal Terraform changes**

Use `yandex_function_iam_binding.contact_worker_invoker`; add exact-key validation to `serverless_subnet_ids`; add a `lifecycle.postcondition` to each subnet data instance; move artifact equality to variable validation; add disabled-by-default `public_endpoint_enabled` and `public_endpoint_abuse_controls_approved`; gate `contact_http_public_invoker` with `count`; set trigger labels and string retry values.

- [ ] **Step 4: Format and confirm GREEN**

Run: `terraform -chdir=deploy/yandex fmt`

Run: `node --test deploy/yandex/test/infra-contract.test.mjs`

Expected: all infrastructure contracts pass.

---

### Task 2: Strict PostgreSQL TLS and root dependency

**Files:**
- Create: `deploy/yandex/scripts/postgres-client.mjs`
- Modify: `deploy/yandex/scripts/bootstrap-database.mjs`
- Modify: `deploy/yandex/scripts/verify-permissions.mjs`
- Modify: `deploy/yandex/test/infra-contract.test.mjs`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `VBTECH_POSTGRES_CA_FILE`, validated `postgresql:` URL containing `sslmode=verify-full`, root dependency `pg@8.22.0`.
- Produces: `postgresClientConfig(url, ca)`, `openPostgresClient(url, caFile)`, and `withPostgresClient(url, caFile, operation)` with strict CA verification and bounded connection/query/statement timeouts.

- [ ] **Step 1: Write failing TLS and dependency tests**

Assert that partial target configuration cannot select offline mode; CA file is required; client configuration removes the URL `sslmode` before passing an explicit `ssl` object; `rejectUnauthorized` is true; timeouts are finite; root `package.json` declares exact `pg@8.22.0`; and reserved password characters remain correctly encoded by the URL setter.

- [ ] **Step 2: Run the contract test and confirm RED**

Run: `node --test deploy/yandex/test/infra-contract.test.mjs`

Expected: failures identify missing CA/client boundary, missing root dependency, and silent partial-environment fallback.

- [ ] **Step 3: Implement the shared client boundary and target parsing**

Read and validate a PEM CA from the explicit path, construct the pg client with `ssl.ca`, `rejectUnauthorized: true`, `connectionTimeoutMillis`, `statement_timeout`, and `query_timeout`, and expose explicit target-variable detection. Do not load `pg` during offline checks.

- [ ] **Step 4: Add the root runtime dependency and confirm GREEN**

Add exact `pg@8.22.0` to the root package and lock importer, install offline from the existing pnpm store, then rerun the contract test.

Expected: all TLS/dependency contracts pass and `import("pg")` resolves from the operational scripts.

---

### Task 3: Managed-service-compatible bootstrap and protected-database boundary

**Files:**
- Create: `deploy/yandex/README.md`
- Modify: `deploy/yandex/scripts/bootstrap-database.mjs`
- Modify: `deploy/yandex/test/infra-contract.test.mjs`

**Interfaces:**
- Consumes: control-plane-provisioned `vbtech_contact` owner/database, application connection URL, exact cluster identity, and protected database name.
- Produces: supported Yandex Cloud provisioning runbook, pre-migration protected-database denial, exact role/schema ownership inspection, and an application-only migration transaction.

- [ ] **Step 1: Write failing bootstrap tests**

Assert that SQL never connects to `postgres` or issues `CREATE ROLE`, `ALTER ROLE`, or `CREATE DATABASE`; the contact connection targets the exact pre-provisioned owner/database; PostgreSQL 14 fails closed; superuser, replication, `BYPASSRLS`, and unexpected memberships fail closed; protected connection denial occurs before schema work; exact `public` schema ownership is established before migration; and the required migration read fails if the file is absent or empty.

- [ ] **Step 2: Run the contract test and confirm RED**

Run: `node --test deploy/yandex/test/infra-contract.test.mjs`

Expected: bootstrap-specific assertions reproduce the unsupported Managed PostgreSQL operations and isolation gap.

- [ ] **Step 3: Implement the supported managed-service sequence**

Document console-based creation of `vbtech_contact` and its database with a generated password and contact-only permission list. Connect only as the pre-provisioned application owner, prove exact database identity, PostgreSQL 15+, strict role flags and zero memberships, prove protected-database connection denial before any mutation, assign `public` schema ownership exactly to the application role, and then migrate inside the existing transaction. Reinspect ownership and isolation after migration.

- [ ] **Step 4: Confirm GREEN**

Run: `node --test deploy/yandex/test/infra-contract.test.mjs`

Expected: bootstrap contracts pass without connecting to a live database; a separate live Managed PostgreSQL acceptance gate remains required before deployment.

---

### Task 4: Permission verification cannot false-pass

**Files:**
- Modify: `deploy/yandex/scripts/verify-permissions.mjs`
- Modify: `deploy/yandex/test/infra-contract.test.mjs`

**Interfaces:**
- Consumes: injectable `openClient` for offline adapter tests and the strict shared PostgreSQL client boundary in production.
- Produces: real `pg_namespace.nspowner` ownership proof, explicit protected connection state, and query-error propagation.

- [ ] **Step 1: Write failing adapter tests**

Assert that schema ownership queries `pg_namespace`; a protected connection denied with `42501` reports `connected: false`; a connected protected database fails verification even with empty relation lists; and `42501` from either inspection query propagates rather than becoming a success.

- [ ] **Step 2: Run the contract test and confirm RED**

Run: `node --test deploy/yandex/test/infra-contract.test.mjs`

Expected: failures reproduce the current false-pass paths.

- [ ] **Step 3: Separate connection errors from query errors**

Catch `42501` only around `openClient`, always close a connected client in `finally`, query the actual `public` namespace owner, and require `connected: false` for protected-database isolation.

- [ ] **Step 4: Confirm GREEN**

Run: `node --test deploy/yandex/test/infra-contract.test.mjs`

Expected: permission-verifier contracts pass with no live database.

---

### Task 5: Repository and security-scanner safeguards

**Files:**
- Modify: `deploy/yandex/.gitignore`
- Modify: `deploy/yandex/.terraform.lock.hcl`
- Modify: `deploy/yandex/test/infra-contract.test.mjs`

**Interfaces:**
- Consumes: official v0.215.0 release checksum manifest.
- Produces: narrow local-artifact ignores, platform `zh:` archive hashes, and scanner-safe synthetic PostgreSQL fixtures assembled from URL components.

- [ ] **Step 1: Write failing safeguards tests**

Assert ignored state/tfvars/crash artifacts, retained lockfile, required `zh:` values for darwin arm64/linux amd64/linux arm64, strict migration loading, and absence of credential-shaped PostgreSQL URL literals.

- [ ] **Step 2: Run the contract test and confirm RED**

Run: `node --test deploy/yandex/test/infra-contract.test.mjs`

Expected: repository/scanner safeguard assertions fail.

- [ ] **Step 3: Implement narrow safeguards**

Expand only `deploy/yandex/.gitignore`; add verified archive hashes from the official pinned release; replace full credential-shaped fixtures with a shared URL builder; keep secret-redaction assertions using the generated fixture value.

- [ ] **Step 4: Confirm GREEN and scan the diff**

Run: `node --test deploy/yandex/test/infra-contract.test.mjs`

Run: `rg -n 'postgres(?:ql)?://[^/[:space:]]+:[^/@[:space:]]+@' deploy/yandex`

Expected: tests pass and the scanner-pattern search has no matches.

---

### Task 6: Full verification and PR review closure

**Files:**
- Modify: PR #5 review threads and branch only after local verification.

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: one review-remediation commit, updated draft PR, rerun external checks, and technically specific thread replies.

- [ ] **Step 1: Run complete local verification**

Run: `terraform -chdir=deploy/yandex fmt -check`

Run: `terraform -chdir=deploy/yandex validate`

Run: `node --check deploy/yandex/scripts/postgres-client.mjs`

Run: `node --check deploy/yandex/scripts/bootstrap-database.mjs`

Run: `node --check deploy/yandex/scripts/verify-permissions.mjs`

Run: `node --test deploy/yandex/test/infra-contract.test.mjs`

Run: `corepack pnpm turbo run lint typecheck build`

Run: `corepack pnpm test`

Run: `git diff --check`

Expected: all commands exit zero; intentional browser skips remain reported separately.

- [ ] **Step 2: Review exact diff and commit**

Stage only the files in this plan and commit with `fix: harden isolated yandex resource contracts`.

- [ ] **Step 3: Push and recheck PR #5**

Push the existing branch, inspect the new check rollup, and do not trigger deployment workflows.

- [ ] **Step 4: Reply in each review thread**

Resolve implemented findings with the exact fix and verification. For the password-character suggestion, explain that WHATWG URL credential setters perform percent encoding and cite the regression test. For WAF/alerting, record the disabled public binding plus explicit abuse-control activation gate; no paid edge resource is added in this PR.

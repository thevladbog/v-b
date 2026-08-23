# v-b.tech production rollback runbook

## Safety boundary

Rollback is ordered to stop new personal-data intake while preserving required information and a non-form contact path. The first production mutation is always deployment of the pre-approved disabled web artifact. Legal pages and direct email/Telegram contacts remain available throughout. Do not make DNS the first response to a form incident.

Do not invent live resource IDs. Use named release-time evidence placeholders for the incident approval, active and disabled release manifests, exact image/function digests, runtime targets, prior versions, and provider audit records. Missing recovery evidence fails closed. Never capture credentials, secret values, visitor content, mailbox content, or provider response bodies.

Use only the protected Markiro `Deploy v-b.tech web` workflow for the web rollback and `deploy/production/activate.mjs` for the exact reviewed function targets. A GitHub deployment handoff with `remoteMutation: false` is evidence input, not proof that rollback occurred.

## Trigger and incident envelope

Open an incident record before mutation unless immediate containment policy already authorizes action 1. Record UTC start, trigger, operator/approver, maximum scope, active `<release-sha>-enabled` tag/digest, disabled `<release-sha>-disabled` recovery tag/digest, runtime and DNS inventory evidence IDs, accepted-job handling decision, and the rollback window. Evidence contains bounded states and IDs only.

The disabled recovery artifact must already be immutable and verified. Its manifest must say `submissionState: disabled` and `VBT-PD-02/2026.08/01`; its web artifact must contain nine HTML files and zero JS/MJS request runtime. It must preserve RU/EN legal pages, email, and Telegram direct contacts.

### Command: Validate the pre-approved disabled recovery handoff

- Target/resource: local copy of the exact disabled release manifest and function archive selected by incident evidence
- Classification: **READ-ONLY**
- Expected output: manifest validation exits zero for the exact release SHA, publish run, archive name, and archive checksum
- Bounded failure branch: stop before mutation, retain the validation error, and select no substitute or newly rebuilt recovery artifact

```bash
set -euo pipefail
: "${VBTECH_DISABLED_RELEASE_SHA_EVIDENCE:?set from the incident recovery record}"
: "${VBTECH_DISABLED_PUBLISH_RUN_ID_EVIDENCE:?set from the immutable publication record}"
: "${VBTECH_DISABLED_RELEASE_DIR_EVIDENCE:?set to the private downloaded handoff directory}"
[[ "$VBTECH_DISABLED_RELEASE_SHA_EVIDENCE" =~ ^[0-9a-f]{40}$ ]]
[[ "$VBTECH_DISABLED_PUBLISH_RUN_ID_EVIDENCE" =~ ^[1-9][0-9]{0,19}$ ]]
node deploy/production/release-artifact.mjs validate "$VBTECH_DISABLED_RELEASE_DIR_EVIDENCE/release-manifest.json" "$VBTECH_DISABLED_RELEASE_SHA_EVIDENCE" "$VBTECH_DISABLED_PUBLISH_RUN_ID_EVIDENCE" "$VBTECH_DISABLED_RELEASE_DIR_EVIDENCE/vbtech-contact-function.zip" >/dev/null
```

## Ordered rollback actions

### 1. Disable the public form

Deploy the exact pre-approved disabled web image through the reviewed web executor, without changing DNS or removing routes. This is the first production mutation. Capture old/new image digests, release headers, executor audit ID, and completion time. Do not rebuild at the server.

Immediately verify that `/` and `/en/` report submission disabled, the contact client is absent, `/api/contact` is rejected through the edge, and all nine HTML routes remain available. The 17-check route smoke does not inspect legal identities or direct-contact links; the next independent card proves those preserved surfaces. If deployment fails, retry only within the incident's exact target/window; otherwise stop and escalate to the approved edge recovery path. Do not proceed by deleting legal pages or DNS records.

### Command: Verify public containment on the disabled web release

- Target/resource: canonical TLS origin `https://v-b.tech` after disabled web artifact deployment
- Classification: **READ-ONLY**
- Expected output: one bounded JSON summary with 17 checks and no failures for the exact disabled recovery release
- Bounded failure branch: stop further rollback changes, retain route/status/release metadata, and recover the edge using the approved prior container state

```bash
set -euo pipefail
: "${VBTECH_DISABLED_RELEASE_SHA_EVIDENCE:?set from the incident recovery record}"
[[ "$VBTECH_DISABLED_RELEASE_SHA_EVIDENCE" =~ ^[0-9a-f]{40}$ ]]
export VBTECH_DISABLED_RELEASE_SHA_EVIDENCE
node --input-type=module -e 'import { runSmoke } from "./deploy/production/smoke.mjs"; const result = await runSmoke({ baseUrl: "https://v-b.tech", mode: "public", expected: { releaseSha: process.env.VBTECH_DISABLED_RELEASE_SHA_EVIDENCE, submissionState: "disabled", consentId: "VBT-PD-02/2026.08/01" } }); process.stdout.write(`${JSON.stringify(result)}\n`);'
```

### Command: Verify preserved legal releases and direct contacts

- Target/resource: six exact canonical HTTPS routes after containment: RU/EN landings, policy pages, and consent pages on `https://v-b.tech`
- Classification: **READ-ONLY**
- Expected output: bounded local parsing validates four exact ACTIVE legal identities and both direct contact links, then emits one JSON object whose only key is an ordered six-entry `responses` array of file names and SHA-256 hashes
- Bounded failure branch: stop further rollback changes, remove temporary HTML, retain only failed route/marker metadata, and restore the prior disabled web image if available

```bash
set -euo pipefail
evidence_dir="$(mktemp -d)"
trap 'rm -rf "$evidence_dir"' EXIT
curl --fail --silent --show-error --max-time 10 --max-filesize 262144 "https://v-b.tech/" --output "$evidence_dir/ru-home.html"
curl --fail --silent --show-error --max-time 10 --max-filesize 262144 "https://v-b.tech/en/" --output "$evidence_dir/en-home.html"
curl --fail --silent --show-error --max-time 10 --max-filesize 262144 "https://v-b.tech/privacy/" --output "$evidence_dir/ru-policy.html"
curl --fail --silent --show-error --max-time 10 --max-filesize 262144 "https://v-b.tech/en/privacy/" --output "$evidence_dir/en-policy.html"
curl --fail --silent --show-error --max-time 10 --max-filesize 262144 "https://v-b.tech/personal-data-consent/" --output "$evidence_dir/ru-consent.html"
curl --fail --silent --show-error --max-time 10 --max-filesize 262144 "https://v-b.tech/en/personal-data-consent/" --output "$evidence_dir/en-consent.html"
node --input-type=module -e 'import { createHash } from "node:crypto"; import { readFile } from "node:fs/promises"; import { join } from "node:path"; const dir = process.argv[1]; const checks = [["ru-home.html", ["mailto:hello@v-b.tech", "https://t.me/thevladbog"]], ["en-home.html", ["mailto:hello@v-b.tech", "https://t.me/thevladbog"]], ["ru-policy.html", ["VBT-PD-01/2026.08/01"]], ["en-policy.html", ["VBT-PD-01/2026.08/01"]], ["ru-consent.html", ["VBT-PD-02/2026.08/01"]], ["en-consent.html", ["VBT-PD-02/2026.08/01"]]]; const hashes = []; for (const [file, markers] of checks) { const body = await readFile(join(dir, file)); const html = body.toString("utf8"); for (const marker of markers) if (!html.includes(marker)) throw new Error(`evidence_mismatch:${file}:${marker}`); hashes.push({ file, sha256: createHash("sha256").update(body).digest("hex") }); } process.stdout.write(`${JSON.stringify({ responses: hashes })}\n`);' "$evidence_dir"
```

Record only the command's ordered six-entry `responses` array, exact marker names, release SHA, operator, and UTC time. Each response entry contains only its local file name and SHA-256 hash. A 200 status or generic route-smoke pass without this marker evidence does not prove preservation.

### 2. Disable backend acceptance

After the web is confirmed disabled, use the reviewed runtime executor to restore `CONTACT_SUBMISSION_ENABLED=false` on the exact `vbtech-contact-http` target and remove public invocation only if the incident approval calls for it. Preserve the worker/timer long enough to process already accepted jobs unless the incident owner explicitly orders a bounded stop.

Capture prior/new function revision IDs, release SHA, boolean gates, audit ID, and route status only. Verify exact `/api/contact` and alternate methods/paths return neutral 404/405 behavior. If the plan includes unrelated resources, a different function, a secret-value change, worker disablement, database mutation, or any DNS action, abort before apply and regenerate a bounded plan.

### 3. Roll back function and web independently

Choose the smallest recovery: keep the contained disabled web artifact while restoring the prior known-good function revision, or keep the contained backend while restoring a prior disabled web image. Bind each mutation to an immutable digest and prior-state evidence. Never roll both merely because one failed.

Re-run private smoke before public smoke for any replacement release. Keep the public form disabled throughout. Do not replay failed/ambiguous jobs automatically; correlate accepted work using bounded metadata and deterministic message IDs, then obtain separate replay approval if needed.

### 4. Restore DNS only when runtime recovery cannot meet the window

DNS restoration requires separate explicit approval unless it is already the bounded recovery branch of the same approved DNS change window. Use the exact rollback RRsets and TTLs in the approved DNS handoff, apply only affected rows through the named provider interface, and capture a fresh provider export/audit ID. Do not alter MX, unrelated TXT, DMARC, or SPF outside the sheet.

After restoration, run public disabled smoke against the recovered edge. If provider state differs from the rollback sheet, stop further rows and escalate; do not improvise records from resolver caches.

## Accepted work and retention

Keep the timer worker running to drain jobs accepted before containment unless doing so would worsen the incident. Follow `data-retention.md`: terminal visitor fields are erased normally or by the 24-hour repair pass, terminal metadata expires after 30 days, and business correspondence follows the approved mailbox lifecycle. Preserve only minimum incident and delivery metadata. Deletion, correction, replay, worker stop, or mailbox action outside that lifecycle needs its own bounded approval.

## Tabletop rollback proof

Starting state: public form enabled, backend enabled, legal pages available, direct contacts available, and immutable disabled recovery evidence present. Walk the following state transitions without touching a live system:

| Order | Action ID                       | Public form | Legal pages | Direct contacts |
| ----: | ------------------------------- | ----------- | ----------- | --------------- |
|     1 | `disable-public-form`           | disabled    | kept        | kept            |
|     2 | `disable-backend-acceptance`    | disabled    | kept        | kept            |
|     3 | `restore-independent-artifacts` | disabled    | kept        | kept            |
|     4 | `optional-approved-dns-restore` | disabled    | kept        | kept            |

The exercise passes only if action 1 contains public intake before any backend/artifact/DNS recovery, every later state keeps legal pages and direct contacts, web and function recovery can be chosen independently, DNS remains optional and separately approved, and accepted work has an explicit processing/retention decision. The tabletop record must state that the legal/contact evidence command passed after action 1 and cite its six response hashes; table cells alone are not proof.

### Command: Execute the local tabletop contract

- Target/resource: committed publication, activation, retention, and rollback runbooks plus the modeled rollback state table
- Classification: **READ-ONLY**
- Expected output: all runbook contracts pass, including first-action form disablement with legal and direct-contact preservation
- Bounded failure branch: stop release sign-off, retain the failing assertion, and correct the runbook or state table before rehearsal approval

```bash
set -euo pipefail
node --test deploy/production/test/runbook-contract.test.mjs
```

Record tabletop date, participants, scenario, exact disabled recovery evidence IDs, command result, observed gaps, action owners, and follow-up due dates. A tabletop pass is not live acceptance and does not authorize any mutation.

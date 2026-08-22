# v-b.tech publication runbook

## Scope and evidence rules

This runbook orders the production publication gates. It does not grant permission to change GitHub Packages, the runtime, external DNS, or the public form. `publish.yml` publishes immutable artifacts; `deploy.yml` verifies them and produces a disabled handoff with `remoteMutation: false` and `executor: "not-configured"`. A handoff is not a deployment.

Do not invent live resource IDs. All identifiers below are **named release-time evidence placeholders** ending in `_EVIDENCE`; populate them only from the cited release record, validate them before use, and store evidence IDs rather than secret values. Missing, stale, ambiguous, or mismatched evidence fails closed. Never record credentials, secret-store values, visitor content, or provider response bodies.

`READ-ONLY` means no production resource is changed; writing a bounded local evidence file is allowed. `MUTATING` requires the approval named at that gate. Commands are operator instructions and were not executed while authoring this runbook.

## Gate P1 — Runtime inventory

Gate ID: `runtime-inventory`

Before any mutation, export a timestamped read-only inventory from the Yandex Cloud and existing edge control planes. Record evidence IDs for the existing VM/container network, exact v-b.tech image digest and release header if present, `vbtech-contact-http`, `vbtech-contact-worker`, timer trigger, isolated service account, Lockbox version ID (never its values), function package object and digest, `vbtech_contact` database/role/host, public-invoker state, `CONTACT_SUBMISSION_ENABLED`, and the currently configured edge authorities. Confirm that Markiro authorities and resources are unchanged and distinct.

The inventory must name its capture time, operator, source control plane, and target resource. If any resource is missing, shared unexpectedly, or cannot be read without exposing a secret, stop and escalate; do not infer it from Terraform configuration.

### Operator card: Acquire current runtime inventory

- Target/resource: Yandex Cloud management console and existing v-b.tech VM/container edge control plane named by the release owner
- Classification: **READ-ONLY**
- Required evidence: operator identity, UTC capture time, exact cloud/folder/cluster/VM/network sources, and a new private export path
- Expected output: one bounded export listing current IDs, versions, digests, capacity, network/authority ownership, boolean submission/public-invoker state, and secret version IDs without secret values
- Bounded failure branch: stop before publication, retain only the partial export and audit reference, and escalate any unavailable, shared, stale, or ambiguous resource

The operator uses the reviewed provider consoles' **view/export** actions only. No universal cloud client is configured in this repository, so this card must not be replaced with a guessed `yc`, Terraform, SSH, Docker, or database command. Save the original export outside the repository with read access restricted to the release reviewers.

### Command: Validate and hash the bounded runtime inventory export

- Target/resource: local private copy of the read-only runtime inventory export acquired by the operator card
- Classification: **READ-ONLY**
- Expected output: a nonempty regular file no larger than one MiB and one SHA-256 line for the evidence packet
- Bounded failure branch: stop before publication, retain the provider audit reference, and reacquire rather than editing or truncating the export

```bash
set -euo pipefail
: "${VBTECH_RUNTIME_INVENTORY_EVIDENCE:?set to the private runtime export path}"
test -f "$VBTECH_RUNTIME_INVENTORY_EVIDENCE"
test ! -L "$VBTECH_RUNTIME_INVENTORY_EVIDENCE"
test -s "$VBTECH_RUNTIME_INVENTORY_EVIDENCE"
test "$(wc -c < "$VBTECH_RUNTIME_INVENTORY_EVIDENCE")" -le 1048576
shasum -a 256 "$VBTECH_RUNTIME_INVENTORY_EVIDENCE"
```

### Command: Verify the release source and local production contracts

- Target/resource: local checkout for the exact v-b.tech release commit and production contract suite
- Classification: **READ-ONLY**
- Expected output: the requested 40-character commit is checked out and every production contract reports pass
- Bounded failure branch: stop this release, retain the failing output, and return the commit to CI without publishing

```bash
set -euo pipefail
: "${VBTECH_RELEASE_SHA_EVIDENCE:?set from the approved release record}"
[[ "$VBTECH_RELEASE_SHA_EVIDENCE" =~ ^[0-9a-f]{40}$ ]]
test "$(git rev-parse HEAD)" = "$VBTECH_RELEASE_SHA_EVIDENCE"
corepack pnpm run test:contracts
```

## Gate P2 — DNS inventory

Gate ID: `dns-inventory`

Before any mutation, follow `docs/runbooks/external-dns.md` and export the complete current `v-b.tech` zone from the external provider. Record the original export evidence ID and capture time, every A/AAAA/CNAME/MX/TXT RRset, current TTLs, the complete Postbox DKIM setup and status, the current official Postbox SPF instruction, approved edge addresses, and any exact rollback RRsets. A resolver lookup is not the provider inventory.

The runtime and DNS inventories must both be accepted before Gate P3. A missing owner, value, TTL, Postbox verification state, or rollback value stops the release. Do not replace missing release-time evidence with examples or remembered values.

### Operator card: Acquire current DNS and mail inventory

- Target/resource: external authoritative DNS provider console for the complete `v-b.tech` zone, existing edge inventory, and Postbox verification console
- Classification: **READ-ONLY**
- Required evidence: operator identity, UTC capture time, provider zone identifier, complete zone export, exact edge address evidence, complete Postbox address output, and the current official Postbox SPF instruction
- Expected output: original artifacts containing every A/AAAA/CNAME/MX/TXT owner/value/TTL, all SPF/DMARC data, complete pending-or-verified DKIM requirements, explicit custom-MAIL-FROM state, and no proposed mutation
- Bounded failure branch: stop before sheet generation, retain original partial exports, and escalate missing owners, TTLs, selectors, verification state, or provider access

Follow the acquisition and sheet sequence in `external-dns.md`. Resolver output is supplemental only and cannot replace the provider export.

### Command: Build the local DNS review sheet from exact inventory evidence

- Target/resource: local `deploy/dns/cli.ts`, the approved current-zone evidence file, and a new dated review artifact
- Classification: **READ-ONLY**
- Expected output: the CLI creates one new review sheet containing exact current, proposed, and rollback records without network access
- Bounded failure branch: stop before publication, retain the original inventory, and correct evidence rather than editing generated rows

```bash
set -euo pipefail
: "${VBTECH_DNS_INPUT_EVIDENCE:?set to the approved absolute inventory path}"
: "${VBTECH_DNS_REVIEW_EVIDENCE:?set to a new absolute dated review path}"
test -f "$VBTECH_DNS_INPUT_EVIDENCE"
test ! -e "$VBTECH_DNS_REVIEW_EVIDENCE"
corepack pnpm exec esbuild deploy/dns/cli.ts --bundle --platform=node --format=cjs --outfile=/tmp/vbtech-dns-handoff.cjs
node /tmp/vbtech-dns-handoff.cjs "$VBTECH_DNS_INPUT_EVIDENCE" "$VBTECH_DNS_REVIEW_EVIDENCE"
```

## Gate P3 — Publication approval

Gate ID: `publication-approval`

Obtain a release-publication approval that names the exact commit, successful CI run, immutable image tag/digest destination, function archive destination, runtime inventory evidence ID, DNS inventory evidence ID, and the intended submission state `disabled`. This approval covers GitHub/GHCR publication only. It is not DNS approval and not form-activation approval.

## Gate P4 — Immutable publication

Gate ID: `immutable-publication`

Dispatch the protected manual workflow only after Gate P3. The workflow refuses an existing commit tag, verifies CI on `main`, publishes the image as `ghcr.io/thevladbog/vbtech-web:<40-character-sha>`, creates the deterministic function archive and manifest, and attests them. Never use `latest` or replace an existing tag.

### Command: Dispatch immutable publication for the approved commit

- Target/resource: GitHub workflow `publish.yml` and GHCR repository `ghcr.io/thevladbog/vbtech-web`
- Classification: **MUTATING**
- Expected output: one protected workflow run is queued for the exact approved commit with immutable publication confirmation enabled
- Bounded failure branch: stop after one dispatch, do not retry against another commit, and escalate duplicate-tag or CI-identity failures

```bash
set -euo pipefail
: "${VBTECH_RELEASE_SHA_EVIDENCE:?set from the publication approval}"
[[ "$VBTECH_RELEASE_SHA_EVIDENCE" =~ ^[0-9a-f]{40}$ ]]
gh workflow run publish.yml --ref main --field release_sha="$VBTECH_RELEASE_SHA_EVIDENCE" --field confirm_publish=true
```

### Command: Verify and download the exact immutable publication evidence

- Target/resource: one GitHub `publish.yml` run and its `vbtech-release-<release-sha>` handoff artifact
- Classification: **READ-ONLY**
- Expected output: the run is successful on main at the exact commit and the manifest, checksum, archive, image digest, and attestations validate
- Bounded failure branch: stop before deployment, retain the run URL and validation error, and do not substitute another run or artifact

```bash
set -euo pipefail
: "${VBTECH_RELEASE_SHA_EVIDENCE:?set from the publication approval}"
: "${VBTECH_PUBLISH_RUN_ID_EVIDENCE:?set from the completed publish run}"
: "${VBTECH_RELEASE_DIR_EVIDENCE:?set to a new private local evidence directory}"
[[ "$VBTECH_PUBLISH_RUN_ID_EVIDENCE" =~ ^[1-9][0-9]{0,19}$ ]]
test ! -e "$VBTECH_RELEASE_DIR_EVIDENCE"
run_json="$(gh run view "$VBTECH_PUBLISH_RUN_ID_EVIDENCE" --json databaseId,workflowName,event,headBranch,headSha,status,conclusion,url)"
jq -e --arg sha "$VBTECH_RELEASE_SHA_EVIDENCE" '.workflowName == "Publish immutable release" and .event == "workflow_dispatch" and .headBranch == "main" and .headSha == $sha and .status == "completed" and .conclusion == "success"' <<<"$run_json" >/dev/null
install -d -m 700 "$VBTECH_RELEASE_DIR_EVIDENCE"
gh run download "$VBTECH_PUBLISH_RUN_ID_EVIDENCE" --name "vbtech-release-$VBTECH_RELEASE_SHA_EVIDENCE" --dir "$VBTECH_RELEASE_DIR_EVIDENCE"
node deploy/production/release-artifact.mjs validate "$VBTECH_RELEASE_DIR_EVIDENCE/release-manifest.json" "$VBTECH_RELEASE_SHA_EVIDENCE" "$VBTECH_PUBLISH_RUN_ID_EVIDENCE" "$VBTECH_RELEASE_DIR_EVIDENCE/vbtech-contact-function.zip" >/dev/null
(cd "$VBTECH_RELEASE_DIR_EVIDENCE" && sha256sum --check checksums.sha256)
attestation_policy=(--repo thevladbog/v-b --signer-workflow thevladbog/v-b/.github/workflows/publish.yml --source-digest "$VBTECH_RELEASE_SHA_EVIDENCE" --source-ref refs/heads/main)
gh attestation verify "$VBTECH_RELEASE_DIR_EVIDENCE/vbtech-contact-function.zip" "${attestation_policy[@]}"
gh attestation verify "$VBTECH_RELEASE_DIR_EVIDENCE/release-manifest.json" "${attestation_policy[@]}"
image_digest="$(jq -er '.image.digest' "$VBTECH_RELEASE_DIR_EVIDENCE/release-manifest.json")"
docker manifest inspect "ghcr.io/thevladbog/vbtech-web@$image_digest" >/dev/null
gh attestation verify "oci://ghcr.io/thevladbog/vbtech-web@$image_digest" "${attestation_policy[@]}"
```

## Gate P5 — Cloud/database/private runtime approval

Gate ID: `cloud-runtime-approval`

Obtain a distinct **cloud/database/private runtime mutation approval ID**. Publication approval covers GitHub/GHCR only and does not authorize cloud, database, runtime, VM, container, Lockbox, IAM, or private deployment mutation. This gate is the Task 8 Step 1 boundary in [`2026-08-20-vbtech-production-deployment.md`](../superpowers/plans/2026-08-20-vbtech-production-deployment.md#task-8-private-staging-and-production-approval-gates); DNS, public exposure, and form activation remain separate later approvals.

### Operator card: Approve cloud database and private runtime mutations

- Target/resource: exact Gate P1 runtime inventory, immutable Gate P4 digests, isolated database/Lockbox/IAM plan, disabled function/web plan, and rollback targets
- Classification: **MUTATING**
- Required evidence: owner approval ID naming operator, exact targets, allowed actions, immutable digests, prior states, maintenance window, and explicit exclusions for DNS/public exposure/form activation
- Expected output: one bounded approval record authorizing Gates P6 through P11 only for the reviewed targets and sequence
- Bounded failure branch: stop all cloud and database work, retain the unsigned plan, and do not reuse publication or DNS approval as authority

## Gate P6 — Isolated database and user

Gate ID: `isolated-database`

### Operator card: Create the isolated contact database and user

- Target/resource: reviewed existing Yandex Managed PostgreSQL cluster from Gate P1, new `vbtech_contact` user, and new `vbtech_contact` database only
- Classification: **MUTATING**
- Required evidence: cloud/runtime approval ID, exact cluster/host inventory, protected database name, PostgreSQL version, deletion-protection policy, and credential-store destination
- Expected output: user and owned database exist with no managed roles and access limited to `vbtech_contact`; protected-database connection is denied
- Bounded failure branch: stop before schema work, remove only a partially created new v-b.tech object when the same approval permits recovery, and escalate any protected/shared access

Yandex Managed PostgreSQL requires this one-time control-plane operation; `deploy/yandex/README.md` explicitly forbids inventing a SQL or Terraform user/database creation command. The generated credential goes directly to the approved secret workflow and never to shell history, state, source, or evidence.

## Gate P7 — Lockbox entries

Gate ID: `runtime-secrets`

### Operator card: Create isolated Lockbox entries

- Target/resource: reviewed v-b.tech Lockbox secret and immutable version containing only contact database, outbox encryption, rate-limit HMAC, and SmartCaptcha runtime entries
- Classification: **MUTATING**
- Required evidence: cloud/runtime approval ID, exact secret target, four approved entry names, rotation owner, and destination service-account plan
- Expected output: one new immutable secret version ID recorded without values and no Markiro secret or version changed
- Bounded failure branch: stop before IAM or deployment, retain only provider audit/version IDs, and rotate or remove the incomplete new version through approved recovery

## Gate P8 — Least-privilege permissions

Gate ID: `least-privilege-permissions`

### Operator card: Apply and review least-privilege runtime permissions

- Target/resource: isolated `vbtech-contact-runtime` service account, reviewed Lockbox secret, Postbox sender role, worker invocation binding, and disabled public-invoker state
- Classification: **MUTATING**
- Required evidence: cloud/runtime approval ID, exact IAM diff, Gate P7 secret version ID, existing folder inventory, and denial checks for protected resources
- Expected output: isolated identity has only `lockbox.payloadViewer` and `postbox.sender`; the exact self-worker binding is approved for Gate P10 and public HTTP invocation remains absent
- Bounded failure branch: abort before deployment, restore only bindings changed in this window, and escalate any wildcard, shared identity, protected-resource, or public-invoker grant

The final function-dependent binding evidence is completed at Gate P10. A reviewed permission plan is not proof of applied permissions.

## Gate P9 — Database bootstrap and migrations

Gate ID: `database-bootstrap`

Run the repository's current guarded interface inside the approved secret runner. `--check` proves exact managed identity, strict TLS, version, ownership, role isolation, and protected-database denial without mutation. Only then may the same approval authorize `--apply`, which changes application objects inside `vbtech_contact` only and applies the committed migration.

### Command: Check then apply the approved isolated database bootstrap

- Target/resource: exact `vbtech_contact` database on the approved managed cluster through `deploy/yandex/scripts/bootstrap-database.mjs`
- Classification: **MUTATING**
- Expected output: precheck passes, guarded bootstrap applies only committed contact schema objects, and permission verification proves ownership and protected-database denial
- Bounded failure branch: abort on the first nonzero result, retain content-free script output, and do not retry, reset, broaden grants, or touch the protected database

```bash
set -euo pipefail
: "${VBTECH_CLOUD_RUNTIME_APPROVAL_EVIDENCE:?set from Gate P5}"
node deploy/yandex/scripts/bootstrap-database.mjs --check
VBTECH_DATABASE_BOOTSTRAP_APPROVED=yes node deploy/yandex/scripts/bootstrap-database.mjs --apply
node deploy/yandex/scripts/verify-permissions.mjs --verify
```

## Gate P10 — Disabled function deployment

Gate ID: `disabled-function-deploy`

First create the repository's exact disabled handoff, then use only the remote deployment executor named by Gate P5. The handoff itself records `remoteMutation: false` and is not deployment evidence. The remote deployment executor is not configured in this repository; if it is absent or unreviewed, fail closed here and do not continue to private smoke or DNS.

### Command: Dispatch the exact disabled deployment handoff

- Target/resource: GitHub workflow `deploy.yml` and one successful immutable publication run
- Classification: **MUTATING**
- Expected output: one protected workflow run produces a verified handoff with submission disabled and remote mutation false
- Bounded failure branch: stop before any runtime action and do not reinterpret a missing or failed handoff as deployment evidence

```bash
set -euo pipefail
: "${VBTECH_RELEASE_SHA_EVIDENCE:?set from the publication approval}"
: "${VBTECH_PUBLISH_RUN_ID_EVIDENCE:?set from the successful publish run}"
gh workflow run deploy.yml --ref main --field publish_run_id="$VBTECH_PUBLISH_RUN_ID_EVIDENCE" --field release_sha="$VBTECH_RELEASE_SHA_EVIDENCE" --field submission_state=disabled
```

### Operator card: Deploy and prove the disabled contact functions

- Target/resource: exact `vbtech-contact-http`, `vbtech-contact-worker`, hourly trigger, immutable function archive digest, secret version, and isolated service account from Gates P1-P9
- Classification: **MUTATING**
- Required evidence: cloud/runtime approval ID, validated disabled handoff, prior function revisions, executor identity, immutable archive digest, and bounded rollback revisions
- Expected output: function/worker/trigger revision IDs and audit records show the exact release, HTTP submission false, public invoker absent, worker healthy, and final least-privilege bindings
- Bounded failure branch: stop before web deployment, restore only changed function/IAM revisions, keep DNS unchanged, and escalate any digest, target, gate, worker, or permission mismatch

## Gate P11 — Disabled web deployment

Gate ID: `disabled-web-deploy`

### Operator card: Deploy and prove the disabled web image

- Target/resource: existing v-b.tech VM/container network and Caddy authority from Gate P1 using the immutable image digest from Gate P4
- Classification: **MUTATING**
- Required evidence: cloud/runtime approval ID, exact prior/new image digests, disabled handoff, executor identity, private host-routing plan, and independent web rollback target
- Expected output: private edge evidence shows the exact release header/image digest, nine HTML files, zero JS/MJS contact runtime, unchanged Markiro authorities, and no public DNS change
- Bounded failure branch: stop before smoke and DNS, restore the prior container/image only, retain bounded runtime metadata, and escalate an absent executor or authority collision

The remote web deployment executor is not configured in this repository. Do not invent SSH, Docker, cloud, or server commands; without a reviewed executor and actual Gate P10/P11 evidence, the sequence fails closed.

## Gate P12 — Private disabled route smoke

Gate ID: `private-smoke`

Route only the operator's private loopback origin to the deployed edge. Do not change public DNS. The smoke verifies nine HTML routes, three text routes, release header, CSP/theme markers, disabled RU/EN forms, DRAFT consent identity on the forms, normal 404, and rejected API surface. The 17-check route smoke does not verify actual legal page text or direct contacts; Gate P13 supplies that independent evidence.

### Command: Run the private disabled route smoke

- Target/resource: private loopback v-b.tech edge origin from Gate P11 deployment evidence
- Classification: **READ-ONLY**
- Expected output: one bounded JSON summary with 17 checks and an empty failures array for the exact disabled release
- Bounded failure branch: stop before legal/contact inspection and DNS, retain only route/status/release metadata, and restore the prior runtime artifact if unhealthy

```bash
set -euo pipefail
: "${VBTECH_PRIVATE_ORIGIN_EVIDENCE:?set from the disabled web deployment record}"
: "${VBTECH_RELEASE_SHA_EVIDENCE:?set from the immutable release manifest}"
[[ "$VBTECH_PRIVATE_ORIGIN_EVIDENCE" =~ ^http://127\.0\.0\.1:[1-9][0-9]{0,4}/?$ ]]
export VBTECH_PRIVATE_ORIGIN_EVIDENCE VBTECH_RELEASE_SHA_EVIDENCE
node --input-type=module -e 'import { runSmoke } from "./deploy/production/smoke.mjs"; const result = await runSmoke({ baseUrl: process.env.VBTECH_PRIVATE_ORIGIN_EVIDENCE, mode: "private", expected: { releaseSha: process.env.VBTECH_RELEASE_SHA_EVIDENCE, submissionState: "disabled", consentId: "VBT-PD-02/DRAFT" } }); process.stdout.write(`${JSON.stringify(result)}\n`);'
```

## Gate P13 — Private legal and contact evidence

Gate ID: `private-legal-contact-evidence`

### Command: Verify private legal releases and direct contacts

- Target/resource: six exact private HTML routes on the Gate P11 loopback edge: RU/EN landings, policy pages, and consent pages
- Classification: **READ-ONLY**
- Expected output: bounded local parsing validates four exact DRAFT legal identities and both direct contact links, then emits one JSON object whose only key is an ordered six-entry `responses` array of file names and SHA-256 hashes
- Bounded failure branch: stop before DNS, remove temporary HTML, retain only the failed route/marker name, and restore the prior disabled web image if needed

```bash
set -euo pipefail
: "${VBTECH_PRIVATE_ORIGIN_EVIDENCE:?set from the disabled web deployment record}"
[[ "$VBTECH_PRIVATE_ORIGIN_EVIDENCE" =~ ^http://127\.0\.0\.1:[1-9][0-9]{0,4}/?$ ]]
origin="${VBTECH_PRIVATE_ORIGIN_EVIDENCE%/}"
evidence_dir="$(mktemp -d)"
trap 'rm -rf "$evidence_dir"' EXIT
curl --fail --silent --show-error --max-time 10 --max-filesize 262144 "$origin/" --output "$evidence_dir/ru-home.html"
curl --fail --silent --show-error --max-time 10 --max-filesize 262144 "$origin/en/" --output "$evidence_dir/en-home.html"
curl --fail --silent --show-error --max-time 10 --max-filesize 262144 "$origin/privacy/" --output "$evidence_dir/ru-policy.html"
curl --fail --silent --show-error --max-time 10 --max-filesize 262144 "$origin/en/privacy/" --output "$evidence_dir/en-policy.html"
curl --fail --silent --show-error --max-time 10 --max-filesize 262144 "$origin/personal-data-consent/" --output "$evidence_dir/ru-consent.html"
curl --fail --silent --show-error --max-time 10 --max-filesize 262144 "$origin/en/personal-data-consent/" --output "$evidence_dir/en-consent.html"
node --input-type=module -e 'import { createHash } from "node:crypto"; import { readFile } from "node:fs/promises"; import { join } from "node:path"; const dir = process.argv[1]; const checks = [["ru-home.html", ["mailto:hello@v-b.tech", "https://t.me/thevladbog"]], ["en-home.html", ["mailto:hello@v-b.tech", "https://t.me/thevladbog"]], ["ru-policy.html", ["VBT-PD-01/DRAFT"]], ["en-policy.html", ["VBT-PD-01/DRAFT"]], ["ru-consent.html", ["VBT-PD-02/DRAFT"]], ["en-consent.html", ["VBT-PD-02/DRAFT"]]]; const hashes = []; for (const [file, markers] of checks) { const body = await readFile(join(dir, file)); const html = body.toString("utf8"); for (const marker of markers) if (!html.includes(marker)) throw new Error(`evidence_mismatch:${file}:${marker}`); hashes.push({ file, sha256: createHash("sha256").update(body).digest("hex") }); } process.stdout.write(`${JSON.stringify({ responses: hashes })}\n`);' "$evidence_dir"
```

Record the command's ordered six-entry `responses` array, exact markers, origin, release SHA, operator, and UTC time. Each response entry contains only its local file name and SHA-256 hash; do not store the HTML bodies in the evidence packet.

## Gate P14 — Separate DNS approval

Gate ID: `dns-approval`

After both private evidence gates pass, obtain a separate **DNS approval ID** that binds the exact provider-zone export, generated review sheet hash, current and target RRsets/TTLs, rollback RRsets, operator, maintenance window, and approved runtime evidence. Publication and cloud/runtime approvals do not authorize DNS. Form activation requires a separate approval after public disabled evidence.

## Gate P15 — DNS mutation

Gate ID: `dns-mutation`

### Operator card: Apply the separately approved DNS sheet

- Target/resource: exact external authoritative `v-b.tech` zone and only add/update/replace/merge rows in the approved dated sheet
- Classification: **MUTATING**
- Required evidence: DNS approval ID, fresh provider export, sheet hash, exact current/target/rollback RRsets and TTLs, operator, and bounded change window
- Expected output: provider audit ID and post-change export match only approved rows while MX, unrelated TXT, DMARC review rows, and other owners remain unchanged
- Bounded failure branch: abort remaining rows, restore only rows already changed from the approved rollback table, and escalate any unexpected provider behavior

The repository intentionally contains no provider client, so no generic or invented DNS command is permitted. Follow `external-dns.md` and record every applied row.

## Gate P16 — Public disabled route smoke

Gate ID: `public-smoke`

Wait for approved provider state and HTTPS, then verify the exact public release while the form remains disabled. The public check follows private smoke; it never replaces it. This 17-check route smoke still does not prove legal text or direct contact links; Gate P17 does.

### Command: Run the public disabled route smoke

- Target/resource: canonical TLS origin `https://v-b.tech` after the separately approved DNS change
- Classification: **READ-ONLY**
- Expected output: one bounded JSON summary with 17 checks and an empty failures array for the exact disabled release
- Bounded failure branch: stop form activation, retain route/status/release evidence, and choose runtime recovery before separately approved DNS rollback

```bash
set -euo pipefail
: "${VBTECH_RELEASE_SHA_EVIDENCE:?set from the immutable release manifest}"
[[ "$VBTECH_RELEASE_SHA_EVIDENCE" =~ ^[0-9a-f]{40}$ ]]
export VBTECH_RELEASE_SHA_EVIDENCE
node --input-type=module -e 'import { runSmoke } from "./deploy/production/smoke.mjs"; const result = await runSmoke({ baseUrl: "https://v-b.tech", mode: "public", expected: { releaseSha: process.env.VBTECH_RELEASE_SHA_EVIDENCE, submissionState: "disabled", consentId: "VBT-PD-02/DRAFT" } }); process.stdout.write(`${JSON.stringify(result)}\n`);'
```

## Gate P17 — Public legal and contact evidence

Gate ID: `public-legal-contact-evidence`

### Command: Verify public legal releases and direct contacts

- Target/resource: six exact canonical HTTPS routes on `https://v-b.tech`: RU/EN landings, policy pages, and consent pages
- Classification: **READ-ONLY**
- Expected output: bounded local parsing validates four exact DRAFT legal identities and both direct contact links, then emits one JSON object whose only key is an ordered six-entry `responses` array of file names and SHA-256 hashes
- Bounded failure branch: stop form activation, remove temporary HTML, retain only failed route/marker metadata, and execute runtime recovery before separately approved DNS rollback

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
node --input-type=module -e 'import { createHash } from "node:crypto"; import { readFile } from "node:fs/promises"; import { join } from "node:path"; const dir = process.argv[1]; const checks = [["ru-home.html", ["mailto:hello@v-b.tech", "https://t.me/thevladbog"]], ["en-home.html", ["mailto:hello@v-b.tech", "https://t.me/thevladbog"]], ["ru-policy.html", ["VBT-PD-01/DRAFT"]], ["en-policy.html", ["VBT-PD-01/DRAFT"]], ["ru-consent.html", ["VBT-PD-02/DRAFT"]], ["en-consent.html", ["VBT-PD-02/DRAFT"]]]; const hashes = []; for (const [file, markers] of checks) { const body = await readFile(join(dir, file)); const html = body.toString("utf8"); for (const marker of markers) if (!html.includes(marker)) throw new Error(`evidence_mismatch:${file}:${marker}`); hashes.push({ file, sha256: createHash("sha256").update(body).digest("hex") }); } process.stdout.write(`${JSON.stringify({ responses: hashes })}\n`);' "$evidence_dir"
```

Record HTTPS/TLS evidence, route smoke, the command's ordered six-entry `responses` array, exact release/legal/contact markers, disabled form state, and rejected API routes. Each response entry contains only its local file name and SHA-256 hash. Only then hand off to `form-activation.md`. DNS approval does not authorize form activation.

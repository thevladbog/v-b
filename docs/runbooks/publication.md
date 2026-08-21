# v-b.tech publication runbook

## Scope and evidence rules

This runbook orders the production publication gates. It does not grant permission to change GitHub Packages, the runtime, external DNS, or the public form. `publish.yml` publishes immutable artifacts; `deploy.yml` verifies them and produces a disabled handoff with `remoteMutation: false` and `executor: "not-configured"`. A handoff is not a deployment.

Do not invent live resource IDs. All identifiers below are **named release-time evidence placeholders** ending in `_EVIDENCE`; populate them only from the cited release record, validate them before use, and store evidence IDs rather than secret values. Missing, stale, ambiguous, or mismatched evidence fails closed. Never record credentials, secret-store values, visitor content, or provider response bodies.

`READ-ONLY` means no production resource is changed; writing a bounded local evidence file is allowed. `MUTATING` requires the approval named at that gate. Commands are operator instructions and were not executed while authoring this runbook.

## Gate P1 — Runtime inventory

Gate ID: `runtime-inventory`

Before any mutation, export a timestamped read-only inventory from the Yandex Cloud and existing edge control planes. Record evidence IDs for the existing VM/container network, exact v-b.tech image digest and release header if present, `vbtech-contact-http`, `vbtech-contact-worker`, timer trigger, isolated service account, Lockbox version ID (never its values), function package object and digest, `vbtech_contact` database/role/host, public-invoker state, `CONTACT_SUBMISSION_ENABLED`, and the currently configured edge authorities. Confirm that Markiro authorities and resources are unchanged and distinct.

The inventory must name its capture time, operator, source control plane, and target resource. If any resource is missing, shared unexpectedly, or cannot be read without exposing a secret, stop and escalate; do not infer it from Terraform configuration.

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

Before any mutation, follow `docs/runbooks/external-dns.md` and export the complete current `v-b.tech` zone from the external provider. Record the original export evidence ID and capture time, every A/AAAA/CNAME/MX/TXT RRset, current TTLs, verified Postbox records, approved edge addresses, and any exact rollback RRsets. A resolver lookup is not the provider inventory.

The runtime and DNS inventories must both be accepted before Gate P3. A missing owner, value, TTL, Postbox verification state, or rollback value stops the release. Do not replace missing release-time evidence with examples or remembered values.

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

## Gate P5 — Disabled deployment

Gate ID: `disabled-deploy`

Create the protected disabled handoff, then deploy its exact image digest and function digest through a separately reviewed runtime executor with both the public web artifact and `CONTACT_SUBMISSION_ENABLED` disabled. The executor must identify every runtime target from Gate P1 and record prior/replacement digests and independent recovery actions.

The repository currently has no remote deployment executor. `deploy.yml` must not be described as deploying a server, function, database, or edge. Until a reviewed executor exists and produces runtime evidence that the disabled release is actually running, this gate remains blocked and DNS must not change.

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

## Gate P6 — Private disabled smoke

Gate ID: `private-smoke`

Route only the operator's private origin to the deployed edge. Do not change public DNS. The smoke must verify nine HTML routes, three text routes, the release header, CSP/theme markers, disabled RU/EN forms, DRAFT consent identity, normal 404, and rejected API surface. Record the exact runtime deployment evidence ID beside the result.

### Command: Run the private disabled route smoke

- Target/resource: private loopback or explicitly private v-b.tech edge origin from runtime deployment evidence
- Classification: **READ-ONLY**
- Expected output: one bounded JSON summary with 17 checks and an empty failures array for the exact disabled release
- Bounded failure branch: stop before DNS, retain only route/status/release metadata, and restore the prior runtime artifact if the private contour is unhealthy

```bash
set -euo pipefail
: "${VBTECH_PRIVATE_ORIGIN_EVIDENCE:?set from the disabled runtime deployment record}"
: "${VBTECH_RELEASE_SHA_EVIDENCE:?set from the immutable release manifest}"
[[ "$VBTECH_PRIVATE_ORIGIN_EVIDENCE" == http://127.0.0.1:* ]]
export VBTECH_PRIVATE_ORIGIN_EVIDENCE VBTECH_RELEASE_SHA_EVIDENCE
node --input-type=module -e 'import { runSmoke } from "./deploy/production/smoke.mjs"; const result = await runSmoke({ baseUrl: process.env.VBTECH_PRIVATE_ORIGIN_EVIDENCE, mode: "private", expected: { releaseSha: process.env.VBTECH_RELEASE_SHA_EVIDENCE, submissionState: "disabled", consentId: "VBT-PD-02/DRAFT" } }); process.stdout.write(`${JSON.stringify(result)}\n`);'
```

## Gate P7 — Separate DNS approval

Gate ID: `dns-approval`

After private smoke passes, obtain a separate **DNS approval ID** that binds the exact provider-zone export, generated review sheet hash, current and target RRsets/TTLs, rollback RRsets, operator, maintenance window, and approved runtime evidence. Publication approval does not authorize DNS. Form activation requires a separate approval after public disabled smoke.

## Gate P8 — DNS mutation

Gate ID: `dns-mutation`

Apply only the approved rows in the external provider interface named by the DNS approval. The repository intentionally contains no provider client, so no generic or invented DNS command is permitted. The operator must capture the provider change/audit ID and a fresh post-change zone export. Any unexpected row, implicit record replacement, missing rollback value, or approval mismatch means abort remaining rows and restore only the rows already changed using the approved rollback table.

Do not normalize TTLs, MX, DMARC, unrelated TXT, or SPF beyond the approved sheet. DNS restoration is itself a mutation and requires the incident approval described in `rollback.md` unless it is the bounded recovery branch of this same approved change window.

## Gate P9 — Public disabled smoke

Gate ID: `public-smoke`

Wait for the approved provider state and HTTPS certificate, then verify the exact public release while the form remains disabled. The public check follows private smoke; it never replaces it.

### Command: Run the public disabled route smoke

- Target/resource: canonical TLS origin `https://v-b.tech` after the separately approved DNS change
- Classification: **READ-ONLY**
- Expected output: one bounded JSON summary with 17 checks and an empty failures array for the exact disabled release
- Bounded failure branch: stop form activation, retain route/status/release evidence, and choose runtime recovery before any separately approved DNS rollback

```bash
set -euo pipefail
: "${VBTECH_RELEASE_SHA_EVIDENCE:?set from the immutable release manifest}"
[[ "$VBTECH_RELEASE_SHA_EVIDENCE" =~ ^[0-9a-f]{40}$ ]]
export VBTECH_RELEASE_SHA_EVIDENCE
node --input-type=module -e 'import { runSmoke } from "./deploy/production/smoke.mjs"; const result = await runSmoke({ baseUrl: "https://v-b.tech", mode: "public", expected: { releaseSha: process.env.VBTECH_RELEASE_SHA_EVIDENCE, submissionState: "disabled", consentId: "VBT-PD-02/DRAFT" } }); process.stdout.write(`${JSON.stringify(result)}\n`);'
```

Record HTTPS, release header, RU/EN routes, legal pages, direct email/Telegram contacts, disabled form state, and rejected API routes. Only then hand off to `form-activation.md`. DNS approval does not authorize form activation.

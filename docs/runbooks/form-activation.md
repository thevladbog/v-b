# v-b.tech public form activation runbook

## Scope and stop condition

This runbook begins only after `publication.md` records a passing public disabled smoke. DNS approval does not authorize form activation. Activation changes both the server-side handler and the public web artifact and therefore requires its own approval.

Do not invent live resource IDs. Use named release-time evidence placeholders from the approved release record, validate them, and fail closed on missing or mismatched evidence. Do not expose credentials, secret-store values, visitor fields, or provider response content in commands or evidence.

The current repository can prove an isolated ACTIVE layout and can model enabled preflight/smoke behavior, but `publish.yml` only emits a disabled DRAFT manifest and `deploy.yml` has no remote executor. Therefore a live activation is blocked until a separately reviewed immutable ACTIVE publication path and runtime executor exist. The ordered gates remain the acceptance contract for that future capability.

## Gate A1 — Legal approval

Gate ID: `legal-approval`

Record a legal approval artifact that names the exact Russian source wording, paired English translation, operator profile, provider inventory, revision IDs, effective dates, reviewer, and approval time. Both current releases must be coherent: `VBT-PD-01` must be ACTIVE and `VBT-PD-02` must be ACTIVE. A DRAFT, mixed ACTIVE/DRAFT pair, expired effective period, missing translation, or unverified provider/operator fact stops activation.

The legal artifact must be committed and reviewed atomically with the state-aware RU/EN landing, form, policy, consent, and status copy. It must describe the actual production transmission path and contain no disabled/DRAFT claim when used by an enabled artifact.

### Command: Verify legal package and mixed-contour fail-closed tests

- Target/resource: local `@vbtech/legal-documents` releases and web artifact legal-contour tests at the approved commit
- Classification: **READ-ONLY**
- Expected output: legal tests pass and both mixed ACTIVE/DRAFT directions abort without emitting a public artifact
- Bounded failure branch: stop activation, retain the failing test names, and return the legal or copy change for review

```bash
set -euo pipefail
: "${VBTECH_ACTIVE_RELEASE_SHA_EVIDENCE:?set from the legal approval artifact}"
[[ "$VBTECH_ACTIVE_RELEASE_SHA_EVIDENCE" =~ ^[0-9a-f]{40}$ ]]
test "$(git rev-parse HEAD)" = "$VBTECH_ACTIVE_RELEASE_SHA_EVIDENCE"
corepack pnpm --filter @vbtech/legal-documents test
corepack pnpm --dir apps/web test -- mixed-legal-contour
```

## Gate A2 — Active artifact proof

Gate ID: `active-artifact-proof`

Build and inspect the repository's guarded private ACTIVE contour first. It is restricted to loopback, uses a test-only legal alias, and is proof of layout/client behavior only. It must never be copied to the public output or treated as the production legal release.

The actual activation artifact must then be produced by a reviewed immutable publication mechanism that binds the exact ACTIVE legal IDs, public SmartCaptcha site key, release commit, web image digest, function digest, and nine HTML files. It must contain exactly one shared request-capable JS/MJS chunk and no fixture marker, secret name/value, or developer path. Because that immutable ACTIVE publisher does not yet exist, this gate currently stops after private proof.

### Command: Build and browser-test the guarded private ACTIVE contour

- Target/resource: loopback-only `apps/web` ACTIVE fixture and the dedicated contact-active Playwright suite
- Classification: **READ-ONLY**
- Expected output: the private build emits the reviewed nine-page ACTIVE contour and the dedicated browser suite passes on loopback
- Bounded failure branch: stop activation, remove the private preview artifact from release consideration, and fix the source before requesting approval

```bash
set -euo pipefail
corepack pnpm --dir apps/web build:contact-active
corepack pnpm --dir tools/browser test:contact-active
```

## Gate A3 — Separate form activation approval

Gate ID: `form-activation-approval`

Obtain a **form activation approval ID** after Gates A1 and A2. It must bind the exact ACTIVE policy/consent releases and effective dates, immutable artifact identities, disabled public smoke evidence, SmartCaptcha domain/abuse-control review, Postbox sender evidence, runtime/DNS inventory IDs, activation window, operators, and rollback evidence.

The approval must explicitly authorize two independently recoverable mutations: backend enable and enabled web deployment. A publication approval, DNS approval, legal approval alone, or an approval for a different digest does not authorize either mutation.

## Gate A4 — Backend enable

Gate ID: `backend-enable`

Using only the reviewed runtime executor named by the activation approval, first enable public invocation/approved abuse controls and set the exact `vbtech-contact-http` function revision's `CONTACT_SUBMISSION_ENABLED` to true. Keep the web artifact disabled while verifying that exact route, alternate routes/methods, database reachability, worker/timer health, and Postbox sender identity match the approval.

Capture target resource IDs, prior and new revision IDs, release SHA, boolean gates, operator, provider audit ID, and timestamps. Do not capture environment values. If the executor is absent, the plan contains any unrelated resource, the revision/digest differs, or the handler cannot be verified privately, abort and restore the prior disabled backend revision. The current repository has no reviewed remote activation executor, so this gate is presently blocked.

## Gate A5 — Enabled web deployment

Gate ID: `web-enable`

Only after the backend enable evidence passes, deploy the approved immutable ACTIVE web image to the existing v-b.tech edge. Do not rebuild at the server and do not change DNS. Verify that the edge serves the exact digest/release header, ACTIVE legal IDs, public site key, same-origin `/api/contact`, and the approved CSP while legal pages and direct contacts remain available.

If the image digest, release header, legal IDs, form state, route, or CSP differs, immediately execute rollback action 1 from `rollback.md`: redeploy the pre-approved disabled web artifact while keeping legal pages and direct contacts. The current publication workflow cannot produce an immutable ACTIVE release, so this gate is presently blocked.

## Gate A6 — Enabled ACTIVE legal and contact evidence

Gate ID: `active-legal-contact-evidence`

The enabled web deployment replaces the disabled/DRAFT public bytes. The generic route smoke does not inspect the policy page identity, consent page identity, or direct-contact links, so it cannot prove that the approved ACTIVE legal contour survived that replacement. Run this independent READ-ONLY evidence gate immediately after Gate A5 and before the generic enabled smoke.

### Command: Verify enabled ACTIVE legal releases and direct contacts

- Target/resource: six exact canonical HTTPS routes after enabled deployment: RU/EN landings, policy pages, and consent pages on `https://v-b.tech`
- Classification: **READ-ONLY**
- Expected output: marker validation succeeds and one JSON line contains only an ordered six-entry `responses` array with exact `file` and lowercase SHA-256 fields
- Bounded failure branch: stop activation acceptance and the generic smoke, remove temporary HTML, retain only the failed route/marker name, and immediately restore the approved disabled web artifact

```bash
set -euo pipefail
: "${VBTECH_ACTIVE_POLICY_EVIDENCE:?set to the exact approved ACTIVE VBT-PD-01 release identity from activation approval}"
: "${VBTECH_ACTIVE_CONSENT_EVIDENCE:?set to the exact approved ACTIVE VBT-PD-02 release identity from activation approval}"
[[ "$VBTECH_ACTIVE_POLICY_EVIDENCE" =~ ^VBT-PD-01/[0-9]{4}\.[0-9]{2}/[0-9]{2}$ ]]
[[ "$VBTECH_ACTIVE_CONSENT_EVIDENCE" =~ ^VBT-PD-02/[0-9]{4}\.[0-9]{2}/[0-9]{2}$ ]]
export VBTECH_ACTIVE_POLICY_EVIDENCE VBTECH_ACTIVE_CONSENT_EVIDENCE
evidence_dir="$(mktemp -d)"
trap 'rm -rf "$evidence_dir"' EXIT
curl --fail --silent --show-error --max-time 10 --max-filesize 262144 "https://v-b.tech/" --output "$evidence_dir/ru-home.html"
curl --fail --silent --show-error --max-time 10 --max-filesize 262144 "https://v-b.tech/en/" --output "$evidence_dir/en-home.html"
curl --fail --silent --show-error --max-time 10 --max-filesize 262144 "https://v-b.tech/privacy/" --output "$evidence_dir/ru-policy.html"
curl --fail --silent --show-error --max-time 10 --max-filesize 262144 "https://v-b.tech/en/privacy/" --output "$evidence_dir/en-policy.html"
curl --fail --silent --show-error --max-time 10 --max-filesize 262144 "https://v-b.tech/personal-data-consent/" --output "$evidence_dir/ru-consent.html"
curl --fail --silent --show-error --max-time 10 --max-filesize 262144 "https://v-b.tech/en/personal-data-consent/" --output "$evidence_dir/en-consent.html"
node --input-type=module -e 'import { createHash } from "node:crypto"; import { readFile } from "node:fs/promises"; import { join } from "node:path"; const dir = process.argv[1]; const policy = process.env.VBTECH_ACTIVE_POLICY_EVIDENCE ?? ""; const consent = process.env.VBTECH_ACTIVE_CONSENT_EVIDENCE ?? ""; if (!/^VBT-PD-01\/[0-9]{4}\.[0-9]{2}\/[0-9]{2}$/.test(policy) || !/^VBT-PD-02\/[0-9]{4}\.[0-9]{2}\/[0-9]{2}$/.test(consent)) throw new Error("invalid_active_legal_evidence"); const checks = [["ru-home.html", ["mailto:hello@v-b.tech", "https://t.me/thevladbog"]], ["en-home.html", ["mailto:hello@v-b.tech", "https://t.me/thevladbog"]], ["ru-policy.html", [policy]], ["en-policy.html", [policy]], ["ru-consent.html", [consent]], ["en-consent.html", [consent]]]; const hashes = []; for (const [file, markers] of checks) { const body = await readFile(join(dir, file)); const html = body.toString("utf8"); for (const marker of markers) if (!html.includes(marker)) throw new Error(`evidence_mismatch:${file}:${marker}`); hashes.push({ file, sha256: createHash("sha256").update(body).digest("hex") }); } process.stdout.write(`${JSON.stringify({ responses: hashes })}\n`);' "$evidence_dir"
```

Record the exact approved policy and consent identities, the ordered six-entry `responses` array, enabled web digest/release SHA, operator, and UTC time. Do not store response bodies.

## Gate A7 — Public form smoke

Gate ID: `public-form-smoke`

First run the bounded route smoke. It sends only an empty invalid JSON object to prove routing; it does not submit visitor information. Then, under the form activation approval, submit one controlled non-sensitive test data case through the actual browser UI. Record only the public request UUID, release/legal IDs, bounded status, timestamps, deterministic message ID, and mailbox receipt/confirmation result. Do not record entered fields, rendered mail, captcha material, or provider bodies.

### Command: Run the enabled public route smoke without visitor content

- Target/resource: canonical TLS origin `https://v-b.tech` and exact ACTIVE release identity from activation evidence
- Classification: **MUTATING**
- Expected output: one bounded JSON summary with 17 checks and an empty failures array for enabled exact-route behavior
- Bounded failure branch: stop the controlled browser smoke and immediately restore the disabled web artifact before diagnosing metadata only

```bash
set -euo pipefail
: "${VBTECH_ACTIVE_RELEASE_SHA_EVIDENCE:?set from the immutable ACTIVE manifest}"
: "${VBTECH_ACTIVE_CONSENT_EVIDENCE:?set from the approved ACTIVE consent release}"
[[ "$VBTECH_ACTIVE_RELEASE_SHA_EVIDENCE" =~ ^[0-9a-f]{40}$ ]]
[[ "$VBTECH_ACTIVE_CONSENT_EVIDENCE" =~ ^VBT-PD-02/[0-9]{4}\.[0-9]{2}/[0-9]{2}$ ]]
export VBTECH_ACTIVE_RELEASE_SHA_EVIDENCE VBTECH_ACTIVE_CONSENT_EVIDENCE
node --input-type=module -e 'import { runSmoke } from "./deploy/production/smoke.mjs"; const result = await runSmoke({ baseUrl: "https://v-b.tech", mode: "public", expected: { releaseSha: process.env.VBTECH_ACTIVE_RELEASE_SHA_EVIDENCE, submissionState: "enabled", consentId: process.env.VBTECH_ACTIVE_CONSENT_EVIDENCE } }); process.stdout.write(`${JSON.stringify(result)}\n`);'
```

The activation is accepted only when the post-deployment ACTIVE legal/contact evidence passes separately from the generic route smoke, the exact public release is visible, the controlled case is accepted once, the operator mailbox receives the expected notification, the visitor confirmation matches the approved channel behavior, and the timer/retention telemetry remains content-free. Otherwise perform `rollback.md` in order.

The activation tabletop must cite the passing post-enabled-deployment ACTIVE legal/contact evidence separately from the generic route smoke and demonstrate that rollback action 1 disables the form without removing those legal pages or direct contacts.

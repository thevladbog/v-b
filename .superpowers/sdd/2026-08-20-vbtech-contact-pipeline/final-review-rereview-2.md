# Whole-branch final-review fix wave 2 — independent re-review

**Previous reviewed head:** `a2c9b3abb9cd83f9815a7b3bf36e7a459c060e79`
**Re-reviewed head:** `6c8eff3f1b79c0c068464f69ed60cf3ebeb1cdf5`
**Commit:** `6c8eff3 fix: align active contact copy with submission state`
**Date:** 2026-08-21
**Verdict:** **Not ready to merge — the original ACTIVE-copy contradiction is closed for the all-ACTIVE contour, but a mixed PD01/PD02 registry can still enable submission and present the legal register as ACTIVE while the policy remains DRAFT.**

## Scope

I reviewed the remaining I1 copy/legal-coherence issue from `final-review-rereview-1.md`, the wave-2 fix report and ledger entry, and the complete `a2c9b3a..6c8eff3` diff with every changed production, private-fixture, test, and runbook file. I verified the exact branch/head, one-commit scope, and clean tracked baseline before producing this uncommitted review report. No production source was edited, no database or Mailpit service was started, and no live provider, cloud, deployment, DNS, mailbox, legal publication, or visitor data was touched.

## Finding-by-finding verdict

### Original I1 — Closed for the intended all-ACTIVE contour

The wave-2 change closes the contradiction recorded in the first re-review:

- `activeSubmission` is a typed RU/EN state-specific copy object covering direct-contact context, form title, consent instruction, form note, success copy, consent-link label, consent context, and consent error (`packages/content/src/types.ts:118-127`). `resolveContactContent` returns the original object unchanged when submission is disabled and replaces exactly those fields when it is enabled (`packages/content/src/contact.ts:5-18`); exact DRAFT-copy tests passed.
- `AboutContact` resolves readiness once for its own direct context and passes the resolved content to `ContactForm` (`apps/web/src/components/AboutContact.astro:13-16`, `34-46`). The form independently uses the same shared readiness contract, so ACTIVE copy is not selected by the public flag alone.
- RU and EN ACTIVE strings accurately state that the form transmits entered data, link the current policy/consent, and require a separately selected consent checkbox; the preserved default strings still describe the disabled DRAFT shell (`packages/content/src/site.ts:191-226`, `251-286`). No legal effect, delivery, security, or retention guarantee is invented by the ACTIVE UI copy.
- The private alias contains separate coherent synthetic ACTIVE PD01 and PD02 identities, metadata, summaries, and bodies with the same synthetic `2099.01/01` revision/effective contour; it states that public wording needs separate legal approval (`apps/web/test-active/legal-documents.ts:11-55`, `57-110`). The unchanged private config restricts selection to an explicit guard, exact loopback origin, and OS-temporary output, and rejects production origin/public-flag-only selection.
- Artifact assertions positively cover the state-aware landing copy and all six legal routes, exhaustively deny the prior DRAFT/disabled phrases across all ACTIVE HTML, and still verify 9 HTML/1 shared request-capable JS with no fixture marker, secret, or developer path (`apps/web/test/active-contact-artifact.test.ts:43-88`, `110-181`). Browser coverage verifies exact active copy, one initialization, RU/EN, Desktop/Pixel, light/dark, WCAG checks, all six legal routes, one-time captcha, and exact same-origin JSON POST (`tools/browser/tests/contact-active.spec.ts:67-160`, `162-213`). The fix report's deliberate active-copy mutation failure is credible and the relevant suites passed fresh.
- The normal DRAFT regression remains positive and exact: the focused default shell/legal suite passed, including nine HTML, zero client JS/MJS, and the existing recursive deny-list. The runbook now requires joint review of ACTIVE interface/legal copy and forbids DRAFT/disabled/no-transmission wording before production activation (`docs/runbooks/contact-delivery.md:123-137`).

No residual instance of the original all-ACTIVE text contradiction was found.

## New Critical/Important breakage

### Important — partial legal activation can enable collection and overstate the registry

The production readiness gate does not require the current policy (PD01) and consent (PD02) to be active as one legal contour:

- Astro derives `legalReady` only by checking whether `CURRENT_CONTACT_CONSENT_ID` ends in `/DRAFT` (`apps/web/astro.config.mjs:5-14`).
- The registry deliberately selects the current active-or-draft release independently for each code (`packages/legal-documents/src/registry.ts:138-147`), but `assertContactConsentPublishable` validates only the PD02 consent identity/status (`packages/legal-documents/src/registry.ts:439-453`). It does not verify current PD01 at all.
- The newly state-aware RU and EN legal registers then compute their overall state as DRAFT only when **every** document is DRAFT. Any mixed set is therefore labelled ACTIVE and says that current documents are published, even if one required document remains DRAFT (`apps/web/src/pages/legal/index.astro:5-18`; `apps/web/src/pages/en/legal/index.astro:5-17`).
- Wave-2 artifact/browser coverage exercises only the all-DRAFT production registry and the all-ACTIVE synthetic alias (`apps/web/test-active/legal-documents.ts:102-110`; `apps/web/test/active-contact-artifact.test.ts:137-156`; `tools/browser/tests/contact-active.spec.ts:134-159`). There is no mutation or fixture for PD02-active/PD01-draft or the reverse.

Consequently, publishing only PD02 and setting the public flag/key can satisfy the build/runtime gate, select the ACTIVE contact copy, and enable personal-data submission while PD01 is still a non-effective draft. At the same time, `/legal/` and `/en/legal/` claim the register contains current/active documents. This is a fail-open legal-integration state and a user-facing overclaim. Current production remains all-DRAFT and disabled, so this is Important rather than a present live Critical incident.

**Required remediation:** define one shared legal-submission readiness assertion in `@vbtech/legal-documents` that requires both current PD01 and PD02 releases to be `active` and internally coherent before submission can be enabled. Use that single result for Astro script injection, contact readiness/copy, and the public build fail-close. The legal register must not collapse a mixed set to ACTIVE: either fail the build for an invalid mixed publish state or present accurate per-document status without the current-active summary. Add deliberate mixed-state coverage in both directions (PD01 active/PD02 draft and PD01 draft/PD02 active) and prove that neither public submission nor ACTIVE copy/runtime can be selected and that the register cannot overclaim. Update the activation runbook to make the two-document code-enforced gate explicit.

## Fresh focused verification

- PASS: exact head `6c8eff3f1b79c0c068464f69ed60cf3ebeb1cdf5`, one-commit wave-2 range, clean tracked baseline, and `git diff --check`.
- PASS: `packages/content` focused Vitest, 6/6.
- PASS: web ACTIVE artifact + normal DRAFT shell + legal-page focused Vitest, 60/60.
- PASS: private ACTIVE Playwright, 8/8 across Desktop Chrome and Pixel 7, including RU/EN copy, light/dark accessibility, all six legal routes, exact same-origin POST, and one captcha token. The sandboxed first attempt built the artifact but could not bind loopback (`EPERM`); the approved local-loopback rerun passed, and Playwright stopped its preview server.
- PASS: `git diff --check` for `a2c9b3a..6c8eff3`.

## Not rerun

Root-wide unit/lint/typecheck/build/package-manager gates, standard/internal-fixture browser matrices, PostgreSQL 17/Mailpit E2E, email evidence generation, and any live acceptance were not rerun because wave 2 changes only content/legal presentation and their focused artifact/browser gates passed. The exact-head fix report records the broader gates. No real SmartCaptcha, Postbox/IAM, database, function/timer, Caddy, DNS/TLS, mailbox, production form, or legal publication was exercised.

The mixed-state failure was established from the executable production readiness and registry paths; no service startup or live mutation was needed.

## Merge readiness

**Not ready to merge.** The original I1 text/legal contradiction is closed for a fully active synthetic contour, and no Critical finding was found. The new Important mixed-registry bypass must be fixed before merge because the public submission decision currently proves only PD02, not the simultaneously required active PD01 policy. After implementing a shared two-document fail-close and mixed-state mutation tests, obtain one focused independent re-review. Real legal wording/effective dates, provider inventory, public key/domain configuration, backend activation, deployment, and live smoke remain separate approval gates.

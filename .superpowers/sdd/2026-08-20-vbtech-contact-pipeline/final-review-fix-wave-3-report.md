# Final review fix wave 3 report

Date: 2026-08-21

## Finding verification

The second re-review finding was correct. Production readiness was derived only from the PD02 consent identity, the publishability assertion validated only PD02, and both RU/EN legal registers treated any state other than all-DRAFT as ACTIVE. A PD01-ACTIVE/PD02-DRAFT or PD01-DRAFT/PD02-ACTIVE registry could therefore either overstate the register or enable submission without the complete personal-data legal contour.

The full re-review, receiving-review, test-driven-development, writing-good-tests, and verification guidance were read before edits. The remediation preserves the existing all-DRAFT behavior and does not edit or activate the real legal documents.

## Shared contour contract

`@vbtech/legal-documents` now exposes one typed, side-effect-free `derivePersonalDataLegalContour` function. It derives the exact current PD01 policy and PD02 consent together, after the existing lifecycle and supersedes-graph validation, and returns:

- `draft` only when both releases are DRAFT, use their exact `/DRAFT` identities, and have null revision/effective date;
- `active` only when both releases are ACTIVE and each independently has a non-null revision, effective date, and exact identity for its own code;
- otherwise it throws an explicit incoherent-contour error and the static build aborts.

The function intentionally does not require the independent PD01 and PD02 revision strings or dates to match. Release input order is irrelevant. Missing current releases, malformed ACTIVE metadata or identity, malformed DRAFT metadata, and either mixed direction fail closed.

The same derived contour is now the sole source for Astro runtime injection/public-flag readiness, contact consent readiness and state-aware copy, current consent identity, and RU/EN legal-register status. The previous `/DRAFT` suffix decision and `every(status)` register logic are removed.

## Private mixed-state contour

A guarded private mixed-state alias and Astro config exercise both `policy-active` and `consent-active` directions through the actual production layouts/pages. It requires an explicit private guard and exact direction, is restricted to `http://127.0.0.1:43239`, writes only to direction-specific OS-temporary output, and cannot target `https://v-b.tech`.

For both directions, with the public submission flag both false and true, the shared contour throws before Astro can emit an artifact. The legal register therefore cannot render an ACTIVE overclaim, and no form, ACTIVE copy, runtime, site key, or request-capable client can be produced. Both direction-specific output directories remain absent after the restored tests.

## TDD and mutation evidence

Focused RED was captured before production implementation:

- legal package: 98 collected, 88 passed and 10 expected failures because the shared contour did not exist;
- mixed build suite: 2/2 expected failures because the required incoherent-contour error was absent;
- after the first implementation, the recursive ACTIVE artifact check produced one expected failure because the ACTIVE client bundle retained real-registry DRAFT material through a side-effectful import.

The latter was fixed by extracting the contour into a pure module used by the private ACTIVE alias. Focused GREEN after restoration:

- legal package: 98/98;
- mixed build suite: 2/2, covering both mixed directions and public flag off/on;
- private ACTIVE artifact: 8/8;
- normal DRAFT contact shell/legal pages: 52/52;
- legal and web typechecks: pass.

Deliberate current-release mutations proved both required documents participate in the decision:

- removing PD01 participation caused 6 legal failures and both mixed tests to fail; both invalid contours emitted nine-page output;
- removing PD02 participation caused 3 legal failures and both mixed tests to fail; both invalid contours emitted nine-page output;
- restoring the implementation returned legal to 98/98 and mixed builds to 2/2 fail-closed with no output directories.

## Artifact evidence

Fresh default/DRAFT build:

- exactly 9 HTML files;
- exactly 0 JS/MJS files;
- no request-capable contact runtime is emitted;
- the real RU/EN DRAFT legal content and disabled contact copy remain unchanged.

`PUBLIC_CONTACT_SUBMISSION_ENABLED=true` plus a valid public site key against the actual DRAFT registry still fails with the exact error:

```text
Draft consent VBT-PD-02/DRAFT cannot be used when submission is enabled
```

Fresh private all-ACTIVE build:

- exactly 9 HTML files;
- exactly 1 shared request-capable JS file, `_astro/page.Bn1yqMUU.js`, SHA-256 `477c5de536489710ea389b94445c065433e1bc344a3cf50882bfe8dd5adc9c98` in the final observed build;
- exactly one request-capable client initializes the official SmartCaptcha lifecycle and same-origin `/api/contact` contract;
- required RU/EN ACTIVE copy and exact synthetic current PD01/PD02 identities are present;
- the exhaustive DRAFT, disabled, no-transmission, cannot-accept, fixture marker/key, secret-name, and developer-path checks pass.

## Runbook and release boundary

The activation runbook now requires PD01 and PD02 to be reviewed, approved, published, and selected atomically through the code-enforced shared contour. It explicitly rejects either mixed direction before artifact publication and retains the existing active UI/legal-copy review, public SmartCaptcha site-key, handler/backend/provider/deploy, smoke, and rollback gates.

The real DRAFT legal documents were not edited or activated. No SmartCaptcha provider validation, Postbox/IAM call, database, function/timer, Timeweb/Caddy, DNS/TLS, deployment, public smoke, external mailbox, GitHub publication, or real visitor data was used.

## Final verification

- root lint: 3/3 tasks;
- root typecheck: 8/8 tasks;
- root unit graph: 475/475 — web 202, legal-documents 98, contact-function 130, contracts 33, email 6, content 6;
- root build: 2/2 tasks;
- package-manager contract: 7/7 tasks using repository-local pnpm 11.10.0;
- full browser: standard 95 passed/11 intentional desktop-only skips, internal fixture 65 passed/1 intentional desktop-only skip, production-shaped ACTIVE 8/8 — 168 passed and 12 intentional skips overall;
- public flag + DRAFT: expected exact failure, followed by a fresh normal 9 HTML/0 JS-MJS artifact;
- mixed contours: both directions fail before output with public flag off/on;
- active production-shaped artifact: 9 HTML/1 shared JS and all exhaustive forbidden-material checks pass;
- no database, Mailpit, or other service was started for this wave.

# v-b.tech ACTIVE Contact Release Design

Date: 2026-08-23  
Status: approved for implementation by the site owner

## Outcome

Publish the existing RU/EN Astro site with an ACTIVE personal-data contour and an enabled contact form on the existing production infrastructure. No new VM, PostgreSQL cluster, or public DNS change is introduced.

The release is accepted only when the exact immutable web and function artifacts are deployed, the public handler is enabled before the web form, the public legal pages expose the approved identities, and one controlled non-sensitive browser submission is delivered through Postbox.

## Owner decisions

- The Roskomnadzor notification has been submitted and is being registered. The owner authorizes collection without waiting for registry completion.
- Operator details are confirmed without changes:
  - Богатырев Владислав Сергеевич
  - 353745, Краснодарский край, Ленинградский район, ст. Ленинградская, ул. Грузская, д. 26
  - hello@v-b.tech
  - +7 934 355-14-90
  - https://v-b.tech
- The ACTIVE effective date is 2026-08-23.
- The paired release identities are:
  - `VBT-PD-01/2026.08/01`
  - `VBT-PD-02/2026.08/01`
- The owner is the operational approver for this release. Repository evidence records that approval; it does not represent independent legal advice.

## Chosen approach

Use one coordinated release with two independently reversible production mutations:

1. publish immutable ACTIVE web and function artifacts;
2. retain a verified immutable disabled web artifact as rollback target;
3. enable and privately verify the backend while the public web remains disabled;
4. deploy the enabled ACTIVE web artifact;
5. verify public legal identities, release headers, CSP, route behavior, and one controlled submission;
6. roll back the web first and backend second if acceptance fails.

This preserves the requested immediate activation while avoiding a simultaneous big-bang change. A manual unrecorded rebuild on the server and a single combined backend/web mutation are rejected because they weaken provenance and rollback.

## Legal publication contract

The registry contains one ACTIVE release per document code, with the paired identities and effective date above. RU is authoritative; EN is the matched informational translation.

The published text describes the actual enabled flow, not a future or draft flow. All draft-only language, unverified-provider placeholders, and statements that submission is disabled are removed. The text keeps the narrow scope already implemented:

- visitor-provided name, email or Telegram contact, and message;
- bounded operational metadata, CAPTCHA verification result, rate-limit digest, delivery state, and provider message IDs;
- no attachments, analytics, advertising, profiling, CRM transfer, or lead enrichment;
- Russian primary storage, no intended cross-border transfer;
- one-year correspondence limit and shorter encrypted delivery-payload lifecycle;
- Yandex Cloud, Cloud Postbox, SmartCaptcha, and the operator mailbox provider as the production provider categories.

## Immutable artifact contract

Publication receives an explicit `disabled|enabled` state. For `enabled`, the build must bind:

- exact release commit;
- `VBT-PD-02/2026.08/01` consent identity;
- non-empty public SmartCaptcha site key supplied only at release time;
- immutable GHCR image digest;
- deterministic function archive digest.

The manifest validates the state and consent identity extracted from the actual generated pages. It never stores a secret value. Existing immutable tags cannot be replaced.

## Production executor contract

The executor may mutate only the existing reviewed v-b.tech targets. It must fail closed unless the current inventory, prior state, target artifact identities, approval flag, and rollback target match exactly. It must not change Markiro resources, DNS, the database cluster, or the security group.

Backend activation updates only the v-b.tech function revisions/public invocation required by the approved runtime. Web activation updates only the existing v-b.tech service and exact Caddy routing integration. Every mutation records bounded metadata: target IDs, prior/new revision or digest, release SHA, state, operator, and UTC timestamps; no secrets or visitor content are recorded.

## Verification and rollback

Before production:

- legal registry and RU/EN parity tests;
- ACTIVE artifact and mixed-contour fail-closed tests;
- release-manifest and workflow contracts;
- full unit, type, lint, build, and browser suites;
- private backend and web smoke.

After production:

- six-route ACTIVE legal evidence;
- generic enabled route smoke;
- one controlled non-sensitive UI submission;
- Postbox acceptance and operator mailbox receipt;
- confirmation behavior for an owner-controlled test address;
- content-free worker/timer telemetry.

If any enabled-web acceptance fails, redeploy the verified disabled web artifact first. Then disable backend acceptance while allowing already accepted delivery work to finish unless incident handling requires a stop.

## Printable documents

Printable archival copies are useful but not a prerequisite for safe activation. After the exact ACTIVE text is stable, generate DOCX/PDF copies from the approved templates in `brand/word`, preserving the approved v-b.tech wordmark. Treat visual rendering and legal-text approval as separate checks.

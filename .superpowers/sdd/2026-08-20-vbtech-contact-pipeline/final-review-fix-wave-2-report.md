# Final review fix wave 2 report

Date: 2026-08-21

## Finding verification

The final re-review finding was correct. The guarded ACTIVE production-shaped build enabled the real contact form and emitted its client, but the shared landing content still described an unavailable draft shell, no transmission, and a consent that could not be accepted. The private ACTIVE alias also changed only the consent release metadata while rendering real DRAFT policy/consent bodies, and the shared legal layout, document metadata, and register hard-coded DRAFT labels.

The full re-review and UX-copy guidance were read before edits. The copy change follows the clear, concise, consistent, useful, and human principles and does not claim secure transmission, retention, a guaranteed response, or any unapproved legal wording.

## State-aware content design

`SITE_CONTENT` remains the single shared RU/EN content model. Its existing DRAFT fields are byte-for-byte unchanged. A typed `activeSubmission` override contains only the phrases whose meaning changes when submission is genuinely ready; `resolveContactContent` returns the original object unchanged for DRAFT and merges the active values only when the same production readiness result enables the form.

The ACTIVE mapping is:

- direct context: RU `Отправьте обращение через форму ниже или свяжитесь напрямую по email или в Telegram.`; EN `Send an enquiry using the form below, or contact me directly by email or Telegram.`;
- title: RU `Отправить обращение`; EN `Send an enquiry`;
- note: accurately states that entered data is transmitted so the enquiry can be answered and points to the current policy and consent, without a security or response guarantee;
- consent link: RU `согласием на обработку персональных данных`; EN `personal data processing consent`;
- instruction/context/error: asks the visitor to review and accept the current consent and never describes a draft, disabled submission, no transmission, or a consent that cannot be accepted;
- success wording drops the DRAFT qualifier.

The same production `AboutContact` and `ContactForm` render both states. The real current legal registry remains DRAFT, so the normal public build still receives the exact original DRAFT content and never initializes the client.

## Synthetic ACTIVE legal contour

The private alias now supplies coherent, clearly synthetic ACTIVE releases for both `VBT-PD-01/2099.01/01` and `VBT-PD-02/2099.01/01`, revision `2099.01/01`, effective date `2099-01-01`. Its RU/EN bodies state the test-only/private boundary and contain none of the real DRAFT or not-in-force phrases.

The production legal components are status-aware: the register, layout banner, document status, and effective-date metadata render the supplied legal state. The alias still requires its explicit private guard, exact loopback origin, OS-temporary output, and reviewed fixture public site key; it still cannot target `https://v-b.tech` or be selected by the public flag alone. No internal fixture data attribute or secret is emitted.

## TDD and mutation evidence

Focused RED was captured before production edits:

- content model: one failure because active copy did not exist;
- ACTIVE artifact: two RU/EN landing-copy failures plus two legal/global forbidden-phrase failures;
- ACTIVE browser: four RU/EN landing-copy failures across Desktop Chrome and Pixel 7, while both exact POST/captcha lifecycle tests remained green;
- existing DRAFT copy assertions remained green.

Focused GREEN after implementation:

- content: 6/6;
- ACTIVE artifact: 8/8;
- normal DRAFT contact shell and legal pages: 52/52;
- ACTIVE browser: 8/8, covering RU/EN landing pages and every RU/EN legal register, privacy, and consent route on desktop and mobile.

A deliberate reintroduction of the RU unavailable-form phrase into the ACTIVE override produced exactly three expected failures: the exact content assertion, RU ACTIVE landing assertion, and exhaustive ACTIVE HTML deny-list. The mutation was restored and the focused content/artifact suites returned to 6/6 and 8/8.

## Artifact evidence

Fresh default/DRAFT build:

- exactly 9 HTML files;
- exactly 0 JS/MJS files;
- recursive deny-list has zero hits for `/api/contact`, SmartCaptcha endpoint/API/client markers, reviewed or fixture public key, enabled/fixture markers, request-capable fetch/XHR/beacon, server secret names, or developer-home paths;
- exact original RU/EN DRAFT landing/legal wording remains present.

`PUBLIC_CONTACT_SUBMISSION_ENABLED=true` plus a valid public site key against the actual DRAFT registry still fails with the exact error:

```text
Draft consent VBT-PD-02/DRAFT cannot be used when submission is enabled
```

Fresh private ACTIVE build:

- exactly 9 HTML files;
- exactly 1 shared request-capable JS file, `_astro/page.BlnKalNO.js` in the observed build;
- required RU/EN ACTIVE landing copy and both synthetic ACTIVE identities are present;
- the exhaustive DRAFT/disabled/no-transmission/cannot-accept/fixture/secret/developer-path scan has zero hits;
- the one shared client still contains the exact same-origin `/api/contact` path and official SmartCaptcha loader.

## Runbook and release boundary

The activation runbook now requires an explicit approved review of the state-aware RU/EN interface and legal copy, including landing context, title/note, link labels, consent instruction/context/error, register, banner, metadata, and all legal pages. The private ACTIVE gate requires the exact approved ACTIVE copy and rejects all DRAFT, disabled, no-transmission, and cannot-accept wording.

The real DRAFT legal documents were not edited or activated. No SmartCaptcha provider validation, Postbox/IAM call, managed database, backend activation, cloud function/timer, Timeweb/Caddy, DNS/TLS, deployment, public smoke, external mailbox, GitHub publication, or real visitor data was used.

## Final verification

- root lint: 3/3 tasks;
- root typecheck: 8/8 tasks;
- root unit graph: 463/463 — web 200, contact-function 130, legal-documents 88, contracts 33, email 6, content 6;
- root build: 2/2 tasks;
- package-manager contract: 7/7 tasks using repository-local pnpm 11.10.0;
- full browser: standard 95 passed/11 intentional desktop-only skips, internal fixture 65 passed/1 intentional desktop-only skip, production-shaped ACTIVE 8/8 — 168 passed and 12 intentional skips overall;
- public flag + DRAFT: expected exact failure, followed by a fresh normal 9 HTML/0 JS-MJS zero-hit deny-list scan;
- active production-shaped artifact: 9 HTML/1 shared JS and zero forbidden phrase/fixture/secret hits;
- `git diff --check`: pass;
- no database or mail service was started for this wave.

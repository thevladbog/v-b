# Task 7 report — disabled contact shell and accessible navigation

## Scope and result

- Base: `2887cd543d9f3b19a37db395cafbbea4b20fee6c`.
- Commit subject: `feat: add accessible contact and navigation shell`.
- Resulting commit SHA is recorded in the handoff after the commit is created.
- Implemented only the disabled contact shell, bounded validation/readiness, typed RU/EN copy, progressive navigation, and necessary generated-output/type integration.
- No contact backend, captcha, analytics, cookies, infrastructure, deployment, DNS, or Task 8 browser work was added.

## Copy, form, and navigation inventory

- Extended `SiteContent.contact` for both locales with direct-contact context, form title, field instructions, data-safety warning, disabled explanation, consent/policy link copy, draft context, summary, and per-field errors. Recursive localized-string completeness remains active.
- Direct `https://t.me/thevladbog` and `mailto:hello@v-b.tech` links remain active and precede the form.
- Added native `form`, `fieldset`, `label`, `input`, `textarea`, checkbox, and submit controls. The form contract is `method="post"`, `action="/api/contact"`, `novalidate`, `data-contact-form`.
- Field order and limits are name (100), contact (254), message (4,000), consent. Contact accepts a simple email or Telegram `@[A-Za-z0-9_]{5,}`. Whitespace is trimmed only inside validation; entered DOM values are not rewritten.
- Each control has an explicit label and persistent instruction/error nodes referenced through `aria-describedby`; errors use localized `data-error-message` values.
- Consent starts unchecked and required, links separately to the localized policy and consent draft, and visibly states that `VBT-PD-02/DRAFT` is not in force and cannot yet be accepted.
- Added a localized warning against passwords, payment details, legally protected secrets, special-category personal data, and unnecessary confidential information; attachments are explicitly unsupported.
- Added a localized mobile menu button with stable `site-navigation-toggle` / `site-navigation` IDs and localized open/close labels.

## Disabled and legal boundary

- `PUBLIC_CONTACT_SUBMISSION_ENABLED` is an Astro type-safe public client boolean with default `false`; generated Astro env types are included by the web tsconfig.
- `resolveContactSubmissionReadiness()` calls `assertContactConsentPublishable()` using the imported `CURRENT_CONTACT_CONSENT_ID`; the consent identity is not duplicated in env.
- Default HTML emits `data-submission-enabled="false"`, a disabled native fieldset, and a disabled submit button. Disabled controls are removed from the tab order; direct contact and legal links remain ordinary links.
- Client form binding attaches only to `data-submission-enabled="true"`. It performs validation and allows a valid native POST; it contains no request implementation.
- Fresh fail-closed proof: `CI=true PUBLIC_CONTACT_SUBMISSION_ENABLED=true corepack pnpm --filter @vbtech/web build` exited 1 with `Draft consent VBT-PD-02/DRAFT cannot be used when submission is enabled` while rendering `/en`.
- A default build was run immediately afterward and completed with eight static pages.

## Accessibility decisions

- Native semantics are used instead of custom ARIA widgets.
- The default disabled fieldset and submit button are not focusable; no inert overlay, modal role, or focus trap exists.
- Empty error nodes remain present. Invalid future-enabled submission prevents the native submit, applies `aria-invalid`, fills localized errors and an error summary, and focuses the first invalid control. Valid input clears prior errors and is not prevented.
- A separate polite atomic status region remains in the form; the error summary uses `role="alert"`.
- No-JS navigation is visible because the navigation has no initial `hidden` attribute and the menu button is initially hidden. Enhancement reveals the button only at the mobile media query and starts the menu closed.
- Menu state updates `aria-expanded`, localized `aria-label`, native `hidden`, and open-state classes. Link activation closes it; Escape closes only an open mobile menu and restores button focus. Desktop transition clears mobile-open state. Modern and legacy media-query listeners are covered.
- Navigation is not a dialog and does not trap focus; normal Tab movement can leave it.
- Primary controls use at least 44px (`2.75rem`) targets and visible global `:focus-visible` outlines. The skip target `main` has `tabindex="-1"`, and focus/target scroll margins clear the sticky header.
- Manual keyboard, mobile viewport, zoom, screen-reader, high-contrast, and axe acceptance were deliberately not claimed; they belong to Task 8.

## TDD evidence

### Form state

- RED: `CI=true corepack pnpm --filter @vbtech/web test -- form-state.test.ts` built the existing site, then failed the suite with `Cannot find module '../src/lib/form-state.js'`; 92 pre-existing tests passed.
- GREEN: the same command passed 6 files / 106 tests after the bounded implementation.
- Covered normalization, blank values, deterministic DOM order, both locales, email/Telegram validity, exact maximums and one-over boundaries, disabled readiness, and true-with-draft failure.

### Navigation

- RED: `CI=true corepack pnpm --filter @vbtech/web test -- navigation.test.ts` failed with `Cannot find module '../src/scripts/navigation.js'`; 106 other tests passed.
- An initial GREEN attempt exposed a fake media-query initialization error in the test harness (legacy listener was undefined). The fake was corrected without changing the contract.
- GREEN: the same command then passed 7 files / 112 tests, covering initial closed state, localized open/close state, link close, Escape plus focus restoration, desktop reset, modern listener cleanup, and legacy listener cleanup.

### Typed content, env, and generated output

- RED content: `CI=true corepack pnpm --filter @vbtech/content test` failed 2 locale cases because `contact.errors` was absent.
- RED web integration: the form/menu/env build tests failed because no form or enhanced navigation markup existed and the env field was undefined.
- Subsequent targeted runs caught missing legal-link route keys, unwanted legal-registry text in the browser bundle, an outdated inline-only theme-runtime assertion, warning placement, a global rather than contact-local mailto count, and whitespace lost around inline legal links. Each failure was corrected at its boundary.
- Client binding RED: `CI=true corepack pnpm --filter @vbtech/web test -- contact-form.test.ts` failed 2 tests with `bindContactForm is not a function`.
- Client binding GREEN: the same command passed 9 files / 120 tests after extracting the bounded binder.
- Consent text RED: generated RU/EN tests exposed `сполитикой` / `thepersonal`; explicit text-node spaces fixed the rendered copy.
- Final generated-output GREEN: `CI=true corepack pnpm --filter @vbtech/web test -- contact-shell.test.ts` passed 9 files / 120 tests.

## Final gates

- `CI=true corepack pnpm --filter @vbtech/web test -- form-state.test.ts` — exit 0; 9 files, 120 tests passed (the package script runs the complete Vitest suite after the build).
- `CI=true corepack pnpm --filter @vbtech/content test` — exit 0; 1 file, 4 tests passed.
- `CI=true corepack pnpm --filter @vbtech/web typecheck` — exit 0; 33 files, 0 errors, 0 warnings, 0 hints.
- `CI=true corepack pnpm --filter @vbtech/web build` — exit 0; 8 static pages built.
- `CI=true corepack pnpm test` — exit 0; 3 package tasks successful. Web: 120 tests; content: 4 tests; legal documents: 34 tests (legal task replayed from the local Turbo cache).
- `git diff --check` — recorded after this report is added and before commit.

## Generated HTML and JavaScript inspection

- RU and EN form tags both emitted exact POST/action/novalidate attributes, `data-submission-enabled="false"`, and `data-consent-identity="VBT-PD-02/DRAFT"`.
- Both emitted a disabled fieldset and disabled submit button, active Telegram/email links, two localized legal links, and readable localized consent copy.
- RU/EN menu buttons emitted hidden with localized open/close labels and stable controls/target IDs. Both navigation elements emitted without `hidden`, preserving no-JS access.
- The final default build emitted two inline module instances and no external JavaScript file. Combined inspected runtime size was 7,254 bytes.
- Inspection found no `fetch(`, `XMLHttpRequest`, `.sendBeacon(`, SmartCaptcha/remote captcha identifiers, or remote script source in the landing HTML/runtime.
- Client-safe validation is isolated from build-time legal readiness so the legal registry and its draft provider discussion are not shipped into the landing runtime.

## Task 8 concerns and unrun acceptance

- Run real keyboard checks at desktop/mobile breakpoints, including resize while open, Escape focus restoration, and tabbing out of the menu.
- Verify VoiceOver/NVDA announcements for instruction/error associations, alert summary, and polite status region.
- Verify 200% zoom, reflow, visible focus not obscured by the sticky header, target sizes, reduced motion, and high-contrast behavior.
- Run axe/Lighthouse and the planned browser suite against both locale roots and legal routes.
- Visually review the longer form panel on narrow screens and both themes.
- Do not enable submission until the consent has a publishable active identity and the separate backend/captcha/deployment plan passes its own release gates.

## Review fix round 1 — 2026-08-20

This appendix supersedes the earlier statement that valid submitted DOM values are never rewritten. Values remain untouched while typing and after an invalid submit attempt; immediately before a valid native POST, name, contact, and message are trimmed in the DOM so the submitted payload is normalized.

### Reviewer findings addressed

1. **Enhanced mobile navigation hiding.** The generated CSS now contains `[hidden] { display: none !important; }`. This author-level important rule wins over the existing `.site-navigation { display: flex; }` rule when the navigation binding sets `hidden`, while the source HTML still omits `hidden` from the nav so no-JS links remain visible.
2. **Canonical consent identity ownership.** Both localized `consentDraftContext` strings now contain wording only and no `VBT-PD-*` identity. `ContactForm.astro` renders `readiness.consentIdentity` in a separate `data-contact-consent-identity` span and uses the same value for the form data attribute. Tests import `CURRENT_CONTACT_CONSENT_ID` from `@vbtech/legal-documents`, compare generated HTML against it, reject any `VBT-PD-*` string in `SITE_CONTENT`, and verify that the identity is absent from client JavaScript.
3. **Submit-time normalization.** The contact binder validates the original DOM values first. Invalid submission prevents default, preserves all typed whitespace, reports errors, and focuses the first invalid control. A valid submission trims name and message and applies `normalizeContact()` to contact immediately before allowing the native POST.

### Round 1 TDD evidence

- RED content: `CI=true corepack pnpm --filter @vbtech/content test` failed 1 of 5 tests because serialized localized content still contained `VBT-PD-02/DRAFT`.
- RED web: `CI=true corepack pnpm --filter @vbtech/web test -- contact-shell.test.ts contact-form.test.ts` failed 4 tests: valid values remained untrimmed, two locale pages lacked the separate consent identity node, and generated CSS lacked `[hidden]` `display:none!important`.
- GREEN content: the same content command passed 1 file / 5 tests.
- GREEN web: the same focused web command passed 9 files / 122 tests.

### Round 1 final gates and artifact inspection

- Focused web tests: exit 0; 9 files / 122 tests.
- Content tests: exit 0; 1 file / 5 tests.
- Web typecheck: exit 0; 33 files, 0 errors, 0 warnings, 0 hints.
- Default web build: exit 0; 8 static pages.
- Root tests: exit 0; 3 package tasks successful. Web 122 tests, content 5 tests, legal documents 34 tests.
- Expected fail-closed build with `PUBLIC_CONTACT_SUBMISSION_ENABLED=true`: exit 1 with `Draft consent VBT-PD-02/DRAFT cannot be used when submission is enabled`; a default build immediately afterward returned exit 0.
- Generated CSS inspection: `.site-navigation` still resolves to authored `display:flex`; `[hidden]` resolves to authored `display:none!important`.
- Generated RU and EN inspection: both contain the registry-derived consent identity in the form attribute and separate visible node, disabled fieldsets, and navigation without initial `hidden`.
- Generated client runtime: 7,402 bytes inspected; canonical consent identity absent; no `fetch`, `XMLHttpRequest`, `sendBeacon`, captcha identifier, or remote script.
- `rg` found no `VBT-PD-*` identity under `packages/content`.
- `git diff --check`: exit 0 before report staging.

Task 8 manual browser, screen-reader, axe, zoom, high-contrast, and viewport acceptance remains unrun and unchanged.

## Final whole-branch review fix wave 2 — 2026-08-21

### Finding addressed

- The two consent/policy anchors now have the shared `contact-consent-action` class plus distinct `data-contact-consent-link="policy"` and `"consent"` markers. They remain native anchors with separate localized targets and no button role.
- Inside the existing `max-width: 40rem` landing breakpoint, each action is `inline-flex`, vertically centered, and has `min-height: 2.75rem` (44px at the root 16px size). The mobile-only rule preserves ordinary inline text-link layout and wrapping on wider screens; it adds no button chrome or misleading widget semantics.
- The explicit Astro whitespace nodes around both anchors remain in place. Generated RU/EN tests still compare the complete contiguous consent sentence, so link styling cannot silently concatenate adjacent words.
- The disabled fieldset and submit button, active legal links, direct Telegram/email contacts, draft wording, separate localized URLs, and no-contact-network boundary are unchanged.

### TDD evidence

- RED: `CI=true corepack pnpm --filter @vbtech/web test -- contact-shell.test.ts` exited 1 with 3 failures while 142 tests passed. Both localized generated pages returned no `data-contact-consent-link` nodes (`[]` versus `["policy", "consent"]`), and generated CSS had no `.contact-consent-action` `display` declaration (`undefined` versus `inline-flex`).
- GREEN: after the markup and mobile CSS change, the same command exited 0 with 11 files / 145 tests.
- The generated-CSS assertion was then tightened to inspect the `40rem` media block specifically. Its first run exposed that the helper selected the first of several generated mobile blocks (1 failure / 144 passing), not a product defect; the helper now enumerates matching media blocks and selects the block containing the contact selector. The final focused run again passed 11 files / 145 tests.

### Final-wave gates and emitted-artifact inspection

- Content unit: `CI=true corepack pnpm --filter @vbtech/content test` — exit 0; 1 file / 5 tests.
- Web unit/generated output: `CI=true corepack pnpm --filter @vbtech/web test -- contact-shell.test.ts` — exit 0; 11 files / 145 tests (the package script builds and runs the complete web Vitest suite).
- Content typecheck: `CI=true corepack pnpm --filter @vbtech/content typecheck` — exit 0.
- Web typecheck: `CI=true corepack pnpm --filter @vbtech/web typecheck` — exit 0; 39 files, 0 errors, 0 warnings, 0 hints.
- Default web build: `CI=true corepack pnpm --filter @vbtech/web build` — exit 0; 9 page outputs reported.
- Expected enabled-submission build: `CI=true PUBLIC_CONTACT_SUBMISSION_ENABLED=true corepack pnpm --filter @vbtech/web build` — expected exit 1 with `Draft consent VBT-PD-02/DRAFT cannot be used when submission is enabled`. A fresh default build immediately afterward exited 0.
- Generated RU HTML contains policy `/privacy/` and consent `/personal-data-consent/`; generated EN HTML contains `/en/privacy/` and `/en/personal-data-consent/`. Each anchor has its distinct data marker and the shared action class; unit inspection confirms no `role` override and exact contiguous localized sentences.
- Generated CSS inspection found `.contact-consent-action{...min-height:2.75rem;display:inline-flex}` inside the emitted `width<=40rem` block.
- Generated HTML/JavaScript search found no `fetch(`, `XMLHttpRequest`, `sendBeacon(`, SmartCaptcha, Yandex captcha, or reCAPTCHA identifier (expected `rg` exit 1/no matches).
- `git diff --check` — exit 0 before report staging. No file under `tools/browser` was edited, and browser measurement remains assigned to Task 8 as requested.

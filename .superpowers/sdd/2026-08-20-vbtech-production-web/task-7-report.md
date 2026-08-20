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

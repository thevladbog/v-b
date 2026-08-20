# Personal Landing Mockup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a bilingual, accessible, static personal-portfolio mockup that applies the approved revision brief while preserving the supplied v-b.tech industrial identity.

**Architecture:** Semantic HTML provides the stable page structure, a single CSS file owns the visual system and responsive states, and ES modules provide content, locale selection, navigation, and local-only form behavior. Pure locale and validation functions are tested with Node’s built-in test runner; browser checks cover the rendered mockup.

**Tech Stack:** HTML5, CSS, vanilla JavaScript ES modules, Node.js built-in test runner, local static server.

**Spec:** `docs/superpowers/specs/2026-08-20-personal-landing-mockup-design.md`

## Global Constraints

- Treat the result as an evaluation mockup, not production or Astra code.
- Do not add runtime or development dependencies.
- Do not transmit form data.
- Preserve supplied product marks and the v-b.tech signal-dash identity.
- Support Russian and English with browser default and persistent manual selection.
- Meet WCAG AA for normal text and keep interactive targets at least 44px high.
- The directory is not a Git repository, so commit steps are intentionally unavailable.

---

### Task 1: Locale and form behavior

**Files:**
- Create: `site/content.js`
- Create: `site/app.js`
- Create: `site/app.test.js`

**Interfaces:**
- Produces: `resolveLocale({ storedLocale, browserLocale }): 'ru' | 'en'`
- Produces: `validateContactForm({ name, contact, message }, locale): { valid: boolean, errors: Record<string, string> }`
- Produces: `content.ru`, `content.en`, and `cases.ru`, `cases.en`

- [ ] **Step 1: Write failing tests** for saved-locale priority, Russian browser fallback, English fallback, empty fields, invalid contact details, and valid submission.
- [ ] **Step 2: Run `node --test site/app.test.js`** and confirm failure because `site/app.js` does not exist.
- [ ] **Step 3: Implement the pure functions and content dictionaries** with no DOM side effects during Node import.
- [ ] **Step 4: Run `node --test site/app.test.js`** and confirm all tests pass.
- [ ] **Step 5: Add guarded DOM initialization** that applies translations, persists locale, controls the mobile menu, and renders local form feedback.

### Task 2: Semantic landing structure

**Files:**
- Replace: `site/index.html`

**Interfaces:**
- Consumes: translation keys and case identifiers from `site/content.js`
- Produces: stable `[data-i18n]`, `[data-case]`, locale-button, menu-button, and form hooks used by `site/app.js`

- [ ] **Step 1: Add a static-contract test** asserting one main landmark, one h1, skip link, three selected cases, locale controls, and required form fields.
- [ ] **Step 2: Run the test** and confirm the current catalogue page fails the new structure contract.
- [ ] **Step 3: Replace the document structure** with header, hero, proof, selected work, more projects, expertise, approach, about/contact, and footer.
- [ ] **Step 4: Run the contract and behavior tests** and confirm they pass.

### Task 3: Visual system and responsive states

**Files:**
- Create: `site/styles.css`
- Modify: `site/index.html`

**Interfaces:**
- Consumes: semantic classes from `site/index.html`
- Produces: desktop and mobile layouts, signal-field hero, project interface illustrations, focus states, reduced-motion behavior, and open-menu state.

- [ ] **Step 1: Define graphite, amber, semantic, typography, spacing, and motion tokens.**
- [ ] **Step 2: Implement the editorial desktop layout** and retain the signal-dash/barcode signature.
- [ ] **Step 3: Implement 900px and 600px responsive states** with a 44px mobile menu and stacked content.
- [ ] **Step 4: Add `:focus-visible`, AA colors, immediate anchor visibility, and `prefers-reduced-motion`.**
- [ ] **Step 5: Run automated tests** to ensure CSS integration did not break the document contract.

### Task 4: Browser verification

**Files:**
- Modify only when a verified browser defect is found: `site/index.html`, `site/styles.css`, `site/app.js`

**Interfaces:**
- Consumes: complete static mockup
- Produces: verified desktop and mobile artifact for user review

- [ ] **Step 1: Start a local static server on an unused port** without stopping the existing localhost process.
- [ ] **Step 2: Verify 1440x900 desktop**: hero hierarchy, language switching, menu anchors, three cases, form errors, and local success state.
- [ ] **Step 3: Verify 390x844 mobile**: no horizontal overflow, 44px targets, compact menu, readable case layouts, and repeated contact CTA.
- [ ] **Step 4: Inspect DOM semantics, console errors, contrast-critical styles, and reduced-motion CSS.**
- [ ] **Step 5: Run fresh final tests and report which checks passed and which remain outside mockup scope.**

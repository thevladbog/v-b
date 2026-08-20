<p align="center">
  <a href="#v-btech" aria-label="v-b.tech repository overview">
    <img src="brand/logos/vb-mark-tile.svg" width="112" height="112" alt="v-b.tech signal dash monogram">
  </a>
</p>

<h1 align="center">v-b.tech</h1>

<p align="center">
  End-to-end product engineering: from product discovery and UX to architecture, delivery, and operational support.
</p>

<p align="center">
  <img alt="Astro 7.1.6" src="https://img.shields.io/badge/Astro-7.1.6-BC52EE?logo=astro&logoColor=white">
  <img alt="TypeScript 5.9.3" src="https://img.shields.io/badge/TypeScript-5.9.3-3178C6?logo=typescript&logoColor=white">
  <img alt="pnpm 11.10.0" src="https://img.shields.io/badge/pnpm-11.10.0-F69220?logo=pnpm&logoColor=white">
  <img alt="Russian and English" src="https://img.shields.io/badge/i18n-RU%20%2F%20EN-4C9AF0">
  <img alt="WCAG 2.2 AA" src="https://img.shields.io/badge/accessibility-WCAG%202.2%20AA-34C77B">
</p>

## What v-b.tech covers

This repository contains the v-b.tech website and the contracts that support its privacy and contact boundaries. The site presents selected work across operational software, queues, identity, logistics, retail, and hardware-integrated systems. The engineering practice is not limited to one industry.

The production web phase is complete. Contact submission remains disabled until the personal-data documents are approved and the contact delivery pipeline is deployed.

## Production web highlights

The current release establishes the complete static web surface and its automated acceptance gates:

- Canonical Russian and English routes built with Astro.
- Persistent light, dark, and system theme modes.
- Local IBM Plex fonts with no third-party runtime assets.
- Typed bilingual content and shared project facts.
- Versioned privacy and personal-data consent documents.
- Progressive navigation and a keyboard-accessible contact shell.
- Deterministic `robots.txt`, `sitemap.xml`, `llms.txt`, and branded `404.html` artifacts.
- Desktop Chrome and Pixel 7 acceptance across all nine HTML routes.
- Web Content Accessibility Guidelines (WCAG) 2.2 A/AA, 44 px target, same-origin request, and console-error gates.

## Technology choices

The workspace uses a small static stack with pinned direct dependencies:

| Area | Choice |
| --- | --- |
| Web | Astro 7, static output |
| Language | TypeScript 5.9 |
| Workspace | pnpm 11, Turborepo |
| Tests | Vitest, Playwright, axe-core |
| Content | Typed RU/EN packages |
| Fonts | Self-hosted IBM Plex Sans and Mono |

Direct dependency versions are pinned. The workspace also verifies that Turbo package tasks use the repository-local pnpm runtime instead of an ambient global installation.

## Repository structure

The monorepo separates public pages, content, legal documents, and browser acceptance:

```text
apps/web/                 Astro website and generated public artifacts
packages/content/         Typed bilingual site content
packages/legal-documents/ Versioned legal documents and lifecycle guards
tools/browser/            Desktop and mobile browser acceptance
brand/                    Brand board, tokens, and v-b.tech marks
prototype/                Preserved approved landing prototype
docs/                     Specs, plans, reviews, and operational notes
```

## Public routes

The generated site exposes two indexable landing routes and draft-only legal routes:

| Route | Purpose | Index policy |
| --- | --- | --- |
| `/` | Russian landing page | Indexable |
| `/en/` | English landing page | Indexable |
| `/privacy/`, `/en/privacy/` | Privacy drafts | `noindex,nofollow` |
| `/personal-data-consent/`, `/en/personal-data-consent/` | Consent drafts | `noindex,nofollow` |
| `/legal/`, `/en/legal/` | Legal document registers | `noindex,nofollow` |
| `/404.html` | Bilingual recovery page | `noindex,nofollow` |

Only the two landing routes are included in the sitemap while the legal documents remain drafts.

## Local development

Run the site from the repository root. You need:

- Node.js 24 or newer.
- Corepack enabled.

Install the pinned workspace:

```bash
corepack pnpm install --frozen-lockfile
```

Start the Astro development server:

```bash
corepack pnpm --filter @vbtech/web exec astro dev
```

Build the static site:

```bash
corepack pnpm build
```

## Quality gates

Run the canonical checks from the repository root:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

The canonical test command runs unit and generated-artifact contracts first, then the Desktop Chrome and Pixel 7 Playwright projects serially. A local Chromium installation compatible with Playwright is required for the browser gate.

## Privacy boundary

The web release keeps contact processing unavailable until its legal and operational dependencies are ready:

- Contact submission is disabled by default and fails closed.
- Draft consent cannot be used to activate submission.
- No captcha or contact request client is shipped while submission is disabled.
- Legal documents have no invented revision or effective date.
- No analytics, tracking pixels, cookie banner, or remote font requests are included.

The legal text and operator details require owner, legal, and provider review before publication or form activation.

## Roadmap

The next phases add contact delivery and production infrastructure in this order:

1. Build and locally verify the encrypted, idempotent contact and email pipeline.
2. Review branded Russian and English notification and confirmation emails.
3. Approve and activate the personal-data documents.
4. Deploy the static site and contact function without adding a new virtual machine.
5. Configure external DNS and complete production accessibility checks.

Deployment, DNS changes, legal activation, and live contact processing are intentionally outside the current web release.

## Brand system

The identity uses a signal dash: the hyphen in v-b.tech becomes an amber operational indicator that connects digital product work with physical systems. The visual system combines graphite surfaces, Signal Amber, IBM Plex Sans, and IBM Plex Mono.

# v-b.tech Personal Landing Mockup Design

## Purpose

Create a throwaway but polished static mockup for evaluating the future v-b.tech personal site before it is rebuilt in Astra. The page must present Vlad Bogatyrev as an independent end-to-end product engineer. The existing industrial brand system remains the visual foundation; v-b.tech becomes the signature rather than an anonymous product-studio identity.

## Audience and outcome

The primary audience is a potential client or product partner considering Vlad for a complex web product, internal system, or software that interacts with physical operations. Within five seconds they should understand who Vlad is, what he owns end to end, what differentiates him, and how to start a conversation.

## Content architecture

1. Sticky header with v-b.tech, Work, Expertise, Approach, About, RU/EN, and a contact action.
2. Hero naming Vlad first, positioning him as an end-to-end product engineer, showing availability, and offering “Discuss a project” plus “View case studies”.
3. Proof rail with 4+ years, Yandex/Kaspersky/Sberbank, 1,000+ users, 20% fewer errors, and a 15-to-1-minute operation improvement.
4. Three selected cases: Markiro, Idento, and QuokkaQ. Each uses Problem, Role, Solution, Result rather than a technology-first description.
5. More-projects manifest for Scanio and Mercadia.POS.
6. Expertise grid covering full-cycle product work, complex web systems, workflow design, offline-first architecture, hardware integration, and production operations.
7. Approach timeline from discovery through iteration.
8. About and conversion section with Telegram, hello@v-b.tech, and a local mock contact form.
9. Footer with personal name, v-b.tech, language control, and essential links.

## Visual system

Keep the supplied graphite palette, Signal Amber, IBM Plex Sans/Mono, signal-dash wordmark, operational status language, barcodes, label borders, and technical metadata. Reduce the catalogue feeling by using more editorial rhythm, larger personal authorship, outcome-led proof, and three richer cases. A large abstract “signal field” made from the dash/barcode motif is the signature hero object; no portrait or generated imagery is required.

## Interaction

The mockup supports Russian and English. Browser language selects the initial locale, manual selection persists in localStorage, and every visible label including metadata changes language. The form validates name, contact, and message locally and shows an aria-live mock success state without transmitting data. Anchor navigation must reveal content immediately and must not depend on hover.

## Accessibility and responsive behavior

Use a skip link, semantic main landmark, one h1, logical headings, visible focus, 44px touch targets, AA text contrast, descriptive labels, and reduced-motion fallbacks. Desktop target is 1440x900; mobile target is 390x844. Mobile retains a compact menu, keeps the primary CTA visible, uses three concise cases, and repeats a contact action after the work section.

## Scope boundaries

This is a static evaluation artifact, not the Astra implementation. It has no backend, analytics, network submission, CMS, production deployment, or real availability service. Product interface panels may be illustrative compositions built from supplied product marks and truthful text; they must not be presented as screenshots.

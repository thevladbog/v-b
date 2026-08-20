# v-b.tech Production Site — Design Specification

**Date:** 2026-08-20  
**Status:** Approved in design discussion; written specification awaiting final user review  
**Scope:** Astro website, RU/EN content, light/dark themes, contact workflow, legal pages, branded email, deployment on the existing Yandex Cloud production contour, and external DNS handoff

## 1. Purpose

Build the approved v-b.tech landing mockup into a production personal website for Vlad Bogatyrev. The site presents Vlad as an end-to-end product engineer, supports Russian and English as first-class indexed versions, supports light and dark themes, and accepts project enquiries through a privacy-gated production workflow.

The implementation must preserve the mockup's visual direction while replacing its demonstration-only mechanics with testable, deployable components and operational controls.

## 2. Design decisions already approved

1. Astro is the web framework.
2. Russian and English use separate canonical URLs.
3. Light and dark themes are both first-class designs.
4. The project is hosted in Yandex Cloud without a new virtual machine.
5. A small v-b.tech static container runs on the existing production VM behind the existing public Caddy edge.
6. The contact endpoint runs as a separate Yandex Cloud Function.
7. SmartCaptcha protects the public form.
8. Postbox sends project-branded HTML and plain-text email.
9. The existing managed PostgreSQL cluster receives a separate v-b.tech database and user for idempotency and a durable email outbox.
10. v-b.tech data, secrets, permissions, releases, and lifecycle rules remain logically isolated from Markiro.
11. No analytics, marketing storage, CRM forwarding, tracking pixels, or cookie banner are included in the first release.
12. DNS is operated outside the current Yandex Cloud contour. The implementation must provide a precise record handoff before publication and must not mutate DNS without explicit approval.

## 3. Product scope

### Included

- approved personal landing page;
- RU and EN routes and content;
- system-aware persisted light/dark theme;
- accessible mobile navigation;
- selected work, expertise, approach, about, and contact sections;
- public legal register, privacy policy, and personal-data consent;
- real contact submission with captcha, versioned consent, durable outbox, and email delivery;
- branded internal notification and visitor confirmation emails;
- SEO, social metadata, sitemap, robots, `llms.txt`, and branded 404;
- container build, Cloud Function build, infrastructure configuration, deployment runbook, DNS handoff, smoke tests, and rollback procedure.

### Excluded from the first release

- CMS or database-managed website content;
- blog, account area, billing, scheduling, file uploads, attachments, or chat;
- analytics or behavioural profiling;
- marketing email or newsletter subscription;
- CRM forwarding;
- tenant DPA and letterhead documents used by Markiro;
- public deployment, DNS mutation, or form activation without a separate explicit approval.

## 4. Repository architecture

Use a small pnpm workspace so the web build and contact function compile against the same contracts and legal identity.

```text
apps/
  web/                 Astro static site
  contact-function/    Shared HTTP-submit and scheduled-delivery function artifact
packages/
  contracts/           Contact schema, error codes, limits, source paths
  legal-documents/     Operator profile, VBT-PD-01, VBT-PD-02, registry
  email/               RU/EN notification and confirmation templates
deploy/
  container/           Static runtime image
  caddy/               v-b.tech host snippets and contract tests
  yandex/              Function, Lockbox, service account and DB configuration
  runbooks/            Publication, DNS, retention, recovery and rollback
prototype/             Preserved approved mockup reference
```

The current mockup remains available as a reference during implementation. Removing or replacing the reference is a later explicit cleanup action.

Package boundaries have one owner each:

- `contracts` defines the public request and response contract;
- `legal-documents` defines legal identities and renderable content;
- `email` accepts validated typed input and produces escaped HTML and plain text;
- `web` renders pages and submits the public contract;
- `contact-function` validates, stores, queues and delivers the contract;
- deployment code exposes only the approved host and path surface.

## 5. Routes and locale model

| Purpose | Russian | English |
| --- | --- | --- |
| Landing | `/` | `/en/` |
| Legal register | `/legal/` | `/en/legal/` |
| Processing policy | `/privacy/` | `/en/privacy/` |
| Website consent | `/personal-data-consent/` | `/en/personal-data-consent/` |

Additional generated routes:

- `/404.html` as the bounded branded missing-page response;
- `/sitemap.xml`;
- `/robots.txt`;
- `/llms.txt`.

Locale is encoded in the URL, not substituted only in the browser. Every paired page has a unique title and description, canonical URL, reciprocal `hreflang`, and `x-default` pointing to the Russian root. Language controls are ordinary links and work without JavaScript.

The server never redirects based on browser locale. This keeps URLs deterministic and avoids search and cache ambiguity.

## 6. Visual system and themes

The production site preserves the approved signal-dash direction, typographic hierarchy, case-study structure, restrained motion, and industrial-product tone.

### Theme contract

- First visit follows `prefers-color-scheme`.
- An explicit theme control offers light, dark, and system modes.
- The selected mode is stored only in first-party browser storage.
- A minimal inline head bootstrap applies the resolved theme before CSS paints, preventing a flash of the wrong theme.
- The control communicates its current state and works with keyboard and assistive technology.
- `color-scheme`, form controls, selection colours, code blocks, focus rings, diagrams, email previews, legal pages, and 404 are checked in both themes.

Light mode is not an inversion. It uses a warm near-white surface, graphite typography, restrained neutral borders, and the same signal amber. Dark mode keeps the approved graphite foundation. Both meet WCAG AA contrast for normal text and interactive states.

Fonts are self-hosted and subset for the used scripts and weights. The production page makes no Google Fonts request. Essential icons are inline SVG or CSS and remain understandable without decoration.

Motion is progressive enhancement. `prefers-reduced-motion` removes ticker, orbit, sweep, and entrance animations without hiding content or changing information order.

## 7. Page composition and content

The landing retains this order:

1. personal hero and availability;
2. production proof rail;
3. three selected case studies: Markiro, Idento, QuokkaQ;
4. smaller project manifest;
5. expertise;
6. working approach;
7. about Vlad;
8. direct contacts and enquiry form;
9. footer with locale, theme and legal links.

Astro components remain focused: layout/SEO, header, locale links, theme control, hero, proof rail, case study, expertise grid, approach timeline, contact form, footer, legal layout and error page.

RU and EN copy is stored as typed source content. Shared facts such as project IDs, URLs, marks and technology tags are declared once; editorial copy remains locale-specific. Missing translations, duplicate paths, unsafe links or a missing canonical pair fail the build.

No production claim is added without a source or owner approval. Company names, metrics and project outcomes receive a publication checklist before deployment.

## 8. Legal document system

### Boundary

The document system is an implementation and publication contract, not legal advice. Russian source wording requires owner/legal review before the public form is enabled. The English copy is an informational translation matched to the exact Russian revision.

The design was checked against the current official text of Federal Law No. 152-FZ and current provider documentation on 2026-08-20. Publication must repeat that check because legislation and provider terms can change.

Current primary references:

- official legal-information system, Federal Law No. 152-FZ: `https://ips.pravo.gov.ru/api/ips/legislation/document?baseid=None&hash=98490812b3409e2a8d78a11ca9010f434ea3d9250a11dbbdb78690cd5551bdd6`;
- Yandex Cloud explanation of processing under No. 152-FZ: `https://yandex.cloud/ru/docs/troubleshooting/legal/how-to/fl-152`;
- Yandex Cloud 152-FZ location and responsibility overview: `https://yandex.cloud/ru/solutions/152-fz`;
- SmartCaptcha terms: `https://yandex.ru/legal/cloud_terms_smartcaptcha/ru/`.

### Identities

- `VBT-PD-01` — Personal Data Processing Policy;
- `VBT-PD-02` — Website Personal Data Processing Consent.

Each active document has a stable code, revision, effective date, status, locale pair and complete accepted-consent identifier such as `VBT-PD-02/<revision>`. The first public revision is assigned only when wording and provider inventory are accepted; code never invents an effective date in advance.

The operator profile reuses the approved Markiro operator identity and contact details, with the site identity changed to `https://v-b.tech`. A publication review confirms every public name, postal address, phone, email and provider role before release.

### VBT-PD-01 minimum content

- operator identity and contacts;
- scope, definitions, principles and applicable rights;
- data-subject category: visitors who submit an enquiry;
- exact fields and sources;
- purposes and legal grounds;
- operations and automated/mixed processing;
- retention, blocking, correction, deletion and destruction;
- providers, their roles and the reason each is used;
- actual Russian primary collection and storage boundary;
- absence of intended cross-border transfer unless separately reviewed and activated;
- bounded security and incident-handling description;
- subject request and consent-withdrawal routes;
- necessary browser storage, server logs and SmartCaptcha technical processing;
- revision rules and Russian authoritative-language statement.

### VBT-PD-02 minimum content

- free affirmative action through an initially unchecked required checkbox;
- operator identity and contacts;
- exact data, purposes and permitted operations;
- provider categories used for the flow;
- retention and withdrawal process;
- statement about processing performed before withdrawal and another applicable legal basis;
- stable code, revision, effective date and authoritative-language statement.

The form copy links separately to policy and consent. Site and function compile the accepted identifier from `packages/legal-documents`; it is not duplicated in environment variables.

### Data inventory

User-provided data:

- name, maximum 100 characters;
- contact, either email or `@telegram`, maximum 254 characters;
- message, maximum 4,000 characters.

The form explicitly asks visitors not to submit passwords, payment details, protected secrets, special-category personal data or other unnecessary confidential information. Attachments are not accepted.

Bounded operational data:

- UUID request ID;
- locale;
- exact source path from an allow-list;
- consent identifier;
- submission and delivery timestamps;
- captcha validation outcome;
- short-lived keyed network-source digest used only for abuse rate limiting;
- bounded delivery state and provider message identifiers.

The system does not collect company, phone, attachments, marketing preferences, behavioural history or arbitrary referrer/UTM values in the first release.

## 9. Contact form contract

The only public mutation is exact same-origin `POST /api/contact`. GET, HEAD, PUT, alternate spellings, trailing-slash variants and deeper paths return a plain bounded 404.

Conceptual request:

```json
{
  "requestId": "uuid-v4",
  "locale": "ru",
  "name": "bounded string",
  "contact": "email or @telegram",
  "message": "bounded string",
  "sourcePath": "/",
  "consentId": "active VBT-PD-02 identifier",
  "captchaToken": "opaque provider token",
  "website": ""
}
```

`website` is a honeypot and must stay empty. Unknown properties, invalid Unicode controls, unsupported source paths, malformed IDs, oversized payloads and non-JSON content are rejected before storage or email rendering.

Validation order:

1. public-submission feature gate;
2. method, content type and 8 KiB body limit;
3. exact origin/host and schema;
4. consent identifier;
5. honeypot;
6. rate limit;
7. SmartCaptcha validation with timeout;
8. durable idempotent enqueue;
9. neutral accepted response.

Captcha validation sends only the provider token and the minimum network context required by the provider; name, contact and message are never included in the SmartCaptcha validation request. Before activation, the provider configuration and current terms are reviewed to disable optional provider reuse of request information wherever the active service contract exposes that control.

Public responses use a small stable error vocabulary: invalid request, consent revision changed, captcha required/rejected/unavailable, rate limited, submission disabled, temporarily unavailable. Internal provider and database details are never returned.

The browser preserves entered text when a retry is safe. A consent-revision conflict refreshes the legal copy before allowing another submission. Direct Telegram and email links remain available when the form is disabled or unavailable.

## 10. Durable delivery and data lifecycle

The existing managed PostgreSQL cluster receives:

- a separate database;
- a separate least-privilege user;
- an independent secret and encryption key;
- tables limited to contact request identity, encrypted delivery payload, outbox state and bounded delivery history.

No Markiro application role can read v-b.tech data, and the v-b.tech function cannot read Markiro schemas.

Submitting the same request ID is idempotent. A transaction-level lock or unique key ensures one durable notification/confirmation pair. Reusing the same ID with different normalized content is rejected.

Personal payload is encrypted before durable storage. The outbox retries bounded transient delivery failures with backoff. After terminal delivery or terminal failure handling, encrypted mail payload is erased on a short operational schedule. The mailbox copy and business correspondence are retained for no longer than one year after the last substantive contact unless a separately documented legal basis applies.

Rate limiting stores only a keyed HMAC of the bounded network source and fixed time window with short expiry; raw IP addresses are not persisted in the application database. Operational telemetry contains event kind, request ID, stage, status and latency but no name, contact or message. Logs must not contain request bodies, captcha tokens, secrets or rendered email.

## 11. Branded email system

Use React Email-style server rendering with escaped typed properties and plain-text alternatives.

### Internal notification

Sent to `hello@v-b.tech` and includes:

- project-branded heading;
- visitor name and contact;
- full enquiry message;
- locale and source path;
- received time and request ID;
- exact accepted consent identifier.

### Visitor confirmation

Sent only when `contact` is an email address. It confirms receipt, provides a neutral expected next step, includes direct contact routes and shows the request ID. It does not echo the full enquiry message or expose internal workflow details.

### Rendering rules

- separate RU and EN subjects and copy;
- table-based compatible layout with inline CSS;
- no external fonts, images, remote CSS, tracking pixels or open tracking;
- meaningful reading order and links;
- acceptable appearance under light and dark email-client modes;
- HTML escaping and header-injection rejection;
- deterministic HTML and plain-text snapshot tests;
- local review in Mailpit plus representative browser renders.

The public success state means the enquiry and its notification job were committed durably. Delivery then runs asynchronously with bounded retries. Confirmation failure does not make an already accepted enquiry appear failed to the visitor; it remains separately retryable and observable.

## 12. Infrastructure and host isolation

### Static web

Astro uses static output. A small unprivileged container serves only generated files on the internal Docker network. It does not publish host ports and has a read-only filesystem, dropped capabilities and a health endpoint or static health asset.

### Public edge

The existing public Caddy remains the only listener on 80/443. Its exact v-b.tech authority:

- redirects HTTP to HTTPS;
- redirects `www.v-b.tech` to canonical `https://v-b.tech{uri}`;
- serves/proxies site reads only to the v-b static container;
- proxies exact `POST /api/contact` to the Cloud Function adapter;
- rejects every other API path and method;
- applies bounded request-body limits;
- adds HSTS, CSP, Referrer-Policy, Permissions-Policy, X-Content-Type-Options and frame protection;
- hides implementation headers;
- keeps v-b.tech, Markiro landing, admin and kiosk authorities isolated by tests.

### Function and secrets

The function has its own service account and can access only:

- its Lockbox entries;
- the v-b.tech database/user;
- SmartCaptcha validation;
- the required Postbox sending operation;
- bounded logs/metrics.

One versioned artifact exposes two independently triggered entrypoints: an HTTP submission entrypoint and a scheduled outbox-drain entrypoint. The HTTP entrypoint never performs unbounded email retries inside the visitor request. The scheduled entrypoint leases due jobs, sends them through Postbox, records bounded provider identifiers and clears terminal encrypted payload according to the lifecycle rules.

No secret is compiled into the web image. Captcha is loaded only when public submission is enabled.

## 13. External DNS handoff

The external DNS provider remains the source of truth. Before publication, generate a dated record sheet from current infrastructure inventory and current zone contents.

Expected website records:

| Name | Type | Value rule | Publication behavior |
| --- | --- | --- | --- |
| `@` | `A` | existing approved public edge IPv4 | required |
| `@` | `AAAA` | existing approved public edge IPv6 | add only if the edge is already verified for IPv6; otherwise omit |
| `www` | `CNAME` | `v-b.tech.` | redirect to canonical apex at Caddy |

Expected email-authentication records are copied exactly from the active Postbox domain-verification output:

- provider verification TXT record;
- DKIM CNAME/TXT records;
- SPF include merged into the single existing SPF policy rather than creating a second SPF record;
- custom MAIL FROM records if configured;
- `_dmarc` policy reviewed against the current mailbox/provider setup.

The handoff must list name, type, exact value, TTL, purpose, current value, replacement/merge rule, verification command and rollback value. It must first read the live zone so it does not overwrite mailbox MX, SPF, DKIM, DMARC or unrelated service records.

Use a short TTL during the approved migration window and restore the normal TTL after verification. DNS changes, certificate activation and public exposure require separate user approval.

## 14. SEO and discovery

- unique title, description, canonical and social metadata for every public page;
- reciprocal RU/EN `hreflang`;
- Person structured data using only verified public identity and profile links;
- project/case-study structured data only where the facts are supported;
- legal pages in sitemap and footer;
- deterministic robots rules and bounded `llms.txt`;
- no indexable preview or local URLs;
- branded 404 with real HTTP 404 at the public edge;
- build failure on localhost canonicals, missing alternates, broken internal links or duplicate metadata.

## 15. Accessibility and interaction quality

- one `main` and one page `h1`;
- landmarks and heading order;
- skip link;
- keyboard-complete header, menu, theme control and form;
- visible focus with adequate contrast in both themes;
- explicit labels, descriptions and error association;
- status announcements without stealing focus unnecessarily;
- at least 44 by 44 CSS pixel mobile targets;
- no horizontal overflow at supported viewport widths;
- content remains available with JavaScript disabled;
- reduced motion does not remove information;
- legal HTML is the canonical accessible reading format.

## 16. Testing and acceptance

### Automated

- unit tests for locale paths, theme resolution/persistence, content contracts and URL safety;
- legal registry and revision lifecycle tests;
- consent identifier parity across web, function, emails and stored outbox;
- request-schema boundary and Unicode tests;
- origin, body-size, method/path and public error tests;
- captcha success, rejection, provider timeout and fail-closed tests;
- rate-limit and idempotent-concurrency tests;
- encrypted outbox lifecycle and terminal payload-erasure tests;
- branded email HTML/plain-text snapshots and injection cases;
- Astro build and static-route inventory;
- internal link, canonical, `hreflang`, sitemap, robots and 404 checks;
- Caddy authority, CSP, security-header and route-isolation tests;
- dependency and secret-leak scans.

### Browser and rendered

- RU/EN landing and legal pages;
- light/dark/system themes with reload and no incorrect-theme flash;
- desktop and mobile layouts;
- keyboard and accessibility-tree review;
- form validation, consent, retry and disabled states;
- no horizontal overflow;
- no unexpected console warning or external request;
- email render review in Mailpit and representative clients/previews.

### External release gates

- owner approval of public claims, contacts and legal wording;
- current provider legal names/contracts and Russian processing boundary verified;
- any required operator/notification obligations reviewed outside the codebase;
- Postbox identity and mailbox delivery verified;
- external DNS sheet approved;
- live DNS/TLS, CSP, routes and legal pages verified while form remains disabled;
- exact production form smoke using controlled non-sensitive test data;
- mailbox receipt and branded confirmation inspected;
- physical/mobile-device acceptance recorded separately from automation.

## 17. Deployment and rollback

Deployment sequence:

1. build and test packages, site, function and container;
2. publish the web image and function artifact without public mutation;
3. create isolated DB/user, Lockbox entries and service-account permissions;
4. deploy function with public submission disabled;
5. deploy static site and legal pages to the existing VM/container network;
6. validate privately through explicit host routing;
7. prepare and approve the external DNS record sheet;
8. apply DNS only after explicit approval;
9. verify HTTPS, routes, themes, locales, legal pages and direct contacts;
10. perform controlled Postbox/SmartCaptcha smoke;
11. enable public submission as a separate approved action;
12. verify the exact release identifiers and delivery path.

Rollback order:

1. disable public form submission;
2. keep legal pages and direct contacts available;
3. roll back function and web image independently;
4. restore prior DNS only if the edge/site cannot be recovered inside the approved window;
5. retain delivery evidence and process already accepted enquiries according to the legal lifecycle.

## 18. Definition of done

The production implementation is complete only when:

- the approved mockup is represented in Astro with two canonical locales and three theme modes;
- all specified routes, documents and emails exist and are reviewed;
- the contact contract is privacy-gated, idempotent and durably delivered;
- v-b.tech resources are isolated from Markiro while sharing the existing VM and managed PostgreSQL cluster;
- all automated and browser gates pass;
- the external DNS handoff contains exact current records;
- remaining legal, DNS, provider, deployment and physical-device gates are reported explicitly rather than implied complete.

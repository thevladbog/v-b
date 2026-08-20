# v-b.tech Print Design System and Document Templates

**Date:** 2026-08-20  
**Status:** Approved design; implementation not started  
**Visual direction:** Paper Signal, compact A4 layout  
**Source strategy:** Word-first

## 1. Purpose

Create a practical print extension of the existing v-b.tech identity and a reusable family of editable business-document templates. The system must support software-development, implementation, and support engagements issued either by:

- Individual Entrepreneur Bogatyrev Vladislav Sergeevich; or
- Bogatyrev Vladislav Sergeevich acting as an individual.

This work defines document structure, visual rules, editable fields, and output quality. It does not supply approved legal wording, personal-data policy content, consent language, accounting advice, or real personal and banking details. Those inputs remain owned by their respective reviewers and can be inserted into the templates later.

## 2. Existing Brand Foundation

The print system extends the current v-b.tech identity instead of introducing a separate visual language:

- Graphite neutrals and Signal Amber;
- IBM Plex Sans for reading text;
- IBM Plex Mono for the wordmark, labels, identifiers, numbers, and document metadata;
- the signal dash as the primary distinguishing device;
- an engineering voice that is calm, concrete, and factual.

The web identity uses a dark-first presentation. Print reverses the surface hierarchy: documents use a light paper background and dark text, with Signal Amber limited to a restrained identifying accent.

## 3. Approved Visual Direction

### 3.1 Paper Signal

Paper Signal is a business-document system with visible but restrained branding. It uses:

- an amber top rule;
- a compact v-b.tech wordmark;
- a small signal marker on the outer edge of the first-page header area;
- concise monospaced metadata;
- strong typographic hierarchy without decorative legal-document styling;
- light rules and open space instead of dense boxed grids.

The direction must remain recognisable in colour while retaining its hierarchy in monochrome.

### 3.2 Approved density

The first concept's title area was rejected as too tall. The approved compact version reduces the title block by approximately 24 percent. On a typical contract first page, substantive document content begins at approximately 27 percent of page height. Invoices and acts use a still denser opening block.

These percentages describe the approved visual proportion, not a fixed-height implementation constraint. Content must reflow safely when names, titles, or metadata wrap.

## 4. Source and Output Architecture

The system is Word-first because the operational documents must remain easy to edit, exchange, and complete manually.

### 4.1 Source of truth

`v-b-paper-signal.dotx` is the source of truth for shared Word styles, page geometry, headers, footers, numbering definitions, tables, fields, and content controls.

### 4.2 Working templates

The first release contains:

- `v-b-letterhead.docx` - universal branded letterhead;
- `v-b-contract.docx` - contract structure for software development and support;
- `v-b-specification.docx` - appendix and statement-of-work structure;
- `v-b-invoice.docx` - invoice template;
- `v-b-act.docx` - services or work acceptance act;
- `v-b-form-base.docx` - neutral general-purpose form for later legal, consent, and personal-data content.

### 4.3 Reference outputs

The release also contains:

- `v-b-print-design-system.pdf` - the printable design-system guide;
- an exact reference PDF for every working DOCX template;
- no QA PNGs or temporary build files in the delivered package.

HTML-to-PDF or schema-driven generation is not part of this implementation. The named-field model must leave room for a later external document-generation system without requiring a visual redesign.

## 5. Print Design-System PDF

The guide targets approximately 18 to 22 explicit A4 pages and contains:

1. cover and system purpose;
2. brand character and print principles;
3. wordmark and signal dash variants, clear space, minimum size, and misuse;
4. screen colours, practical CMYK equivalents, grayscale values, and monochrome use;
5. IBM Plex Sans and Mono roles, sizes, line heights, and A4 rhythm;
6. Paper Signal page grid, margins, baseline rhythm, and compact title zone;
7. document hierarchy for titles, sections, body copy, notes, and links;
8. document codes, revisions, dates, status, and page furniture;
9. tables, totals, party details, and banking details;
10. fillable fields, signatures, stamps, and electronic-signing considerations;
11. examples for the contract, specification, invoice, act, and base form;
12. colour, grayscale, and office-printer behaviour;
13. correct and incorrect examples;
14. a short guide for creating a document from the DOTX source.

The PDF must have a clickable table of contents, embedded fonts, explicit page furniture, and computed page numbering. CMYK values are practical equivalents for ordinary professional and office printing. The deliverable must not claim certified prepress or press-profile compliance.

## 6. Template Family Rules

### 6.1 Template identities

Stable template codes are independent of the number assigned to a concrete document:

| Template | Code |
|---|---|
| Letterhead | `VBT-LTR-01` |
| Contract | `VBT-AGR-01` |
| Specification / statement of work | `VBT-SOW-01` |
| Invoice | `VBT-INV-01` |
| Acceptance act | `VBT-ACT-01` |
| General form | `VBT-FRM-01` |

Each template also carries its own revision. A template revision must never be presented as the document's externally assigned number.

### 6.2 External document number

Every applicable working template contains a named `DOCUMENT_NUMBER` field. The visible example is three digits, such as `001`.

Number allocation, uniqueness, sequencing, yearly reset, and validation belong to an external system and are outside this work. The template must not implement or imply those behaviours.

### 6.3 Named fields

The shared field vocabulary includes, where applicable:

- `ISSUER_MODE` with the values `SOLE_PROPRIETOR` and `INDIVIDUAL`;
- `DOCUMENT_NUMBER`;
- `DOCUMENT_DATE`;
- `DOCUMENT_PLACE`;
- `DOCUMENT_STATUS`;
- `TEMPLATE_REVISION`;
- issuer name, registration details, tax details, contact details, banking details, and signature role;
- customer name, representative, authority, registration details, contact details, and banking details;
- contract basis, service period, currency, line items, subtotal, tax treatment, total, and amount in words.

Real details are not invented. Examples use conspicuous placeholders that cannot be mistaken for production data.

### 6.4 Issuer switch

The issuer identity block supports two modes without manual page reconstruction:

- `SOLE_PROPRIETOR`: Individual Entrepreneur Bogatyrev Vladislav Sergeevich plus the applicable registration and banking field set;
- `INDIVIDUAL`: Bogatyrev Vladislav Sergeevich plus the smaller applicable identity and payment field set.

The switch controls labels and field visibility while preserving the same page grid and signature alignment.

### 6.5 Word structure

- Headings use real Word styles.
- Lists and legal clauses use real numbering definitions.
- Tables use explicit widths, column geometry, cell padding, and repeating headers.
- Fields and editable regions use named Word content controls where compatible.
- Essential content remains understandable in Word and LibreOffice even when advanced content-control behaviour is unavailable.
- Multi-page documents use computed `N из M` page numbering.
- Signature blocks stay together and move to the next page when insufficient space remains.
- No text is pinned to fixed-height rows or shapes that can clip long values.

## 7. Document-Specific Behaviour

### 7.1 Letterhead

The letterhead provides a compact identity header, optional recipient block, subject, body styles, signature block, and footer contact area. It does not assume a specific legal document type.

### 7.2 Contract

The contract provides a first-page party summary, real clause numbering, heading levels, body and note styles, repeatable annex references, page numbering, and a two-party details and signature section. It supplies structural placeholder sections only, not approved legal wording.

### 7.3 Specification / statement of work

The specification provides scope, deliverables, exclusions, dependencies, stages, acceptance criteria, schedule, price, responsibilities, and signatures. Tables are used only for repeated comparable data, not to contain ordinary prose.

### 7.4 Invoice

The invoice targets one A4 page for typical use. It contains supplier and customer details, basis, payment details, line items, tax treatment, total, amount in words, and signature. It may continue to a second page without broken headers or totals.

### 7.5 Acceptance act

The act targets one A4 page for typical use. It contains parties, basis, reporting period, accepted line items, total, structured result placeholder, and signatures. It may continue to a second page without separating a signature from its label or party.

### 7.6 General form

The base form supplies the complete Paper Signal hierarchy, named identity fields, metadata, signature patterns, lists, tables, notes, and page furniture. Other agents can insert approved consent or personal-data content without recreating the design system.

## 8. Print Tokens and Accessibility

The implementation defines a dedicated print token map derived from the existing brand tokens:

- A4 portrait geometry and explicit margins;
- a light paper surface and dark primary text;
- restrained Signal Amber in non-essential identifying elements;
- grayscale fallbacks with distinct tone and shape, not colour alone;
- minimum readable body and metadata sizes appropriate for ordinary office printers;
- visible links in colour and monochrome;
- sufficient contrast for all required text;
- consistent section spacing, table padding, and signature clearances.

The wordmark must use a print-safe vector asset or outlined form. It must not depend on a web font request.

## 9. Verification and Acceptance

### 9.1 Structural checks

- DOTX and DOCX packages reopen without repair warnings.
- Every required Word style, numbering definition, named field, table geometry, header, and footer exists.
- Both issuer modes produce complete, correctly labelled field sets.
- No document contains real secrets, personal details, or invented banking data.
- Template codes and revisions remain separate from `DOCUMENT_NUMBER`.

### 9.2 Render checks

Every DOTX-derived example and every DOCX is rendered to PDF and page PNGs after each meaningful layout change. Every final page is inspected at 100 percent.

The checks cover:

- typical and deliberately long party names and details;
- both issuer modes;
- colour and grayscale output;
- one-page and two-page invoice and act cases;
- contract section, list, table, signature, and annex page breaks;
- repeating headers and computed page numbering;
- no clipping, overlap, missing glyphs, broken tables, or excessive blank areas.

### 9.3 PDF guide checks

- all fonts are embedded;
- the table of contents and internal links work;
- page count and computed numbering agree;
- every page is rendered and visually inspected;
- colour, grayscale, and monochrome examples remain distinguishable;
- no claim of certified legal, accounting, or prepress approval appears.

### 9.4 Acceptance boundary

Automated and rendered checks prove structural and visual behaviour in the available environment. They do not replace:

- legal review of inserted contract, consent, or personal-data wording;
- accounting review of invoice and tax fields;
- verification of real issuer and customer details;
- physical acceptance on the user's actual printer;
- external-system acceptance for document-number assignment or data filling.

## 10. Repository and Delivery Layout

Implementation should keep editable sources, build helpers, and released artefacts separate. Final naming and paths are established in the implementation plan, with these constraints:

- the DOTX and DOCX files remain versioned source artefacts;
- final PDFs are reproducibly generated and visually verified;
- temporary render PNGs and intermediate PDFs remain outside the delivered package;
- generated outputs do not overwrite hand-edited source templates;
- unrelated existing work and `.superpowers` brainstorming files are excluded from implementation commits.

## 11. Out of Scope

- approved legal clauses or consent wording;
- personal-data policy analysis;
- real personal, tax, banking, or customer data;
- document-number allocation or external-system integration;
- electronic-signature provider integration;
- HTML or API document generation;
- certified print-production or press-profile preparation;
- deployment, publication, or distribution to third parties.

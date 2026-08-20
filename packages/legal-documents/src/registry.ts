import { CONSENT_CONTENT } from "./documents/consent.js";
import { PRIVACY_CONTENT } from "./documents/privacy.js";
import { isValidIsoDate, isValidLegalRevision } from "./identity.js";
import type {
  LegalDocumentCode,
  LegalDocumentRelease,
  LegalDocumentSource,
  LegalDocumentView,
  LegalDocumentLocaleContent,
  LegalLocale,
} from "./types.js";

export const LEGAL_SOURCE_REVIEW = {
  reviewedOn: "2026-08-20",
  operatorSource: "/Users/thevladbog/PRSOME/q/packages/legal-documents/src/operator.ts",
  sources: [
    {
      label: "Official legal-information system, Federal Law No. 152-FZ",
      url: "https://ips.pravo.gov.ru/api/ips/legislation/document?baseid=None&hash=98490812b3409e2a8d78a11ca9010f434ea3d9250a11dbbdb78690cd5551bdd6",
    },
    {
      label: "Yandex Cloud legal guidance",
      url: "https://yandex.cloud/ru/docs/troubleshooting/legal/how-to/fl-152",
    },
    {
      label: "Yandex Cloud 152-FZ boundary",
      url: "https://yandex.cloud/ru/solutions/152-fz",
    },
    {
      label: "SmartCaptcha terms",
      url: "https://yandex.ru/legal/cloud_terms_smartcaptcha/ru/",
    },
  ],
} as const;

export const LEGAL_ACTIVATION_CHECKLIST = [
  "Owner must confirm every operator field before activation.",
  "Complete Russian legal review and confirm the matched English informational translation.",
  "Reverify provider contracting entities, roles, regions, and current terms.",
  "Confirm the complete production data, retention, security, and localization inventory.",
  "Assign a valid public revision and effective date only after approvals.",
  "Replace draft identities atomically and rerun all lifecycle and generated-page gates.",
  "Keep submission disabled until the active consent identity is deployed across site and function.",
] as const;

export const LEGAL_RELEASES = [
  {
    code: "VBT-PD-01",
    identity: "VBT-PD-01/DRAFT",
    revision: null,
    effectiveDate: null,
    status: "draft",
    operatorProfileId: "operator-vbtech-2026-08-20",
    routes: { ru: "/privacy/", en: "/en/privacy/" },
  },
  {
    code: "VBT-PD-02",
    identity: "VBT-PD-02/DRAFT",
    revision: null,
    effectiveDate: null,
    status: "draft",
    operatorProfileId: "operator-vbtech-2026-08-20",
    routes: { ru: "/personal-data-consent/", en: "/en/personal-data-consent/" },
  },
] as const satisfies readonly LegalDocumentRelease[];

const CURRENT_CONTACT_CONSENT_CANDIDATE = LEGAL_RELEASES.find(
  ({ code }) => code === "VBT-PD-02",
);
if (!CURRENT_CONTACT_CONSENT_CANDIDATE) {
  throw new Error("Current contact consent candidate is missing");
}
export const CURRENT_CONTACT_CONSENT_ID = CURRENT_CONTACT_CONSENT_CANDIDATE.identity;

export const LEGAL_DOCUMENTS = [
  { releaseIdentity: "VBT-PD-01/DRAFT", content: PRIVACY_CONTENT },
  { releaseIdentity: "VBT-PD-02/DRAFT", content: CONSENT_CONTENT },
] as const satisfies readonly LegalDocumentSource[];

const CURRENT_RELEASES: readonly LegalDocumentRelease[] = LEGAL_RELEASES;

const CODES = ["VBT-PD-01", "VBT-PD-02"] as const;
const STATUSES = ["draft", "active", "superseded", "withdrawn"] as const;
const ROUTE_PATTERN = /^\/(?:en\/)?[a-z0-9-]+(?:\/[a-z0-9-]+)*\/$/;
const SECTION_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function assertLocaleRoutes(release: LegalDocumentRelease): void {
  const routes = release.routes as Partial<Record<LegalLocale, string>>;
  if (Object.keys(routes).length !== 2 || !routes.ru || !routes.en) {
    throw new Error(`Legal release ${release.identity} must define paired RU and EN routes`);
  }

  for (const [locale, route] of Object.entries(routes) as [LegalLocale, string][]) {
    if (!ROUTE_PATTERN.test(route) || route.includes("://") || route.includes("?") || route.includes("#")) {
      throw new Error(`Invalid legal route for ${locale}: ${route}`);
    }
    if (locale === "ru" && route.startsWith("/en/")) {
      throw new Error(`Invalid legal route for ru: ${route}`);
    }
    if (locale === "en" && !route.startsWith("/en/")) {
      throw new Error(`Invalid legal route for en: ${route}`);
    }
  }
}

function expectedIdentity(release: LegalDocumentRelease): string {
  return release.status === "draft"
    ? `${release.code}/DRAFT`
    : `${release.code}/${String(release.revision)}`;
}

function assertNonBlank(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Blank legal content at ${path}`);
  }
}

function validateLocalizedContent(
  release: LegalDocumentRelease,
  content: LegalDocumentLocaleContent,
  locale: LegalLocale,
): void {
  if (content.documentCode !== release.code) {
    throw new Error(
      `Content document code ${content.documentCode} does not match release ${release.code}`,
    );
  }
  if (content.releaseIdentity !== release.identity) {
    throw new Error(
      `Localized content identity ${content.releaseIdentity} does not match ${release.identity}`,
    );
  }
  if (content.locale !== locale) {
    throw new Error(`Legal content locale mismatch: expected ${locale}, received ${content.locale}`);
  }

  assertNonBlank(content.title, `${release.identity}.${locale}.title`);
  assertNonBlank(content.description, `${release.identity}.${locale}.description`);
  assertNonBlank(content.summary, `${release.identity}.${locale}.summary`);
  if (content.sections.length === 0) {
    throw new Error(`Legal content ${release.identity}.${locale} must have at least one section`);
  }

  const sectionIds = new Set<string>();
  for (const [sectionIndex, section] of content.sections.entries()) {
    const path = `${release.identity}.${locale}.sections[${sectionIndex}]`;
    assertNonBlank(section.id, `${path}.id`);
    if (!SECTION_ID_PATTERN.test(section.id)) {
      throw new Error(`Unsafe section id: ${section.id}`);
    }
    if (sectionIds.has(section.id)) {
      throw new Error(`Duplicate section id: ${section.id}`);
    }
    sectionIds.add(section.id);
    assertNonBlank(section.heading, `${path}.heading`);
    if (section.requirements.length === 0) {
      throw new Error(`Section ${section.id} must have at least one requirement marker`);
    }
    const requirements = new Set<string>();
    for (const [requirementIndex, requirement] of section.requirements.entries()) {
      assertNonBlank(requirement, `${path}.requirements[${requirementIndex}]`);
      if (requirements.has(requirement)) {
        throw new Error(`Duplicate requirement marker ${requirement} in section ${section.id}`);
      }
      requirements.add(requirement);
    }
    if (section.blocks.length === 0) {
      throw new Error(`Section ${section.id} must have at least one block`);
    }

    for (const [blockIndex, block] of section.blocks.entries()) {
      const blockPath = `${path}.blocks[${blockIndex}]`;
      if (block.kind === "paragraph") {
        assertNonBlank(block.text, `${blockPath}.text`);
        continue;
      }
      if (block.items.length === 0) {
        throw new Error(`Legal ${block.kind} list must have at least one item at ${blockPath}`);
      }
      if (block.kind === "definition-list") {
        for (const [itemIndex, item] of block.items.entries()) {
          assertNonBlank(item.term, `${blockPath}.items[${itemIndex}].term`);
          assertNonBlank(item.detail, `${blockPath}.items[${itemIndex}].detail`);
        }
        continue;
      }
      for (const [itemIndex, item] of block.items.entries()) {
        assertNonBlank(item, `${blockPath}.items[${itemIndex}]`);
      }
    }
  }
}

export function validateLegalRegistry(
  releases: readonly LegalDocumentRelease[],
  documents: readonly LegalDocumentSource[],
): void {
  const identities = new Set<string>();
  const routes = new Set<string>();
  const activeCodes = new Set<LegalDocumentCode>();

  for (const release of releases) {
    const raw = release as unknown as Record<string, unknown>;
    if (!(CODES as readonly string[]).includes(String(raw.code))) {
      throw new Error(`Invalid legal document code: ${String(raw.code)}`);
    }
    if (!(STATUSES as readonly string[]).includes(String(raw.status))) {
      throw new Error(`Invalid legal document status: ${String(raw.status)}`);
    }
    if (release.operatorProfileId !== "operator-vbtech-2026-08-20") {
      throw new Error(`Unknown operator profile: ${String(release.operatorProfileId)}`);
    }
    if (identities.has(release.identity)) {
      throw new Error(`Duplicate release identity: ${release.identity}`);
    }
    identities.add(release.identity);

    if (raw.status === "draft") {
      if (raw.revision !== null || raw.effectiveDate !== null) {
        throw new Error(`Draft ${release.code} cannot have a public revision or effective date`);
      }
    } else {
      if (!isValidLegalRevision(raw.revision)) {
        throw new Error(`Published release ${release.code} must have a valid YYYY.MM/NN revision`);
      }
      if (!isValidIsoDate(raw.effectiveDate)) {
        throw new Error(`Published release ${release.code} must have a valid ISO effective date`);
      }
      if (raw.status === "active") {
        if (activeCodes.has(release.code)) {
          throw new Error(`Multiple active releases for ${release.code}`);
        }
        activeCodes.add(release.code);
      }
    }

    if (release.identity !== expectedIdentity(release)) {
      throw new Error(`Release identity is inconsistent with lifecycle metadata: ${release.identity}`);
    }

    assertLocaleRoutes(release);
    for (const route of Object.values(release.routes)) {
      if (routes.has(route)) throw new Error(`Duplicate route: ${route}`);
      routes.add(route);
    }
  }

  const sourceIdentities = new Set<string>();
  for (const document of documents) {
    if (sourceIdentities.has(document.releaseIdentity)) {
      throw new Error(`Duplicate content source: ${document.releaseIdentity}`);
    }
    sourceIdentities.add(document.releaseIdentity);
    const locales = document.content as Partial<Record<LegalLocale, unknown>>;
    if (Object.keys(locales).length !== 2 || !locales.ru || !locales.en) {
      throw new Error(`Legal content ${document.releaseIdentity} must define paired RU and EN content`);
    }
    const release = releases.find(({ identity }) => identity === document.releaseIdentity);
    if (release) {
      validateLocalizedContent(release, document.content.ru, "ru");
      validateLocalizedContent(release, document.content.en, "en");
      const ruContract = document.content.ru.sections.map(({ id, requirements }) => ({ id, requirements }));
      const enContract = document.content.en.sections.map(({ id, requirements }) => ({ id, requirements }));
      if (JSON.stringify(ruContract) !== JSON.stringify(enContract)) {
        throw new Error(`Localized section contract mismatch for ${document.releaseIdentity}`);
      }
    }
  }

  if (
    identities.size !== sourceIdentities.size ||
    [...identities].some((identity) => !sourceIdentities.has(identity)) ||
    [...sourceIdentities].some((identity) => !identities.has(identity))
  ) {
    throw new Error("Legal content and release identities mismatch");
  }
}

function viewFor(release: LegalDocumentRelease, locale: LegalLocale): LegalDocumentView {
  const source = LEGAL_DOCUMENTS.find(({ releaseIdentity }) => releaseIdentity === release.identity);
  if (!source) throw new Error(`Legal content not found for ${release.identity}`);
  return { ...release, content: source.content[locale] };
}

export function listCurrentLegalDocuments(locale: LegalLocale): readonly LegalDocumentView[] {
  return CURRENT_RELEASES.map((release) => viewFor(release, locale));
}

export function getCurrentLegalDocument(
  code: LegalDocumentCode,
  locale: LegalLocale,
): LegalDocumentView {
  const release = CURRENT_RELEASES.find((candidate) => candidate.code === code);
  if (!release) throw new Error(`No current legal document candidate for ${code}`);
  return viewFor(release, locale);
}

export function listActiveLegalDocuments(locale: LegalLocale): readonly LegalDocumentView[] {
  return CURRENT_RELEASES.filter(({ status }) => status === "active").map((release) =>
    viewFor(release, locale),
  );
}

export function getActiveLegalDocument(
  code: LegalDocumentCode,
  locale: LegalLocale,
): LegalDocumentView {
  const release = CURRENT_RELEASES.find(
    (candidate) => candidate.code === code && candidate.status === "active",
  );
  if (!release) throw new Error(`No active legal document for ${code}`);
  return viewFor(release, locale);
}

export function assertContactConsentPublishable(
  consentIdentity: string,
  submissionEnabled: boolean,
): void {
  if (!submissionEnabled) return;
  if (consentIdentity.endsWith("/DRAFT")) {
    throw new Error(`Draft consent ${consentIdentity} cannot be used when submission is enabled`);
  }
  const activeConsent = CURRENT_RELEASES.find(
    ({ code, status, identity }) =>
      code === "VBT-PD-02" && status === "active" && identity === consentIdentity,
  );
  if (!activeConsent) {
    throw new Error(`Consent ${consentIdentity} is not an active publishable consent`);
  }
}

validateLegalRegistry(LEGAL_RELEASES, LEGAL_DOCUMENTS);

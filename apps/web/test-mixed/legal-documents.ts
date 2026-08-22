import {
  LEGAL_RELEASES as activeReleases,
  getCurrentLegalDocument as getActiveLegalDocument,
  type LegalDocumentCode,
  type LegalDocumentRelease,
  type LegalDocumentView,
  type LegalLocale,
} from "../../../packages/legal-documents/src/index.ts";
import { derivePersonalDataLegalContour } from "../../../packages/legal-documents/src/contour.ts";

export type { LegalDocumentView } from "../../../packages/legal-documents/src/index.ts";

type MixedDirection = "policy-active" | "consent-active";

const direction = process.env.VBTECH_PRIVATE_MIXED_LEGAL_CONTOUR as MixedDirection | undefined;
if (direction !== "policy-active" && direction !== "consent-active") {
  throw new Error("The mixed legal contour requires an explicit private direction guard");
}

const draftCode: LegalDocumentCode = direction === "policy-active" ? "VBT-PD-02" : "VBT-PD-01";

const currentReleases = activeReleases.map((release): LegalDocumentRelease =>
  release.code === draftCode
    ? {
        ...release,
        identity: `${release.code}/DRAFT`,
        revision: null,
        effectiveDate: null,
        status: "draft",
      } as LegalDocumentRelease
    : release,
);

export const CURRENT_PERSONAL_DATA_LEGAL_CONTOUR =
  derivePersonalDataLegalContour(currentReleases);
export const CURRENT_CONTACT_CONSENT_ID = CURRENT_PERSONAL_DATA_LEGAL_CONTOUR.consent.identity;

const documentFor = (code: LegalDocumentCode, locale: LegalLocale): LegalDocumentView => {
  const active = getActiveLegalDocument(code, locale);
  const release = currentReleases.find((candidate) => candidate.code === code);
  if (!release) throw new Error(`Missing mixed legal fixture release for ${code}`);
  return {
    ...release,
    content: {
      ...active.content,
      releaseIdentity: release.identity,
    },
  };
};

export function assertContactConsentPublishable(
  consentIdentity: string,
  submissionEnabled: boolean,
): void {
  if (!submissionEnabled) return;
  if (
    CURRENT_PERSONAL_DATA_LEGAL_CONTOUR.status !== "active" ||
    consentIdentity !== CURRENT_PERSONAL_DATA_LEGAL_CONTOUR.consent.identity
  ) {
    throw new Error(`Consent ${consentIdentity} is not part of an active personal data legal contour`);
  }
}

export function getCurrentLegalDocument(
  code: LegalDocumentCode,
  locale: LegalLocale,
): LegalDocumentView {
  return documentFor(code, locale);
}

export function listCurrentLegalDocuments(locale: LegalLocale): readonly LegalDocumentView[] {
  return (["VBT-PD-01", "VBT-PD-02"] as const).map((code) => documentFor(code, locale));
}

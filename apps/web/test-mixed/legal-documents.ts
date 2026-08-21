import {
  LEGAL_RELEASES as draftReleases,
  getCurrentLegalDocument as getDraftLegalDocument,
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

const activeCode: LegalDocumentCode = direction === "policy-active" ? "VBT-PD-01" : "VBT-PD-02";
const activeRevision = activeCode === "VBT-PD-01" ? "2099.01/01" : "2099.02/02";

const currentReleases = draftReleases.map((release): LegalDocumentRelease =>
  release.code === activeCode
    ? {
        ...release,
        identity: `${release.code}/${activeRevision}`,
        revision: activeRevision,
        effectiveDate: activeCode === "VBT-PD-01" ? "2099-01-01" : "2099-02-02",
        status: "active",
      } as LegalDocumentRelease
    : release,
);

export const CURRENT_PERSONAL_DATA_LEGAL_CONTOUR =
  derivePersonalDataLegalContour(currentReleases);
export const CURRENT_CONTACT_CONSENT_ID = CURRENT_PERSONAL_DATA_LEGAL_CONTOUR.consent.identity;

const documentFor = (code: LegalDocumentCode, locale: LegalLocale): LegalDocumentView => {
  const draft = getDraftLegalDocument(code, locale);
  const release = currentReleases.find((candidate) => candidate.code === code);
  if (!release) throw new Error(`Missing mixed legal fixture release for ${code}`);
  return {
    ...release,
    content: {
      ...draft.content,
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

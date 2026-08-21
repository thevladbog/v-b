import {
  getCurrentLegalDocument as getDraftLegalDocument,
  listCurrentLegalDocuments as listDraftLegalDocuments,
  type LegalDocumentCode,
  type LegalDocumentView,
  type LegalLocale,
} from "../../../packages/legal-documents/src/index.ts";

export type { LegalDocumentView } from "../../../packages/legal-documents/src/index.ts";

export const CURRENT_CONTACT_CONSENT_ID = "VBT-PD-02/2099.01/01" as const;

const activateConsent = (document: LegalDocumentView): LegalDocumentView => {
  if (document.code !== "VBT-PD-02") return document;
  return {
    ...document,
    identity: CURRENT_CONTACT_CONSENT_ID,
    revision: "2099.01/01",
    effectiveDate: "2099-01-01",
    status: "active",
    content: {
      ...document.content,
      releaseIdentity: CURRENT_CONTACT_CONSENT_ID,
    },
  };
};

export function assertContactConsentPublishable(
  consentIdentity: string,
  submissionEnabled: boolean,
): void {
  if (!submissionEnabled) return;
  if (consentIdentity !== CURRENT_CONTACT_CONSENT_ID) {
    throw new Error(`Consent ${consentIdentity} is not the private active test consent`);
  }
}

export function getCurrentLegalDocument(
  code: LegalDocumentCode,
  locale: LegalLocale,
): LegalDocumentView {
  return activateConsent(getDraftLegalDocument(code, locale));
}

export function listCurrentLegalDocuments(locale: LegalLocale): readonly LegalDocumentView[] {
  return listDraftLegalDocuments(locale).map(activateConsent);
}

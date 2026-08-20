export { OPERATOR_PROFILES } from "./operator.js";
export { isValidIsoDate, isValidLegalRevision } from "./identity.js";
export { LEGAL_DOCUMENT_CONTRACTS } from "./contracts.js";
export type { LegalPublishedIdentity, LegalRevision } from "./identity.js";
export {
  CURRENT_CONTACT_CONSENT_ID,
  LEGAL_ACTIVATION_CHECKLIST,
  LEGAL_DOCUMENTS,
  LEGAL_RELEASES,
  LEGAL_SOURCE_REVIEW,
  assertContactConsentPublishable,
  deriveCurrentLegalReleases,
  getActiveLegalDocument,
  getCurrentLegalDocument,
  listActiveLegalDocuments,
  listCurrentLegalDocuments,
  validateLegalRegistry,
} from "./registry.js";
export type {
  LegalBlock,
  LegalContentRequirement,
  LegalDocumentCode,
  LegalDocumentIdentity,
  LegalDocumentLocaleContent,
  LegalDocumentRelease,
  LegalDocumentSource,
  LegalDocumentStatus,
  LegalDocumentView,
  LegalDraftIdentity,
  LegalLocale,
  LegalOperatorProfile,
  LegalOperatorProfileId,
} from "./types.js";

import {
  CURRENT_PERSONAL_DATA_LEGAL_CONTOUR,
  assertContactConsentPublishable,
} from "@vbtech/legal-documents";
export {
  normalizeContact,
  validateDraft,
} from "./contact-validation.js";
export type {
  ContactDraft,
  ContactField,
  ContactValidation,
} from "./contact-validation.js";

export interface ContactSubmissionReadiness {
  submissionEnabled: boolean;
  consentIdentity: string;
}

export function resolveContactSubmissionReadiness(
  submissionEnabled: boolean,
): ContactSubmissionReadiness {
  const consentIdentity = CURRENT_PERSONAL_DATA_LEGAL_CONTOUR.consent.identity;
  assertContactConsentPublishable(consentIdentity, submissionEnabled);
  return {
    submissionEnabled,
    consentIdentity,
  };
}

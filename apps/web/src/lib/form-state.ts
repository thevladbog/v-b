import {
  CURRENT_CONTACT_CONSENT_ID,
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
  assertContactConsentPublishable(CURRENT_CONTACT_CONSENT_ID, submissionEnabled);
  return {
    submissionEnabled,
    consentIdentity: CURRENT_CONTACT_CONSENT_ID,
  };
}

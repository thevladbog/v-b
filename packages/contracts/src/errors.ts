export const CONTACT_ERROR_CODES = [
  "invalid_request",
  "consent_changed",
  "captcha_required",
  "captcha_rejected",
  "captcha_unavailable",
  "rate_limited",
  "submission_disabled",
  "temporarily_unavailable",
] as const;

export type ContactErrorCode = (typeof CONTACT_ERROR_CODES)[number];

export interface ContactAcceptedResponse {
  accepted: true;
  requestId: string;
}

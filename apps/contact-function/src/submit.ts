import type { ContactAcceptedResponse, ContactRequest } from "@vbtech/contracts";
import { CURRENT_CONTACT_CONSENT_ID } from "@vbtech/legal-documents";
import { isPublicContactError, publicError } from "./errors.js";

export interface SubmissionRateLimiter {
  assertAllowed(source: string): Promise<void>;
}

export interface SubmissionCaptcha {
  assertHuman(token: string, source: string): Promise<void>;
}

export interface SubmissionRepository {
  accept(input: ContactRequest): Promise<unknown>;
}

export interface SubmitContactDependencies {
  enabled: boolean;
  limiter: SubmissionRateLimiter;
  captcha: SubmissionCaptcha;
  repository: SubmissionRepository;
}

export type SubmitContact = (
  input: ContactRequest,
  source: string,
) => Promise<ContactAcceptedResponse>;

export const createSubmitContact = (
  dependencies: SubmitContactDependencies,
): SubmitContact => async (input, source) => {
  if (!dependencies.enabled) throw publicError("submission_disabled", 404);
  if (input.consentId !== CURRENT_CONTACT_CONSENT_ID) {
    throw publicError("consent_revision_changed", 409);
  }
  if (input.website !== "") throw publicError("invalid_request", 400);

  await dependencies.limiter.assertAllowed(source);
  await dependencies.captcha.assertHuman(input.captchaToken, source);
  try {
    await dependencies.repository.accept(input);
  } catch (error) {
    if (isPublicContactError(error)) throw error;
    throw publicError("temporarily_unavailable", 503);
  }

  return { accepted: true, requestId: input.requestId };
};

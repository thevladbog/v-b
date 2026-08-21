import type { SiteContent } from "./types.js";

export type ContactContent = SiteContent["contact"];

export function resolveContactContent(
  content: ContactContent,
  submissionEnabled: boolean,
): ContactContent {
  if (!submissionEnabled) return content;
  const { consentError, ...active } = content.activeSubmission;
  return {
    ...content,
    ...active,
    errors: {
      ...content.errors,
      consent: consentError,
    },
  };
}

import { contactRequestSchema } from "@vbtech/contracts";
import type { Locale } from "@vbtech/content";

export type ContactField = "name" | "contact" | "message" | "consent";

export interface ContactDraft {
  name: string;
  contact: string;
  message: string;
  consent: boolean;
}

export interface ContactValidation {
  valid: boolean;
  fields: readonly ContactField[];
}

export function normalizeContact(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("@") ? trimmed : trimmed.toLowerCase();
}

export function validateDraft(
  draft: ContactDraft,
  locale: Locale,
): ContactValidation {
  const name = draft.name.trim();
  const contact = normalizeContact(draft.contact);
  const message = draft.message.trim();
  const result = contactRequestSchema.safeParse({
    requestId: "00000000-0000-4000-8000-000000000000",
    locale,
    name,
    contact,
    message,
    sourcePath: locale === "ru" ? "/" : "/en/",
    consentId: "local-validation",
    captchaToken: "local-validation",
    website: "",
  });
  const invalidPaths = new Set(
    result.success
      ? []
      : result.error.issues
          .map(({ path }) => path[0])
          .filter((path): path is ContactField =>
            path === "name" || path === "contact" || path === "message"),
  );
  const fields: ContactField[] = ["name", "contact", "message"].filter(
    (field): field is ContactField => invalidPaths.has(field as ContactField),
  );
  if (!draft.consent) fields.push("consent");

  return { valid: fields.length === 0, fields };
}

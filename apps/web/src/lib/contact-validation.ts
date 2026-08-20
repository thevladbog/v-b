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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEGRAM_PATTERN = /^@[A-Za-z0-9_]{5,}$/;

export function normalizeContact(value: string): string {
  return value.trim();
}

export function validateDraft(
  draft: ContactDraft,
  _locale: Locale,
): ContactValidation {
  const fields: ContactField[] = [];
  const name = draft.name.trim();
  const contact = normalizeContact(draft.contact);
  const message = draft.message.trim();

  if (name.length === 0 || name.length > 100) fields.push("name");
  if (
    contact.length === 0 ||
    contact.length > 254 ||
    (!EMAIL_PATTERN.test(contact) && !TELEGRAM_PATTERN.test(contact))
  ) {
    fields.push("contact");
  }
  if (message.length === 0 || message.length > 4_000) fields.push("message");
  if (!draft.consent) fields.push("consent");

  return { valid: fields.length === 0, fields };
}

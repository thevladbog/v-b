import { z } from "zod";

export const CONTACT_LOCALES = ["ru", "en"] as const;
export const CONTACT_SOURCE_PATHS = ["/", "/en/"] as const;

const CONTROL_CHARACTER = /\p{Cc}/u;
const EMAIL_CONTACT = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const TELEGRAM_CONTACT = /^@[A-Za-z0-9_]{5,32}$/;

const hasNoControlCharacters = (value: string) => !CONTROL_CHARACTER.test(value);

const boundedText = (maximum: number) =>
  z.string().trim().min(1).max(maximum).refine(hasNoControlCharacters, {
    message: "Control characters are not supported",
  });

export const isEmailContact = (contact: string): boolean =>
  hasNoControlCharacters(contact) && EMAIL_CONTACT.test(contact);

const isValidContact = (contact: string) =>
  isEmailContact(contact) || TELEGRAM_CONTACT.test(contact);

export const contactRequestSchema = z
  .object({
    requestId: z.uuid(),
    locale: z.enum(CONTACT_LOCALES),
    name: boundedText(100),
    contact: boundedText(254).refine(isValidContact, {
      message: "Contact must be a lower-case email or Telegram handle",
    }),
    message: boundedText(4_000),
    sourcePath: z.enum(CONTACT_SOURCE_PATHS),
    consentId: boundedText(64),
    captchaToken: boundedText(4_096),
    website: z.string().max(200).refine(hasNoControlCharacters, {
      message: "Control characters are not supported",
    }),
  })
  .strict();

export type ContactLocale = (typeof CONTACT_LOCALES)[number];
export type ContactRequest = z.infer<typeof contactRequestSchema>;

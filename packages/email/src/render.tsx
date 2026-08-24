import { render } from "@react-email/render";
import { CONTACT_FIELD_LIMITS, isEmailContact } from "@vbtech/contracts";
import { CURRENT_CONTACT_CONSENT_ID } from "@vbtech/legal-documents";
import type { ReactElement } from "react";
import { ContactConfirmation } from "./confirmation.js";
import { ContactNotification } from "./notification.js";
import type { ContactEmailInput, RenderedEmail } from "./types.js";

const subjects = {
  confirmation: {
    en: "We received your v-b.tech enquiry",
    ru: "Ваше обращение с v-b.tech получено",
  },
  notificationPrefix: {
    en: "New v-b.tech enquiry",
    ru: "Новое обращение с v-b.tech",
  },
} as const;

async function renderEmail(subject: string, component: ReactElement): Promise<RenderedEmail> {
  const [html, text] = await Promise.all([
    render(component),
    render(component, { plainText: true }),
  ]);

  return { subject, html, text };
}

const assertCurrentConsent = (input: ContactEmailInput): void => {
  if (input.consentId !== CURRENT_CONTACT_CONSENT_ID) {
    throw new TypeError("Contact email consent identity is not current");
  }
};

const notificationSubject = (input: ContactEmailInput): string => {
  if (
    input.contact.length < 1 ||
    input.contact.length > CONTACT_FIELD_LIMITS.contact ||
    /\p{Cc}/u.test(input.contact)
  ) {
    throw new TypeError("Contact notification subject requires a valid contact");
  }
  return `${subjects.notificationPrefix[input.locale]} — ${input.contact}`;
};

export async function renderContactNotification(input: ContactEmailInput): Promise<RenderedEmail> {
  assertCurrentConsent(input);
  return renderEmail(notificationSubject(input), <ContactNotification input={input} />);
}

export async function renderContactConfirmation(input: ContactEmailInput): Promise<RenderedEmail> {
  assertCurrentConsent(input);
  if (!isEmailContact(input.contact)) {
    throw new TypeError("Contact confirmation requires a valid email contact");
  }

  return renderEmail(subjects.confirmation[input.locale], <ContactConfirmation input={input} />);
}

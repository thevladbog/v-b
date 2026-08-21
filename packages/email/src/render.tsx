import { render } from "@react-email/render";
import { isEmailContact } from "@vbtech/contracts";
import type { ReactElement } from "react";
import { ContactConfirmation } from "./confirmation.js";
import { ContactNotification } from "./notification.js";
import type { ContactEmailInput, RenderedEmail } from "./types.js";

const subjects = {
  confirmation: {
    en: "We received your v-b.tech enquiry",
    ru: "Ваше обращение с v-b.tech получено",
  },
  notification: {
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

export function renderContactNotification(input: ContactEmailInput): Promise<RenderedEmail> {
  return renderEmail(subjects.notification[input.locale], <ContactNotification input={input} />);
}

export function renderContactConfirmation(input: ContactEmailInput): Promise<RenderedEmail> {
  if (!isEmailContact(input.contact)) {
    return Promise.reject(new TypeError("Contact confirmation requires a valid email contact"));
  }

  return renderEmail(subjects.confirmation[input.locale], <ContactConfirmation input={input} />);
}

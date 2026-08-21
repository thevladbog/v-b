import type { ContactLocale } from "@vbtech/contracts";

export interface ContactEmailInput {
  locale: ContactLocale;
  requestId: string;
  receivedAt: Date;
  sourcePath: string;
  consentId: string;
  name: string;
  contact: string;
  message: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

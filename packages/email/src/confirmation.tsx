import { OPERATOR_PROFILES } from "@vbtech/legal-documents";
import type { ContactEmailInput } from "./types.js";
import { EMAIL_STYLES, EmailLink, EmailTheme } from "./theme.js";

const operator = OPERATOR_PROFILES["operator-vbtech-2026-08-20"];

const copy = {
  en: {
    footer: "v-b.tech · Product engineering for systems that need to work.",
    heading: "Your enquiry was received",
    nextStep: "I will review it and reply if a next step is useful.",
    preview: "Your v-b.tech enquiry was received.",
    requestId: "Request ID",
    routes: "For a direct follow-up, use email or Telegram.",
  },
  ru: {
    footer: "v-b.tech · Продуктовая инженерия для систем, которые должны работать.",
    heading: "Ваше обращение получено",
    nextStep: "Я просмотрю обращение и отвечу, если следующий шаг будет полезен.",
    preview: "Ваше обращение с v-b.tech получено.",
    requestId: "Идентификатор обращения",
    routes: "Для прямой связи используйте email или Telegram.",
  },
} as const;

export function ContactConfirmation({ input }: { input: ContactEmailInput }) {
  const localized = copy[input.locale];

  return (
    <EmailTheme footer={localized.footer} locale={input.locale} preview={localized.preview}>
      <h1 style={EMAIL_STYLES.heading}>{localized.heading}</h1>
      <p style={EMAIL_STYLES.copy}>{localized.nextStep}</p>
      <p style={EMAIL_STYLES.copy}>
        {localized.requestId}: {input.requestId}
      </p>
      <p style={EMAIL_STYLES.copy}>{localized.routes}</p>
      <p style={EMAIL_STYLES.copy}>
        <EmailLink href={`mailto:${operator.email}`}>{operator.email}</EmailLink>
        {" · "}
        <EmailLink href="https://t.me/thevladbog">@thevladbog</EmailLink>
      </p>
    </EmailTheme>
  );
}

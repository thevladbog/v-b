import type { ContactEmailInput } from "./types.js";
import { EMAIL_STYLES, EmailTheme } from "./theme.js";

const copy = {
  en: {
    footer: "v-b.tech · Product engineering for systems that need to work.",
    heading: "New enquiry",
    preview: "New enquiry",
    labels: {
      consent: "Consent ID",
      contact: "Contact",
      locale: "Locale",
      message: "Message",
      name: "Name",
      receivedAt: "Received at",
      requestId: "Request ID",
      sourcePath: "Source path",
    },
  },
  ru: {
    footer: "v-b.tech · Продуктовая инженерия для систем, которые должны работать.",
    heading: "Новое обращение",
    preview: "Новое обращение",
    labels: {
      consent: "Идентификатор согласия",
      contact: "Контакт",
      locale: "Язык",
      message: "Сообщение",
      name: "Имя",
      receivedAt: "Получено",
      requestId: "Идентификатор обращения",
      sourcePath: "Исходный путь",
    },
  },
} as const;

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <table cellPadding="0" cellSpacing="0" role="presentation" style={{ width: "100%" }}>
      <tbody>
        <tr>
          <td>
            <p style={EMAIL_STYLES.detailLabel}>{label}</p>
            <p style={EMAIL_STYLES.detailValue}>{value}</p>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function ContactNotification({ input }: { input: ContactEmailInput }) {
  const localized = copy[input.locale];
  const preview = `${localized.preview} — ${input.contact}`;

  return (
    <EmailTheme footer={localized.footer} locale={input.locale} preview={preview}>
      <h1 style={EMAIL_STYLES.heading}>{localized.heading}</h1>
      <hr style={{ borderColor: "#d8d1c5", margin: "20px 0" }} />
      <Detail label={localized.labels.name} value={input.name} />
      <Detail label={localized.labels.contact} value={input.contact} />
      <Detail label={localized.labels.message} value={input.message} />
      <hr style={{ borderColor: "#d8d1c5", margin: "20px 0" }} />
      <Detail label={localized.labels.locale} value={input.locale} />
      <Detail label={localized.labels.sourcePath} value={input.sourcePath} />
      <Detail label={localized.labels.receivedAt} value={input.receivedAt.toISOString()} />
      <Detail label={localized.labels.requestId} value={input.requestId} />
      <Detail label={localized.labels.consent} value={input.consentId} />
    </EmailTheme>
  );
}

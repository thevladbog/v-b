import type {
  LegalDocumentCode,
  LegalDocumentLocaleContent,
  LegalDocumentView,
  LegalLocale,
  LegalPublishedIdentity,
} from "../../../packages/legal-documents/src/index.ts";

export type { LegalDocumentView } from "../../../packages/legal-documents/src/index.ts";

const revision = "2099.01/01" as const;
const effectiveDate = "2099-01-01" as const;
const identity = (code: LegalDocumentCode): LegalPublishedIdentity => `${code}/${revision}`;

export const CURRENT_CONTACT_CONSENT_ID = identity("VBT-PD-02");

const routes = {
  "VBT-PD-01": { ru: "/privacy/", en: "/en/privacy/" },
  "VBT-PD-02": { ru: "/personal-data-consent/", en: "/en/personal-data-consent/" },
} as const;

const copy = {
  ru: {
    "VBT-PD-01": {
      title: "Политика обработки персональных данных — синтетическая тестовая редакция",
      description: "Синтетическая действующая редакция для закрытого тестового контура формы обращения v-b.tech.",
      summary: "Синтетическая действующая редакция для закрытого тестового контура.",
      heading: "1. Граница тестового документа",
      body: "Текст используется только для закрытой автоматизированной проверки ACTIVE-состояния. Публичная формулировка требует отдельного юридического согласования.",
    },
    "VBT-PD-02": {
      title: "Согласие на обработку персональных данных — синтетическая тестовая редакция",
      description: "Синтетическое действующее согласие для закрытого тестового контура формы обращения v-b.tech.",
      summary: "Синтетическая действующая редакция для закрытого тестового контура.",
      heading: "1. Подтверждение в тестовом контуре",
      body: "В закрытой проверке посетитель подтверждает текущую синтетическую редакцию отдельным изначально снятым флажком перед отправкой формы.",
    },
  },
  en: {
    "VBT-PD-01": {
      title: "Personal Data Processing Policy — synthetic test revision",
      description: "Synthetic active revision for the private v-b.tech enquiry-form test contour.",
      summary: "Synthetic active revision for the private test contour.",
      heading: "1. Test-document boundary",
      body: "This text is used only for private automated ACTIVE-state verification. Public wording requires separate legal approval.",
    },
    "VBT-PD-02": {
      title: "Personal Data Processing Consent — synthetic test revision",
      description: "Synthetic active consent for the private v-b.tech enquiry-form test contour.",
      summary: "Synthetic active revision for the private test contour.",
      heading: "1. Confirmation in the test contour",
      body: "In the private verification flow, the visitor accepts the current synthetic revision through a separate initially unchecked box before sending the form.",
    },
  },
} as const;

const contentFor = (
  code: LegalDocumentCode,
  locale: LegalLocale,
): LegalDocumentLocaleContent => {
  const localized = copy[locale][code];
  return {
    documentCode: code,
    releaseIdentity: identity(code),
    locale,
    title: localized.title,
    description: localized.description,
    summary: localized.summary,
    sections: [{
      id: "synthetic-test-boundary",
      requirements: ["scope", "lifecycle"],
      heading: localized.heading,
      blocks: [{ kind: "paragraph", text: localized.body }],
    }],
  };
};

const documentFor = (
  code: LegalDocumentCode,
  locale: LegalLocale,
): LegalDocumentView => ({
  code,
  identity: identity(code),
  revision,
  effectiveDate,
  status: "active",
  operatorProfileId: "operator-vbtech-2026-08-20",
  routes: routes[code],
  content: contentFor(code, locale),
});

export function assertContactConsentPublishable(
  consentIdentity: string,
  submissionEnabled: boolean,
): void {
  if (!submissionEnabled) return;
  if (consentIdentity !== CURRENT_CONTACT_CONSENT_ID) {
    throw new Error(`Consent ${consentIdentity} is not the private active test consent`);
  }
}

export function getCurrentLegalDocument(
  code: LegalDocumentCode,
  locale: LegalLocale,
): LegalDocumentView {
  return documentFor(code, locale);
}

export function listCurrentLegalDocuments(locale: LegalLocale): readonly LegalDocumentView[] {
  return (["VBT-PD-01", "VBT-PD-02"] as const).map((code) => documentFor(code, locale));
}

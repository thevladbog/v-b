import { describe, expect, it } from "vitest";
import {
  assertCompleteLocalizedStrings,
  LOCALES,
  SITE_CONTENT,
} from "../src/index.js";

describe("site content", () => {
  it.each(LOCALES)("has complete %s content", (locale) => {
    const page = SITE_CONTENT[locale];
    expect(() => assertCompleteLocalizedStrings(page)).not.toThrow();
    expect(page.meta.title).toBeTruthy();
    expect(page.hero.title).toBeTruthy();
    expect(page.cases).toHaveLength(3);
    expect(new Set(page.cases.map((item) => item.id))).toEqual(
      new Set(["markiro", "idento", "quokkaq"]),
    );
    expect(Object.keys(page.contact.errors)).toEqual([
      "name",
      "contact",
      "message",
      "consent",
    ]);
    expect(page.contact.directContactContext).toBeTruthy();
    expect(page.contact.consentDraftContext).toBeTruthy();
  });

  it("keeps canonical legal identities out of localized copy", () => {
    expect(JSON.stringify(SITE_CONTENT)).not.toMatch(/VBT-PD-\d+/);
  });

  it("defines exact state-aware contact copy while preserving the DRAFT wording", () => {
    expect(SITE_CONTENT.ru.contact).toMatchObject({
      directContactContext: "Онлайн-форма пока недоступна. Telegram и email работают и остаются прямыми способами связи.",
      formTitle: "Черновик обращения",
      formNote: "Это отключённая production-оболочка: данные не передаются.",
      formConsentInstruction: "Флажок изначально снят. Перед возможной отправкой потребуется отдельное согласие.",
      consentLinkLabel: "проектом согласия на обработку персональных данных",
      consentDraftContext: "Проект не вступил в силу; согласие пока нельзя принять.",
      errors: { consent: "Для отправки потребуется явно подтвердить согласие." },
      activeSubmission: {
        directContactContext: "Отправьте обращение через форму ниже или свяжитесь напрямую по email или в Telegram.",
        formTitle: "Отправить обращение",
        formNote: "Форма передаёт введённые данные, чтобы я мог ответить на обращение. Ознакомьтесь с действующей политикой обработки персональных данных и согласием по ссылкам выше.",
        formConsentInstruction: "Перед отправкой ознакомьтесь с действующим согласием и примите его, установив флажок. Действующая редакция:",
        consentLinkLabel: "согласием на обработку персональных данных",
        consentDraftContext: "Это согласие применяется к отправке формы.",
        formSuccess: "Обращение заполнено корректно.",
        consentError: "Ознакомьтесь с действующим согласием и примите его, установив флажок.",
      },
    });
    expect(SITE_CONTENT.en.contact).toMatchObject({
      directContactContext: "Online submission is currently unavailable. Telegram and email remain active direct contact options.",
      formTitle: "Enquiry draft",
      formNote: "This is a disabled production shell: no data is transmitted.",
      formConsentInstruction: "The checkbox starts unchecked. Separate consent will be required before submission can be enabled.",
      consentLinkLabel: "draft personal data processing consent",
      consentDraftContext: "The draft consent cannot yet be accepted because it is not in force.",
      errors: { consent: "Submission will require explicit consent confirmation." },
      activeSubmission: {
        directContactContext: "Send an enquiry using the form below, or contact me directly by email or Telegram.",
        formTitle: "Send an enquiry",
        formNote: "The form transmits the entered data so I can respond to your enquiry. Review the current personal data processing policy and consent linked above.",
        formConsentInstruction: "Review and accept the current consent by selecting the checkbox before sending. Current revision:",
        consentLinkLabel: "personal data processing consent",
        consentDraftContext: "This consent applies to the form submission.",
        formSuccess: "The enquiry is valid.",
        consentError: "Review and accept the current consent by selecting the checkbox.",
      },
    });
  });

  it("rejects a blank nested translation", () => {
    const page = structuredClone(SITE_CONTENT.en);
    page.contact.formSubmit = " ";

    expect(() => assertCompleteLocalizedStrings(page)).toThrow(
      "content.contact.formSubmit",
    );
  });

  it("ignores non-string facts while checking nested translations", () => {
    expect(() =>
      assertCompleteLocalizedStrings({
        translation: "Present",
        facts: { enabled: false, revision: 0 },
      }),
    ).not.toThrow();
  });
});

import type { LegalDocumentLocaleContent, LegalLocale } from "../types.js";

export const CONSENT_CONTENT = {
  ru: {
    locale: "ru",
    title: "Согласие на обработку персональных данных — проект",
    description:
      "Проект согласия для будущей формы обращения v-b.tech; принять его нельзя, онлайн-отправка отключена.",
    summary:
      "Этот проект описывает предполагаемое отдельное согласие, но не является действующей редакцией и не может быть принято посетителем.",
    sections: [
      {
        id: "draft-boundary",
        heading: "1. Статус проекта и действие посетителя",
        blocks: [
          { kind: "paragraph", text: "Онлайн-отправка отключена, поэтому этот проект согласия пока нельзя принять. В будущем согласие предполагает добровольное утвердительное действие: посетитель самостоятельно отмечает изначально не отмеченный обязательный флажок и до отправки получает отдельные ссылки на политику и согласие." },
          { kind: "paragraph", text: "Идентификатор кандидата: VBT-PD-02/DRAFT. Код: VBT-PD-02. Публичная редакция не присвоена; дата вступления в силу отсутствует." },
        ],
      },
      {
        id: "operator",
        heading: "2. Предполагаемый оператор",
        blocks: [
          { kind: "paragraph", text: "Богатырев Владислав Сергеевич; почтовый адрес: 353745, Краснодарский край, Ленинградский район, ст. Ленинградская, ул. Грузская, д. 26; email: hello@v-b.tech; телефон: +7 934 355-14-90; сайт: https://v-b.tech." },
        ],
      },
      {
        id: "data-purposes-and-exclusions",
        heading: "3. Данные, цели и исключения",
        blocks: [
          { kind: "paragraph", text: "Предполагаемое согласие охватывает имя до 100 символов, контакт email или @telegram до 254 символов и сообщение до 4 000 символов, без вложений, а также UUID обращения, локаль, разрешенный исходный путь, идентификатор согласия, время отправки и доставки, ограниченные captcha-, антиабьюз- и сетевые свидетельства и ограниченную историю доставки." },
          { kind: "unordered-list", items: ["ответ и уточнение обращения;", "непосредственно связанная деловая переписка;", "транзакционное подтверждение только для email;", "предотвращение автоматизированных злоупотреблений;", "защита и диагностика сервиса."] },
          { kind: "paragraph", text: "Не допускаются реклама, новостные рассылки, аналитика, профилирование, обогащение лидов, продажа данных, передача в CRM или несвязанное повторное использование." },
        ],
      },
      {
        id: "operations-and-providers",
        heading: "4. Операции, способы и категории поставщиков",
        blocks: [
          { kind: "paragraph", text: "Предполагаются сбор, запись, систематизация, накопление, хранение, уточнение, извлечение, использование, необходимая передача привлеченным обработчикам, блокирование, удаление и уничтожение автоматизированным и неавтоматизированным способом." },
          { kind: "paragraph", text: "Категории поставщиков: Yandex Cloud для размещения, функций, базы данных и секретов; Postbox для транзакционной доставки; SmartCaptcha только после включения отправки; почтовый провайдер оператора для переписки. Точные договорные лица, роли, регионы и условия должны быть проверены до активации." },
        ],
      },
      {
        id: "term-and-withdrawal",
        heading: "5. Срок, короткий цикл доставки и отзыв",
        blocks: [
          { kind: "paragraph", text: "Обращение и связанная переписка предполагаются к хранению не более одного года после последнего содержательного контакта при отсутствии иного документированного основания. Зашифрованная полезная нагрузка очереди стирается по более короткому расписанию после терминального результата, а техническая история ограничена операционным сроком." },
          { kind: "paragraph", text: "Отозвать будущее согласие можно письмом на hello@v-b.tech или почтовым отправлением по адресу оператора. Отзыв не отменяет обработку до его получения; ограниченное продолжение возможно только при другом применимом основании." },
        ],
      },
      {
        id: "language-and-warning",
        heading: "6. Язык и предупреждение",
        blocks: [
          { kind: "paragraph", text: "После активации приоритетным будет русский текст конкретной редакции. Английский текст является информационным переводом соответствующего русского текста." },
          { kind: "paragraph", text: "VBT-PD-02/DRAFT — только проект: онлайн-отправка отключена, принять его нельзя, публичная редакция и дата вступления в силу отсутствуют." },
        ],
      },
    ],
  },
  en: {
    locale: "en",
    title: "Consent to Personal Data Processing — Draft",
    description:
      "Draft consent for the future v-b.tech enquiry form; it cannot be accepted while online submission is disabled.",
    summary:
      "This draft describes an intended separate consent, but it is not an active revision and cannot be accepted by a visitor.",
    sections: [
      {
        id: "draft-boundary",
        heading: "1. Draft status and visitor action",
        blocks: [
          { kind: "paragraph", text: "Online submission is disabled, so this draft consent cannot yet be accepted. A future consent is intended to require voluntary affirmative action: the visitor selects an initially unchecked required checkbox and receives separate policy and consent links before submitting." },
          { kind: "paragraph", text: "Candidate identity: VBT-PD-02/DRAFT. Code: VBT-PD-02. No public revision has been assigned and no effective date exists." },
        ],
      },
      {
        id: "operator",
        heading: "2. Intended controller",
        blocks: [
          { kind: "paragraph", text: "Богатырев Владислав Сергеевич; postal address: 353745, Краснодарский край, Ленинградский район, ст. Ленинградская, ул. Грузская, д. 26; email: hello@v-b.tech; phone: +7 934 355-14-90; site: https://v-b.tech." },
        ],
      },
      {
        id: "data-purposes-and-exclusions",
        heading: "3. Data, purposes, and exclusions",
        blocks: [
          { kind: "paragraph", text: "The intended consent covers a name up to 100 characters, a contact as email or @telegram up to 254 characters, and a message up to 4,000 characters, with no attachments, together with the enquiry UUID, locale, allow-listed source path, consent identity, submission and delivery times, bounded captcha, anti-abuse, and network evidence, and bounded delivery history." },
          { kind: "unordered-list", items: ["replying to and clarifying the enquiry;", "directly related business correspondence;", "a transactional receipt only for email;", "preventing automated abuse;", "securing and diagnosing the service."] },
          { kind: "paragraph", text: "No advertising, newsletter, analytics, profiling, lead enrichment, data sale, CRM transfer, or unrelated reuse is permitted." },
        ],
      },
      {
        id: "operations-and-providers",
        heading: "4. Operations, methods, and provider categories",
        blocks: [
          { kind: "paragraph", text: "Intended operations are collection, recording, organization, accumulation, storage, correction, retrieval, use, necessary transfer to engaged processors, restriction, erasure, and destruction by automated and non-automated means." },
          { kind: "paragraph", text: "Provider categories are Yandex Cloud for hosting, function, database, and secrets; Postbox for transactional delivery; SmartCaptcha only after submission is enabled; and the controller's mailbox provider for correspondence. Exact contracting entities, roles, regions, and terms must be reviewed before activation." },
        ],
      },
      {
        id: "term-and-withdrawal",
        heading: "5. Term, short delivery lifecycle, and withdrawal",
        blocks: [
          { kind: "paragraph", text: "The enquiry and related correspondence are intended to be retained for no more than one year after the last substantive contact unless another documented ground applies. The encrypted outbox payload is erased on a shorter schedule after a terminal outcome, and technical history is limited to an operational term." },
          { kind: "paragraph", text: "Future consent may be withdrawn by emailing hello@v-b.tech or posting to the controller's address. Withdrawal does not invalidate prior processing; limited continuation is possible only under another applicable ground." },
        ],
      },
      {
        id: "language-and-warning",
        heading: "6. Language and warning",
        blocks: [
          { kind: "paragraph", text: "After activation, the Russian text of a specific revision will be authoritative. This English text is an informational translation of the matching Russian text." },
          { kind: "paragraph", text: "VBT-PD-02/DRAFT is only a draft: online submission is disabled, it cannot be accepted, no public revision has been assigned, and no effective date exists." },
        ],
      },
    ],
  },
} as const satisfies Readonly<Record<LegalLocale, LegalDocumentLocaleContent>>;

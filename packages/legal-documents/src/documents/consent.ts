import type {
  LegalContentRequirement,
  LegalDocumentLocaleContent,
  LegalLocale,
} from "../types.js";

const CONSENT_SECTION_REQUIREMENTS = {
  "draft-boundary": ["affirmative-action", "consent-boundary", "lifecycle"],
  operator: ["operator"],
  "data-purposes-and-exclusions": [
    "user-data",
    "sensitive-data-warning",
    "operational-data",
    "purposes",
    "exclusions",
    "captcha",
    "logs",
  ],
  "operations-and-providers": ["operations", "providers", "provider-review"],
  "term-and-withdrawal": ["retention", "delivery-lifecycle", "withdrawal"],
  "language-and-warning": ["authoritative-language", "lifecycle"],
} as const satisfies Readonly<Record<string, readonly LegalContentRequirement[]>>;

export const CONSENT_CONTENT = {
  ru: {
    documentCode: "VBT-PD-02",
    releaseIdentity: "VBT-PD-02/DRAFT",
    locale: "ru",
    title: "Согласие на обработку персональных данных — проект",
    description:
      "Проект согласия для будущей формы обращения v-b.tech; принять его нельзя, онлайн-отправка отключена.",
    summary:
      "Этот проект описывает предполагаемое отдельное согласие, но не является действующей редакцией и не может быть принято посетителем.",
    sections: [
      {
        id: "draft-boundary",
        requirements: CONSENT_SECTION_REQUIREMENTS["draft-boundary"],
        heading: "1. Статус проекта и действие посетителя",
        blocks: [
          { kind: "paragraph", text: "Онлайн-отправка отключена, поэтому этот проект согласия пока нельзя принять. В будущем согласие предполагает добровольное утвердительное действие: посетитель самостоятельно отмечает изначально не отмеченный обязательный флажок и до отправки получает отдельные ссылки на политику и согласие." },
          { kind: "paragraph", text: "Идентификатор кандидата: VBT-PD-02/DRAFT. Код: VBT-PD-02. Публичная редакция не присвоена; дата вступления в силу отсутствует." },
        ],
      },
      {
        id: "operator",
        requirements: CONSENT_SECTION_REQUIREMENTS.operator,
        heading: "2. Предполагаемый оператор",
        blocks: [
          { kind: "paragraph", text: "Богатырев Владислав Сергеевич; почтовый адрес: 353745, Краснодарский край, Ленинградский район, ст. Ленинградская, ул. Грузская, д. 26; email: hello@v-b.tech; телефон: +7 934 355-14-90; сайт: https://v-b.tech." },
        ],
      },
      {
        id: "data-purposes-and-exclusions",
        requirements: CONSENT_SECTION_REQUIREMENTS["data-purposes-and-exclusions"],
        heading: "3. Данные, цели и исключения",
        blocks: [
          { kind: "paragraph", text: "Предполагаемое согласие охватывает имя до 100 символов, контакт email или @telegram до 254 символов и сообщение до 4 000 символов, без вложений, а также UUID обращения, локаль, исходный путь из закрытого разрешенного списка, идентификатор согласия, временные метки отправки и доставки, результат проверки captcha, краткоживущий ключевой HMAC-дайджест ограниченного сетевого источника для фиксированного окна ограничения частоты, состояние доставки и ограниченные идентификаторы сообщений поставщика." },
          { kind: "paragraph", text: "Исходный IP-адрес не должен сохраняться в базе данных приложения. Для проверки SmartCaptcha может получать только проверочный токен и минимально необходимый сетевой контекст; имя, контакт и сообщение ей не передаются. Предполагаемые телеметрия и журналы приложения должны быть ограничены видом события, UUID обращения, этапом, статусом и длительностью и не должны включать персональное содержимое обращения, captcha-токен или секреты." },
          { kind: "paragraph", text: "Не следует отправлять пароли, платежные реквизиты, охраняемые законом тайны, специальные категории персональных данных или иную избыточную конфиденциальную информацию." },
          { kind: "unordered-list", items: ["ответ и уточнение обращения;", "непосредственно связанная деловая переписка;", "транзакционное подтверждение только для email;", "предотвращение автоматизированных злоупотреблений;", "защита и диагностика сервиса."] },
          { kind: "paragraph", text: "Не допускаются реклама, новостные рассылки, аналитика, профилирование, обогащение лидов, продажа данных, передача в CRM или несвязанное повторное использование." },
        ],
      },
      {
        id: "operations-and-providers",
        requirements: CONSENT_SECTION_REQUIREMENTS["operations-and-providers"],
        heading: "4. Операции, способы и категории поставщиков",
        blocks: [
          { kind: "paragraph", text: "Предполагаются сбор, запись, систематизация, накопление, хранение, уточнение, извлечение, использование, необходимая передача привлеченным обработчикам, блокирование, удаление и уничтожение автоматизированным и неавтоматизированным способом." },
          { kind: "paragraph", text: "Категории поставщиков: Yandex Cloud для размещения, функций, базы данных и секретов; Postbox для транзакционной доставки; SmartCaptcha только после включения отправки; почтовый провайдер оператора для переписки. Точные договорные лица, роли, регионы и условия должны быть проверены до активации." },
        ],
      },
      {
        id: "term-and-withdrawal",
        requirements: CONSENT_SECTION_REQUIREMENTS["term-and-withdrawal"],
        heading: "5. Срок, короткий цикл доставки и отзыв",
        blocks: [
          { kind: "paragraph", text: "Обращение и связанная переписка предполагаются к хранению не более одного года после последнего содержательного контакта при отсутствии иного документированного основания. Зашифрованная полезная нагрузка очереди стирается по более короткому расписанию после терминального результата, а техническая история ограничена операционным сроком." },
          { kind: "paragraph", text: "Отозвать будущее согласие можно письмом на hello@v-b.tech или почтовым отправлением по адресу оператора. Отзыв не отменяет обработку до его получения; ограниченное продолжение возможно только при другом применимом основании." },
        ],
      },
      {
        id: "language-and-warning",
        requirements: CONSENT_SECTION_REQUIREMENTS["language-and-warning"],
        heading: "6. Язык и предупреждение",
        blocks: [
          { kind: "paragraph", text: "После активации приоритетным будет русский текст конкретной редакции. Английский текст является информационным переводом соответствующего русского текста." },
          { kind: "paragraph", text: "VBT-PD-02/DRAFT — только проект: онлайн-отправка отключена, принять его нельзя, публичная редакция и дата вступления в силу отсутствуют." },
        ],
      },
    ],
  },
  en: {
    documentCode: "VBT-PD-02",
    releaseIdentity: "VBT-PD-02/DRAFT",
    locale: "en",
    title: "Consent to Personal Data Processing — Draft",
    description:
      "Draft consent for the future v-b.tech enquiry form; it cannot be accepted while online submission is disabled.",
    summary:
      "This draft describes an intended separate consent, but it is not an active revision and cannot be accepted by a visitor.",
    sections: [
      {
        id: "draft-boundary",
        requirements: CONSENT_SECTION_REQUIREMENTS["draft-boundary"],
        heading: "1. Draft status and visitor action",
        blocks: [
          { kind: "paragraph", text: "Online submission is disabled, so this draft consent cannot yet be accepted. A future consent is intended to require voluntary affirmative action: the visitor selects an initially unchecked required checkbox and receives separate policy and consent links before submitting." },
          { kind: "paragraph", text: "Candidate identity: VBT-PD-02/DRAFT. Code: VBT-PD-02. No public revision has been assigned and no effective date exists." },
        ],
      },
      {
        id: "operator",
        requirements: CONSENT_SECTION_REQUIREMENTS.operator,
        heading: "2. Intended controller",
        blocks: [
          { kind: "paragraph", text: "Богатырев Владислав Сергеевич; postal address: 353745, Краснодарский край, Ленинградский район, ст. Ленинградская, ул. Грузская, д. 26; email: hello@v-b.tech; phone: +7 934 355-14-90; site: https://v-b.tech." },
        ],
      },
      {
        id: "data-purposes-and-exclusions",
        requirements: CONSENT_SECTION_REQUIREMENTS["data-purposes-and-exclusions"],
        heading: "3. Data, purposes, and exclusions",
        blocks: [
          { kind: "paragraph", text: "The intended consent covers a name up to 100 characters, a contact as email or @telegram up to 254 characters, and a message up to 4,000 characters, with no attachments, together with the enquiry UUID, locale, source path from a closed allow-list, consent identity, submission and delivery timestamps, captcha verification outcome, a short-lived keyed HMAC digest of the bounded network source for a fixed rate-limit window, delivery state, and bounded provider message identifiers." },
          { kind: "paragraph", text: "The raw IP address must not be persisted in the application database. During verification SmartCaptcha may receive only the verification token and the minimum network context required; no name, contact, or message is sent to it. For the intended flow, application telemetry and logs must be limited to event kind, enquiry UUID, stage, status, and latency and must exclude the personal body, captcha token, and secrets." },
          { kind: "paragraph", text: "Visitors should not send passwords, payment details, legally protected secrets, special-category personal data, or other unnecessary confidential information." },
          { kind: "unordered-list", items: ["replying to and clarifying the enquiry;", "directly related business correspondence;", "a transactional receipt only for email;", "preventing automated abuse;", "securing and diagnosing the service."] },
          { kind: "paragraph", text: "No advertising, newsletter, analytics, profiling, lead enrichment, data sale, CRM transfer, or unrelated reuse is permitted." },
        ],
      },
      {
        id: "operations-and-providers",
        requirements: CONSENT_SECTION_REQUIREMENTS["operations-and-providers"],
        heading: "4. Operations, methods, and provider categories",
        blocks: [
          { kind: "paragraph", text: "Intended operations are collection, recording, organization, accumulation, storage, correction, retrieval, use, necessary transfer to engaged processors, restriction, erasure, and destruction by automated and non-automated means." },
          { kind: "paragraph", text: "Provider categories are Yandex Cloud for hosting, function, database, and secrets; Postbox for transactional delivery; SmartCaptcha only after submission is enabled; and the controller's mailbox provider for correspondence. Exact contracting entities, roles, regions, and terms must be reviewed before activation." },
        ],
      },
      {
        id: "term-and-withdrawal",
        requirements: CONSENT_SECTION_REQUIREMENTS["term-and-withdrawal"],
        heading: "5. Term, short delivery lifecycle, and withdrawal",
        blocks: [
          { kind: "paragraph", text: "The enquiry and related correspondence are intended to be retained for no more than one year after the last substantive contact unless another documented ground applies. The encrypted outbox payload is erased on a shorter schedule after a terminal outcome, and technical history is limited to an operational term." },
          { kind: "paragraph", text: "Future consent may be withdrawn by emailing hello@v-b.tech or posting to the controller's address. Withdrawal does not invalidate prior processing; limited continuation is possible only under another applicable ground." },
        ],
      },
      {
        id: "language-and-warning",
        requirements: CONSENT_SECTION_REQUIREMENTS["language-and-warning"],
        heading: "6. Language and warning",
        blocks: [
          { kind: "paragraph", text: "After activation, the Russian text of a specific revision will be authoritative. This English text is an informational translation of the matching Russian text." },
          { kind: "paragraph", text: "VBT-PD-02/DRAFT is only a draft: online submission is disabled, it cannot be accepted, no public revision has been assigned, and no effective date exists." },
        ],
      },
    ],
  },
} as const satisfies Readonly<Record<LegalLocale, LegalDocumentLocaleContent>>;

import type {
  LegalContentRequirement,
  LegalDocumentLocaleContent,
  LegalLocale,
} from "../types.js";

const POLICY_SECTION_REQUIREMENTS = {
  "operator-and-scope": ["operator", "scope"],
  "definitions-and-principles": ["definitions", "principles"],
  "subjects-and-user-data": ["subjects", "user-data", "sensitive-data-warning"],
  "operational-data": ["operational-data", "data-minimization"],
  "purposes-and-exclusions": ["purposes", "exclusions"],
  "grounds-and-consent": ["legal-grounds", "consent-boundary"],
  operations: ["operations"],
  "retention-and-destruction": ["retention", "delivery-lifecycle"],
  providers: ["providers", "provider-review"],
  "localization-and-transfer": ["localization", "cross-border"],
  "security-and-incidents": ["security", "incidents"],
  "subject-rights": ["subject-rights", "withdrawal"],
  "browser-storage-and-logs": ["browser-storage", "logs", "captcha"],
  "revisions-and-language": ["lifecycle", "authoritative-language"],
} as const satisfies Readonly<Record<string, readonly LegalContentRequirement[]>>;

export const PRIVACY_CONTENT = {
  ru: {
    documentCode: "VBT-PD-01",
    releaseIdentity: "VBT-PD-01/DRAFT",
    locale: "ru",
    title: "Политика обработки персональных данных — проект",
    description:
      "Проект политики обработки персональных данных для узкой формы обращения на сайте v-b.tech; документ не вступил в силу.",
    summary:
      "Проект описывает только предполагаемую обработку данных посетителя, который по своей инициативе направляет обращение через будущую форму v-b.tech.",
    sections: [
      {
        id: "operator-and-scope",
        requirements: POLICY_SECTION_REQUIREMENTS["operator-and-scope"],
        heading: "1. Оператор и область действия",
        blocks: [
          {
            kind: "paragraph",
            text: "Предполагаемый оператор: Богатырев Владислав Сергеевич; почтовый адрес: 353745, Краснодарский край, Ленинградский район, ст. Ленинградская, ул. Грузская, д. 26; email: hello@v-b.tech; телефон: +7 934 355-14-90; сайт: https://v-b.tech.",
          },
          {
            kind: "paragraph",
            text: "Политика ограничена сайтом v-b.tech и будущей формой проектного обращения. Субъекты — только посетители, которые сами решат отправить такое обращение. Документ является проектом, не действует и сам по себе не разрешает прием обращений.",
          },
        ],
      },
      {
        id: "definitions-and-principles",
        requirements: POLICY_SECTION_REQUIREMENTS["definitions-and-principles"],
        heading: "2. Термины, принципы и применимые права",
        blocks: [
          {
            kind: "definition-list",
            items: [
              { term: "Персональные данные", detail: "информация, относящаяся к прямо или косвенно определенному либо определяемому физическому лицу." },
              { term: "Обработка", detail: "действие или совокупность действий с персональными данными с автоматизацией либо без нее." },
              { term: "Блокирование", detail: "временное прекращение обработки, кроме случаев, необходимых для уточнения данных." },
              { term: "Уничтожение", detail: "действия, после которых содержание данных невозможно восстановить в информационной системе." },
            ],
          },
          {
            kind: "paragraph",
            text: "Обработка должна быть законной, добросовестной, ограниченной заранее определенными целями и минимально необходимым объемом, с обеспечением точности, ограничением хранения и защитой прав субъекта в соответствии с применимыми требованиями.",
          },
        ],
      },
      {
        id: "subjects-and-user-data",
        requirements: POLICY_SECTION_REQUIREMENTS["subjects-and-user-data"],
        heading: "3. Субъекты и данные, предоставляемые посетителем",
        blocks: [
          {
            kind: "paragraph",
            text: "Посетитель сможет указать только имя длиной не более 100 символов, контакт в виде email или @telegram длиной не более 254 символов и сообщение длиной не более 4 000 символов. Вложения не принимаются.",
          },
          {
            kind: "paragraph",
            text: "Не следует отправлять пароли, платежные реквизиты, охраняемые законом тайны, специальные категории персональных данных или иную избыточную конфиденциальную информацию.",
          },
        ],
      },
      {
        id: "operational-data",
        requirements: POLICY_SECTION_REQUIREMENTS["operational-data"],
        heading: "4. Ограниченные операционные данные",
        blocks: [
          {
            kind: "unordered-list",
            items: [
              "UUID-идентификатор обращения, локаль и исходный путь из закрытого разрешенного списка;",
              "идентификатор согласия, временные метки отправки и доставки;",
              "результат проверки captcha и краткоживущий ключевой HMAC-дайджест ограниченного сетевого источника для фиксированного окна ограничения частоты;",
              "состояние доставки и ограниченные идентификаторы сообщений поставщика.",
            ],
          },
          {
            kind: "paragraph",
            text: "Исходный IP-адрес не должен сохраняться в базе данных приложения. Для проверки SmartCaptcha может получать только проверочный токен и минимально необходимый сетевой контекст; имя, контакт и сообщение ей не передаются.",
          },
          {
            kind: "paragraph",
            text: "UUID обращения используется только как ограниченный идентификатор корреляции. Предполагаемые телеметрия и журналы приложения должны быть ограничены видом события, UUID обращения, этапом, статусом и длительностью; они не должны включать предоставленные пользователем поля — имя, контакт и сообщение — или иное персональное содержимое обращения, captcha-токен или секреты. Скрытое обогащение не предусматривается, произвольные источники перехода и маркетинговые метки не должны сохраняться.",
          },
        ],
      },
      {
        id: "purposes-and-exclusions",
        requirements: POLICY_SECTION_REQUIREMENTS["purposes-and-exclusions"],
        heading: "5. Цели и явные исключения",
        blocks: [
          {
            kind: "unordered-list",
            items: [
              "ответ на обращение и уточнение запроса;",
              "ведение непосредственно связанной деловой переписки;",
              "транзакционное подтверждение получения только при указании email;",
              "предотвращение автоматизированных злоупотреблений;",
              "защита и диагностика работы сервиса.",
            ],
          },
          {
            kind: "paragraph",
            text: "Эта версия не предусматривает рекламу, рассылку новостей, веб-аналитику, профилирование, обогащение лидов, продажу данных, передачу в CRM или повторное использование для несвязанных целей.",
          },
        ],
      },
      {
        id: "grounds-and-consent",
        requirements: POLICY_SECTION_REQUIREMENTS["grounds-and-consent"],
        heading: "6. Основания и граница отдельного согласия",
        blocks: [
          {
            kind: "paragraph",
            text: "До будущего включения формы обработка ее данных не начинается. Для добровольно отправленного обращения предполагается отдельное согласие VBT-PD-02 соответствующей действующей редакции. Проект VBT-PD-02/DRAFT не является действующей редакцией и не может быть принят посетителем.",
          },
          {
            kind: "paragraph",
            text: "После начала переписки отдельные операции могут иметь иное применимое основание, если оно действительно существует и документировано; настоящий проект заранее не утверждает наличие такого основания.",
          },
        ],
      },
      {
        id: "operations",
        requirements: POLICY_SECTION_REQUIREMENTS.operations,
        heading: "7. Операции и способы обработки",
        blocks: [
          {
            kind: "paragraph",
            text: "В предполагаемых пределах возможны сбор, запись, систематизация, накопление, хранение, уточнение, извлечение, использование, необходимая передача привлеченным обработчикам, блокирование, удаление и уничтожение. Обработка смешанная: автоматизированная и, при работе с перепиской, без средств автоматизации.",
          },
        ],
      },
      {
        id: "retention-and-destruction",
        requirements: POLICY_SECTION_REQUIREMENTS["retention-and-destruction"],
        heading: "8. Хранение, блокирование, удаление и уничтожение",
        blocks: [
          {
            kind: "paragraph",
            text: "Обращение и связанная деловая переписка предполагаются к хранению не более одного года после последнего содержательного контакта, если отсутствует иное документированное основание. Обоснованные запросы субъекта на блокирование, удаление или уничтожение рассматриваются отдельно.",
          },
          {
            kind: "paragraph",
            text: "Зашифрованная полезная нагрузка очереди доставки должна стираться по короткому расписанию после терминального результата. Ограниченная техническая история доставки хранится только в пределах операционного срока и не заменяет отдельное управление перепиской.",
          },
        ],
      },
      {
        id: "providers",
        requirements: POLICY_SECTION_REQUIREMENTS.providers,
        heading: "9. Поставщики и их предполагаемые роли",
        blocks: [
          {
            kind: "definition-list",
            items: [
              { term: "Yandex Cloud", detail: "размещение, функции, база данных и инфраструктура секретов по поручению оператора." },
              { term: "Postbox", detail: "транзакционная доставка сообщений в необходимом объеме." },
              { term: "SmartCaptcha", detail: "защита от автоматизированных обращений только после включения онлайн-отправки." },
              { term: "Почтовый провайдер оператора", detail: "прием и хранение связанной деловой переписки." },
            ],
          },
          {
            kind: "paragraph",
            text: "Точные договорные лица, роли, регионы обработки и действующие условия каждого поставщика подлежат повторной проверке до активации. Этот перечень не подтверждает заключение или содержание договоров.",
          },
        ],
      },
      {
        id: "localization-and-transfer",
        requirements: POLICY_SECTION_REQUIREMENTS["localization-and-transfer"],
        heading: "10. Российская локализация и трансграничная передача",
        blocks: [
          {
            kind: "paragraph",
            text: "Для будущей конфигурации первичный сбор, запись, систематизация, накопление, хранение, уточнение и извлечение данных граждан Российской Федерации должны выполняться с использованием баз данных на территории Российской Федерации.",
          },
          {
            kind: "paragraph",
            text: "Намеренная трансграничная передача не предусмотрена. Она не может быть включена без отдельной проверки получателей, оснований, процедур и обновления документов до начала такой передачи.",
          },
        ],
      },
      {
        id: "security-and-incidents",
        requirements: POLICY_SECTION_REQUIREMENTS["security-and-incidents"],
        heading: "11. Безопасность и инциденты",
        blocks: [
          {
            kind: "paragraph",
            text: "Предполагаются ограничение доступа, изоляция данных, защита секретов, шифрование полезной нагрузки доставки, контроль изменений, резервирование, ограниченное журналирование и сроки хранения соразмерно характеру данных и актуальным угрозам, без публикации сведений, ослабляющих защиту.",
          },
          {
            kind: "paragraph",
            text: "При подтвержденном инциденте оператор должен ограничить последствия, сохранить необходимые доказательства, выполнить применимые уведомления и организовать исправление причин.",
          },
        ],
      },
      {
        id: "subject-rights",
        requirements: POLICY_SECTION_REQUIREMENTS["subject-rights"],
        heading: "12. Доступ, уточнение, блокирование, удаление и отзыв",
        blocks: [
          {
            kind: "paragraph",
            text: "Запрос о доступе, уточнении, блокировании, удалении, уничтожении данных или отзыве согласия можно будет направить на hello@v-b.tech либо по почтовому адресу оператора. Для защиты данных оператор может запросить сведения, достаточные для подтверждения личности и поиска обращения.",
          },
          {
            kind: "paragraph",
            text: "Отзыв не отменяет законность обработки до его получения. Ограниченное продолжение возможно только при наличии другого применимого основания и сообщается субъекту применительно к его запросу.",
          },
        ],
      },
      {
        id: "browser-storage-and-logs",
        requirements: POLICY_SECTION_REQUIREMENTS["browser-storage-and-logs"],
        heading: "13. Хранилище браузера, журналы и captcha",
        blocks: [
          {
            kind: "paragraph",
            text: "Для выбора темы используется строго необходимая локальная запись vbtech-theme-v1. Сайт не использует аналитические или рекламные cookies. UUID обращения используется только как ограниченный идентификатор корреляции. Серверная и прикладная телеметрия и журналы должны быть ограничены видом события, UUID обращения, этапом, статусом и длительностью и не должны включать предоставленные пользователем поля — имя, контакт и сообщение — или иное персональное содержимое обращения, captcha-токен или секреты.",
          },
          {
            kind: "paragraph",
            text: "SmartCaptcha и связанные с ней ресурсы могут загружаться только когда онлайн-отправка включена; для проверки она может получить проверочный токен и минимально необходимый сетевой контекст, но имя, контакт и сообщение ей не передаются. До включения отправки captcha не работает и данные ей не передаются.",
          },
        ],
      },
      {
        id: "revisions-and-language",
        requirements: POLICY_SECTION_REQUIREMENTS["revisions-and-language"],
        heading: "14. Редакции, язык и статус проекта",
        blocks: [
          {
            kind: "paragraph",
            text: "Код документа: VBT-PD-01. Идентификатор кандидата: VBT-PD-01/DRAFT. Публичная редакция не присвоена, дата вступления в силу отсутствует. Документ является проектом, не вступил в силу и не подтверждает правовую проверку.",
          },
          {
            kind: "paragraph",
            text: "После активации приоритетным будет русский текст конкретной опубликованной редакции. Английский текст — информационный перевод соответствующего русского текста. Новая редакция публикуется как отдельный идентификатор после повторной проверки.",
          },
        ],
      },
    ],
  },
  en: {
    documentCode: "VBT-PD-01",
    releaseIdentity: "VBT-PD-01/DRAFT",
    locale: "en",
    title: "Personal Data Processing Policy — Draft",
    description:
      "Draft personal data processing policy for the narrow v-b.tech enquiry form; the document is not in force.",
    summary:
      "This draft describes only the intended processing of a visitor's data when that visitor chooses to send a future v-b.tech project enquiry.",
    sections: [
      {
        id: "operator-and-scope",
        requirements: POLICY_SECTION_REQUIREMENTS["operator-and-scope"],
        heading: "1. Controller and scope",
        blocks: [
          { kind: "paragraph", text: "Intended controller: Богатырев Владислав Сергеевич; postal address: 353745, Краснодарский край, Ленинградский район, ст. Ленинградская, ул. Грузская, д. 26; email: hello@v-b.tech; phone: +7 934 355-14-90; site: https://v-b.tech." },
          { kind: "paragraph", text: "The policy is limited to v-b.tech and its future project enquiry form. Data subjects are visitors who choose to send an enquiry. This document is a draft, is not in force, and does not itself permit enquiries to be accepted." },
        ],
      },
      {
        id: "definitions-and-principles",
        requirements: POLICY_SECTION_REQUIREMENTS["definitions-and-principles"],
        heading: "2. Definitions, principles, and applicable rights",
        blocks: [
          {
            kind: "definition-list",
            items: [
              { term: "Personal data", detail: "information relating directly or indirectly to an identified or identifiable natural person." },
              { term: "Processing", detail: "an operation or set of operations on personal data, with or without automated means." },
              { term: "Restriction", detail: "temporary suspension of processing except where processing is needed to correct the data." },
              { term: "Destruction", detail: "operations after which data cannot be restored in the information system." },
            ],
          },
          { kind: "paragraph", text: "Processing must be lawful, fair, limited to stated purposes and the minimum necessary data, accurate, time-bounded, and protective of the data subject's rights under applicable requirements." },
        ],
      },
      {
        id: "subjects-and-user-data",
        requirements: POLICY_SECTION_REQUIREMENTS["subjects-and-user-data"],
        heading: "3. Data subjects and visitor-provided data",
        blocks: [
          { kind: "paragraph", text: "A visitor will be able to provide only a name of no more than 100 characters, a contact value as email or @telegram of no more than 254 characters, and a message of no more than 4,000 characters. Attachments are not accepted." },
          { kind: "paragraph", text: "Visitors should not send passwords, payment details, legally protected secrets, special-category personal data, or other unnecessary confidential information." },
        ],
      },
      {
        id: "operational-data",
        requirements: POLICY_SECTION_REQUIREMENTS["operational-data"],
        heading: "4. Bounded operational data",
        blocks: [
          {
            kind: "unordered-list",
            items: [
              "the enquiry UUID, locale, and source path from a closed allow-list;",
              "the consent identity and submission and delivery timestamps;",
              "the captcha verification outcome and a short-lived keyed HMAC digest of the bounded network source for a fixed rate-limit window;",
              "delivery state and bounded provider message identifiers.",
            ],
          },
          { kind: "paragraph", text: "The raw IP address must not be persisted in the application database. During verification SmartCaptcha may receive only the verification token and the minimum network context required; no name, contact, or message is sent to it." },
          { kind: "paragraph", text: "The enquiry UUID is used only as a bounded correlation identifier. For the intended flow, application telemetry and logs must be limited to event kind, enquiry UUID, stage, status, and latency; they must exclude the user-provided fields — name, contact, and message — and any other personal body data, captcha token, and secrets. No hidden enrichment is intended, and arbitrary referrers and marketing parameters must not be retained." },
        ],
      },
      {
        id: "purposes-and-exclusions",
        requirements: POLICY_SECTION_REQUIREMENTS["purposes-and-exclusions"],
        heading: "5. Purposes and explicit exclusions",
        blocks: [
          {
            kind: "unordered-list",
            items: [
              "replying to the enquiry and clarifying it;",
              "conducting directly related business correspondence;",
              "sending a transactional receipt only when the contact is email;",
              "preventing automated abuse;",
              "securing and diagnosing the service.",
            ],
          },
          { kind: "paragraph", text: "This release provides no advertising, newsletter, analytics, profiling, lead enrichment, data sale, CRM transfer, or unrelated reuse." },
        ],
      },
      {
        id: "grounds-and-consent",
        requirements: POLICY_SECTION_REQUIREMENTS["grounds-and-consent"],
        heading: "6. Grounds and separate-consent boundary",
        blocks: [
          { kind: "paragraph", text: "Processing for the form does not begin until the form is enabled in the future. A voluntarily sent enquiry is intended to rely on a separate active revision of consent VBT-PD-02. VBT-PD-02/DRAFT is not active and cannot be accepted by a visitor." },
          { kind: "paragraph", text: "After correspondence begins, a specific operation may have another applicable ground only if it actually exists and is documented; this draft does not claim such a ground in advance." },
        ],
      },
      {
        id: "operations",
        requirements: POLICY_SECTION_REQUIREMENTS.operations,
        heading: "7. Operations and processing methods",
        blocks: [
          { kind: "paragraph", text: "Intended operations are collection, recording, organization, accumulation, storage, correction, retrieval, use, necessary transfer to engaged processors, restriction, erasure, and destruction. Processing is mixed: automated and, for correspondence, without automated means." },
        ],
      },
      {
        id: "retention-and-destruction",
        requirements: POLICY_SECTION_REQUIREMENTS["retention-and-destruction"],
        heading: "8. Retention, restriction, erasure, and destruction",
        blocks: [
          { kind: "paragraph", text: "The enquiry and related business correspondence are intended to be retained for no more than one year after the last substantive contact unless another documented ground applies. Substantiated subject requests for restriction, erasure, or destruction are handled separately." },
          { kind: "paragraph", text: "The encrypted delivery payload must be erased on a short schedule after a terminal outcome. Bounded technical delivery history is retained only for an operational term and does not replace separate correspondence management." },
        ],
      },
      {
        id: "providers",
        requirements: POLICY_SECTION_REQUIREMENTS.providers,
        heading: "9. Providers and intended roles",
        blocks: [
          {
            kind: "definition-list",
            items: [
              { term: "Yandex Cloud", detail: "hosting, function, database, and secret infrastructure acting on the controller's instructions." },
              { term: "Postbox", detail: "transactional message delivery to the necessary extent." },
              { term: "SmartCaptcha", detail: "automated-abuse protection only when online submission is enabled." },
              { term: "The controller's mailbox provider", detail: "receipt and storage of directly related business correspondence." },
            ],
          },
          { kind: "paragraph", text: "The exact contracting entities, roles, processing regions, and current terms for every provider must be reverified before activation. This list does not confirm that any particular agreement exists or what it contains." },
        ],
      },
      {
        id: "localization-and-transfer",
        requirements: POLICY_SECTION_REQUIREMENTS["localization-and-transfer"],
        heading: "10. Russian localization and cross-border transfer",
        blocks: [
          { kind: "paragraph", text: "For the future configuration, primary collection, recording, organization, accumulation, storage, correction, and retrieval of Russian citizens' data must use databases located in the Russian Federation." },
          { kind: "paragraph", text: "No cross-border transfer is intended. It cannot be enabled without a separate review of recipients, grounds, procedures, and updated documents before such transfer begins." },
        ],
      },
      {
        id: "security-and-incidents",
        requirements: POLICY_SECTION_REQUIREMENTS["security-and-incidents"],
        heading: "11. Security and incidents",
        blocks: [
          { kind: "paragraph", text: "Intended measures include access controls, data isolation, secret protection, encryption of delivery payloads, change controls, backups, bounded logging, and retention limits proportionate to the data and current threats, without publishing details that could weaken defenses." },
          { kind: "paragraph", text: "For a confirmed incident, the controller must contain consequences, preserve necessary evidence, make applicable notifications, and correct the cause." },
        ],
      },
      {
        id: "subject-rights",
        requirements: POLICY_SECTION_REQUIREMENTS["subject-rights"],
        heading: "12. Access, correction, restriction, erasure, and withdrawal",
        blocks: [
          { kind: "paragraph", text: "A request for access, correction, restriction, erasure, destruction, or consent withdrawal may be sent to hello@v-b.tech or the controller's postal address. To protect data, the controller may request enough information to verify identity and locate the enquiry." },
          { kind: "paragraph", text: "Withdrawal does not invalidate processing performed before receipt. Limited continuation is possible only under another applicable ground and is explained for the specific request." },
        ],
      },
      {
        id: "browser-storage-and-logs",
        requirements: POLICY_SECTION_REQUIREMENTS["browser-storage-and-logs"],
        heading: "13. Browser storage, logs, and captcha",
        blocks: [
          { kind: "paragraph", text: "The strictly necessary vbtech-theme-v1 local record stores the theme choice. The site uses no analytics or advertising cookies. The enquiry UUID is used only as a bounded correlation identifier. Server and application telemetry and logs must be limited to event kind, enquiry UUID, stage, status, and latency and must exclude the user-provided fields — name, contact, and message — and any other personal body data, captcha token, and secrets." },
          { kind: "paragraph", text: "SmartCaptcha and its resources may load only when online submission is enabled; during verification it may receive the verification token and the minimum network context required, but no name, contact, or message is sent to it. Before submission is enabled, captcha is inactive and receives no data." },
        ],
      },
      {
        id: "revisions-and-language",
        requirements: POLICY_SECTION_REQUIREMENTS["revisions-and-language"],
        heading: "14. Revisions, language, and draft status",
        blocks: [
          { kind: "paragraph", text: "Document code: VBT-PD-01. Candidate identity: VBT-PD-01/DRAFT. No public revision has been assigned and no effective date exists. This document is a draft, is not in force, and does not establish legal approval." },
          { kind: "paragraph", text: "After activation, the Russian text of a specific published revision will be authoritative. This English text is an informational translation of the matching Russian text. A replacement revision is published as a separate identity after renewed review." },
        ],
      },
    ],
  },
} as const satisfies Readonly<Record<LegalLocale, LegalDocumentLocaleContent>>;

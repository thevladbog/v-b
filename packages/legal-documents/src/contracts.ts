import type {
  LegalContentRequirement,
  LegalDocumentCode,
  LegalLocale,
} from "./types.js";

export interface LegalSectionContract {
  readonly id: string;
  readonly requirements: readonly LegalContentRequirement[];
}

type RequirementEvidence = Partial<
  Readonly<Record<LegalContentRequirement, readonly RegExp[]>>
>;

type LocalizedSectionEvidence = Readonly<Record<LegalLocale, RequirementEvidence>>;
type LegalRequirementEvidenceContracts = Readonly<
  Record<LegalDocumentCode, Readonly<Record<string, LocalizedSectionEvidence>>>
>;

export const LEGAL_DOCUMENT_CONTRACTS = {
  "VBT-PD-01": [
    { id: "operator-and-scope", requirements: ["operator", "scope"] },
    { id: "definitions-and-principles", requirements: ["definitions", "principles"] },
    {
      id: "subjects-and-user-data",
      requirements: ["subjects", "user-data", "sensitive-data-warning"],
    },
    { id: "operational-data", requirements: ["operational-data", "data-minimization"] },
    { id: "purposes-and-exclusions", requirements: ["purposes", "exclusions"] },
    { id: "grounds-and-consent", requirements: ["legal-grounds", "consent-boundary"] },
    { id: "operations", requirements: ["operations"] },
    {
      id: "retention-and-destruction",
      requirements: ["retention", "delivery-lifecycle"],
    },
    { id: "providers", requirements: ["providers", "provider-review"] },
    {
      id: "localization-and-transfer",
      requirements: ["localization", "cross-border"],
    },
    { id: "security-and-incidents", requirements: ["security", "incidents"] },
    { id: "subject-rights", requirements: ["subject-rights", "withdrawal"] },
    {
      id: "browser-storage-and-logs",
      requirements: ["browser-storage", "logs", "captcha"],
    },
    {
      id: "revisions-and-language",
      requirements: ["lifecycle", "authoritative-language"],
    },
  ],
  "VBT-PD-02": [
    {
      id: "draft-boundary",
      requirements: ["affirmative-action", "consent-boundary", "lifecycle"],
    },
    { id: "operator", requirements: ["operator"] },
    {
      id: "data-purposes-and-exclusions",
      requirements: [
        "user-data",
        "sensitive-data-warning",
        "operational-data",
        "purposes",
        "exclusions",
        "captcha",
        "logs",
      ],
    },
    {
      id: "operations-and-providers",
      requirements: ["operations", "providers", "provider-review"],
    },
    {
      id: "term-and-withdrawal",
      requirements: ["retention", "delivery-lifecycle", "withdrawal"],
    },
    {
      id: "language-and-warning",
      requirements: ["authoritative-language", "lifecycle"],
    },
  ],
} as const satisfies Readonly<Record<LegalDocumentCode, readonly LegalSectionContract[]>>;

export const LEGAL_REQUIREMENT_EVIDENCE: LegalRequirementEvidenceContracts = {
  "VBT-PD-01": {
    "operator-and-scope": {
      ru: {
        operator: [/Богатырев Владислав Сергеевич/, /hello@v-b\.tech/],
        scope: [/ограничена сайтом v-b\.tech и будущей формой проектного обращения/i],
      },
      en: {
        operator: [/Богатырев Владислав Сергеевич/, /hello@v-b\.tech/],
        scope: [/limited to v-b\.tech and its future project enquiry form/i],
      },
    },
    "definitions-and-principles": {
      ru: {
        definitions: [/Персональные данные/, /Обработка/, /Блокирование/, /Уничтожение/],
        principles: [/законной, добросовестной/, /минимально необходимым объемом/, /ограничением хранения/],
      },
      en: {
        definitions: [/Personal data/, /Processing/, /Restriction/, /Destruction/],
        principles: [/lawful, fair/, /minimum necessary data/, /time-bounded/],
      },
    },
    "subjects-and-user-data": {
      ru: {
        subjects: [/Посетитель сможет указать только/i],
        "user-data": [/имя.*100/i, /email или @telegram.*254/i, /сообщение.*4 000/i, /Вложения не принимаются/i],
        "sensitive-data-warning": [/пароли/, /платежные реквизиты/, /специальные категории персональных данных/],
      },
      en: {
        subjects: [/visitor/i, /provide only a name/i],
        "user-data": [/name.*100/i, /email or @telegram.*254/i, /message.*4,000/i, /Attachments are not accepted/i],
        "sensitive-data-warning": [/passwords/, /payment details/, /special-category personal data/],
      },
    },
    "operational-data": {
      ru: {
        "operational-data": [
          /UUID.*локаль.*разрешенного списка/i,
          /идентификатор согласия.*временные метки отправки и доставки/i,
          /краткоживущий ключевой HMAC.*фиксированного окна ограничения частоты/i,
          /состояние доставки.*ограниченные идентификаторы сообщений поставщика/i,
          /IP-адрес.*не должен сохраняться.*базе данных приложения/i,
        ],
        "data-minimization": [/Скрытое обогащение не предусматривается/i, /маркетинговые метки не должны сохраняться/i],
      },
      en: {
        "operational-data": [
          /UUID.*locale.*closed allow-list/i,
          /consent identity.*submission and delivery timestamps/i,
          /short-lived keyed HMAC.*fixed rate-limit window/i,
          /delivery state.*bounded provider message identifiers/i,
          /raw IP address.*must not be persisted.*application database/i,
        ],
        "data-minimization": [/No hidden enrichment is intended/i, /marketing parameters must not be retained/i],
      },
    },
    "purposes-and-exclusions": {
      ru: {
        purposes: [/ответ на обращение и уточнение/i, /деловой переписки/i, /транзакционное подтверждение.*email/i, /автоматизированных злоупотреблений/i, /защита и диагностика/i],
        exclusions: [/не предусматривает рекламу.*рассылку новостей.*веб-аналитику.*профилирование.*обогащение лидов.*продажу данных.*CRM.*несвязанных целей/i],
      },
      en: {
        purposes: [/replying to the enquiry and clarifying it/i, /business correspondence/i, /transactional receipt.*email/i, /automated abuse/i, /securing and diagnosing/i],
        exclusions: [/no advertising, newsletter, analytics, profiling, lead enrichment, data sale, CRM transfer, or unrelated reuse/i],
      },
    },
    "grounds-and-consent": {
      ru: {
        "legal-grounds": [/иное применимое основание.*существует и документировано/i],
        "consent-boundary": [/VBT-PD-02\/DRAFT не является действующей редакцией и не может быть принят/i],
      },
      en: {
        "legal-grounds": [/another applicable ground only if it actually exists and is documented/i],
        "consent-boundary": [/VBT-PD-02\/DRAFT is not active and cannot be accepted/i],
      },
    },
    operations: {
      ru: {
        operations: [/сбор, запись, систематизация, накопление, хранение, уточнение, извлечение, использование.*передача.*блокирование, удаление и уничтожение/i, /автоматизированная.*без средств автоматизации/i],
      },
      en: {
        operations: [/collection, recording, organization, accumulation, storage, correction, retrieval, use.*transfer.*restriction, erasure, and destruction/i, /automated.*without automated means/i],
      },
    },
    "retention-and-destruction": {
      ru: {
        retention: [/не более одного года после последнего содержательного контакта/i],
        "delivery-lifecycle": [/Зашифрованная полезная нагрузка очереди доставки.*короткому расписанию.*терминального результата/i, /техническая история доставки.*операционного срока/i],
      },
      en: {
        retention: [/no more than one year after the last substantive contact/i],
        "delivery-lifecycle": [/encrypted delivery payload.*short schedule.*terminal outcome/i, /technical delivery history.*operational term/i],
      },
    },
    providers: {
      ru: {
        providers: [/Yandex Cloud/, /Postbox/, /SmartCaptcha/, /Почтовый провайдер оператора/],
        "provider-review": [/договорные лица, роли, регионы обработки и действующие условия.*повторной проверке до активации/i],
      },
      en: {
        providers: [/Yandex Cloud/, /Postbox/, /SmartCaptcha/, /mailbox provider/],
        "provider-review": [/contracting entities, roles, processing regions, and current terms.*reverified before activation/i],
      },
    },
    "localization-and-transfer": {
      ru: {
        localization: [/первичный сбор.*хранение.*баз данных на территории Российской Федерации/i],
        "cross-border": [/трансграничная передача не предусмотрена/i, /без отдельной проверки получателей, оснований, процедур/i],
      },
      en: {
        localization: [/primary collection.*storage.*databases located in the Russian Federation/i],
        "cross-border": [/No cross-border transfer is intended/i, /without a separate review of recipients, grounds, procedures/i],
      },
    },
    "security-and-incidents": {
      ru: {
        security: [/ограничение доступа.*изоляция данных.*защита секретов.*шифрование.*контроль изменений.*резервирование.*журналирование/i],
        incidents: [/подтвержденном инциденте.*ограничить последствия.*доказательства.*уведомления.*исправление причин/i],
      },
      en: {
        security: [/access controls.*data isolation.*secret protection.*encryption.*change controls.*backups.*bounded logging/i],
        incidents: [/confirmed incident.*contain consequences.*evidence.*notifications.*correct the cause/i],
      },
    },
    "subject-rights": {
      ru: {
        "subject-rights": [/доступе, уточнении, блокировании, удалении, уничтожении/i, /подтверждения личности/i],
        withdrawal: [/Отзыв не отменяет законность обработки до его получения/i, /другого применимого основания/i],
      },
      en: {
        "subject-rights": [/access, correction, restriction, erasure, destruction/i, /verify identity/i],
        withdrawal: [/Withdrawal does not invalidate processing performed before receipt/i, /another applicable ground/i],
      },
    },
    "browser-storage-and-logs": {
      ru: {
        "browser-storage": [/строго необходимая локальная запись vbtech-theme-v1/i, /не использует аналитические или рекламные cookies/i],
        logs: [
          /UUID обращения используется только как ограниченный идентификатор корреляции/i,
          /видом события, UUID обращения, этапом, статусом и длительностью/i,
          /поля.*имя, контакт и сообщение.*иное персональное содержимое обращения.*captcha-токен.*секреты/i,
        ],
        captcha: [/SmartCaptcha.*только когда онлайн-отправка включена/i, /минимально необходимый сетевой контекст.*имя, контакт и сообщение.*не передаются/i],
      },
      en: {
        "browser-storage": [/strictly necessary vbtech-theme-v1 local record/i, /no analytics or advertising cookies/i],
        logs: [
          /enquiry UUID is used only as a bounded correlation identifier/i,
          /event kind, enquiry UUID, stage, status, and latency/i,
          /user-provided fields.*name, contact, and message.*other personal body data.*captcha token.*secrets/i,
        ],
        captcha: [/SmartCaptcha.*only when online submission is enabled/i, /minimum network context.*no name, contact, or message/i],
      },
    },
    "revisions-and-language": {
      ru: {
        lifecycle: [/VBT-PD-01\/DRAFT/, /Публичная редакция не присвоена, дата вступления в силу отсутствует/i, /проектом, не вступил в силу/i],
        "authoritative-language": [/приоритетным будет русский текст/i, /Английский текст.*информационный перевод/i],
      },
      en: {
        lifecycle: [/VBT-PD-01\/DRAFT/, /No public revision has been assigned and no effective date exists/i, /draft, is not in force/i],
        "authoritative-language": [/Russian text.*will be authoritative/i, /English text is an informational translation/i],
      },
    },
  },
  "VBT-PD-02": {
    "draft-boundary": {
      ru: {
        "affirmative-action": [/изначально не отмеченный обязательный флажок/i, /отдельные ссылки на политику и согласие/i],
        "consent-boundary": [/Онлайн-отправка отключена.*согласия пока нельзя принять/i],
        lifecycle: [/VBT-PD-02\/DRAFT/, /Публичная редакция не присвоена.*дата вступления в силу отсутствует/i],
      },
      en: {
        "affirmative-action": [/initially unchecked required checkbox/i, /separate policy and consent links/i],
        "consent-boundary": [/Online submission is disabled.*draft consent cannot yet be accepted/i],
        lifecycle: [/VBT-PD-02\/DRAFT/, /No public revision has been assigned and no effective date exists/i],
      },
    },
    operator: {
      ru: { operator: [/Богатырев Владислав Сергеевич/, /hello@v-b\.tech/] },
      en: { operator: [/Богатырев Владислав Сергеевич/, /hello@v-b\.tech/] },
    },
    "data-purposes-and-exclusions": {
      ru: {
        "user-data": [/имя до 100/i, /email или @telegram до 254/i, /сообщение до 4 000/i, /без вложений/i],
        "sensitive-data-warning": [/пароли/, /платежные реквизиты/, /специальные категории персональных данных/],
        "operational-data": [
          /UUID.*локаль.*разрешенного списка/i,
          /идентификатор согласия.*временные метки отправки и доставки/i,
          /краткоживущий ключевой HMAC.*фиксированного окна ограничения частоты/i,
          /состояние доставки.*ограниченные идентификаторы сообщений поставщика/i,
          /IP-адрес.*не должен сохраняться.*базе данных приложения/i,
        ],
        purposes: [/ответ и уточнение обращения/i, /деловая переписка/i, /транзакционное подтверждение.*email/i, /автоматизированных злоупотреблений/i, /защита и диагностика/i],
        exclusions: [/Не допускаются реклама, новостные рассылки, аналитика, профилирование, обогащение лидов, продажа данных, передача в CRM или несвязанное повторное использование/i],
        captcha: [/SmartCaptcha.*минимально необходимый сетевой контекст/i, /имя, контакт и сообщение.*не передаются/i],
        logs: [
          /UUID обращения используется только как ограниченный идентификатор корреляции/i,
          /видом события, UUID обращения, этапом, статусом и длительностью/i,
          /поля.*имя, контакт и сообщение.*иное персональное содержимое обращения.*captcha-токен.*секреты/i,
        ],
      },
      en: {
        "user-data": [/name up to 100/i, /email or @telegram up to 254/i, /message up to 4,000/i, /no attachments/i],
        "sensitive-data-warning": [/passwords/, /payment details/, /special-category personal data/],
        "operational-data": [
          /UUID.*locale.*closed allow-list/i,
          /consent identity.*submission and delivery timestamps/i,
          /short-lived keyed HMAC.*fixed rate-limit window/i,
          /delivery state.*bounded provider message identifiers/i,
          /raw IP address.*must not be persisted.*application database/i,
        ],
        purposes: [/replying to and clarifying the enquiry/i, /business correspondence/i, /transactional receipt.*email/i, /automated abuse/i, /securing and diagnosing/i],
        exclusions: [/No advertising, newsletter, analytics, profiling, lead enrichment, data sale, CRM transfer, or unrelated reuse/i],
        captcha: [/SmartCaptcha.*minimum network context/i, /no name, contact, or message/i],
        logs: [
          /enquiry UUID is used only as a bounded correlation identifier/i,
          /event kind, enquiry UUID, stage, status, and latency/i,
          /user-provided fields.*name, contact, and message.*other personal body data.*captcha token.*secrets/i,
        ],
      },
    },
    "operations-and-providers": {
      ru: {
        operations: [/сбор, запись, систематизация, накопление, хранение, уточнение, извлечение, использование.*передача.*блокирование, удаление и уничтожение.*автоматизированным и неавтоматизированным/i],
        providers: [/Yandex Cloud/, /Postbox/, /SmartCaptcha/, /почтовый провайдер оператора/i],
        "provider-review": [/договорные лица, роли, регионы и условия.*проверены до активации/i],
      },
      en: {
        operations: [/collection, recording, organization, accumulation, storage, correction, retrieval, use.*transfer.*restriction, erasure, and destruction.*automated and non-automated/i],
        providers: [/Yandex Cloud/, /Postbox/, /SmartCaptcha/, /mailbox provider/i],
        "provider-review": [/contracting entities, roles, regions, and terms.*reviewed before activation/i],
      },
    },
    "term-and-withdrawal": {
      ru: {
        retention: [/не более одного года после последнего содержательного контакта/i],
        "delivery-lifecycle": [/Зашифрованная полезная нагрузка очереди.*короткому расписанию.*терминального результата/i, /техническая история.*операционным сроком/i],
        withdrawal: [/Отозвать.*hello@v-b\.tech.*почтовым отправлением/i, /Отзыв не отменяет обработку до его получения.*другом применимом основании/i],
      },
      en: {
        retention: [/no more than one year after the last substantive contact/i],
        "delivery-lifecycle": [/encrypted outbox payload.*shorter schedule.*terminal outcome/i, /technical history.*operational term/i],
        withdrawal: [/withdrawn by emailing hello@v-b\.tech or posting/i, /Withdrawal does not invalidate prior processing.*another applicable ground/i],
      },
    },
    "language-and-warning": {
      ru: {
        "authoritative-language": [/приоритетным будет русский текст/i, /Английский текст является информационным переводом/i],
        lifecycle: [/VBT-PD-02\/DRAFT.*только проект/i, /онлайн-отправка отключена.*принять его нельзя.*публичная редакция и дата вступления в силу отсутствуют/i],
      },
      en: {
        "authoritative-language": [/Russian text.*will be authoritative/i, /English text is an informational translation/i],
        lifecycle: [/VBT-PD-02\/DRAFT is only a draft/i, /online submission is disabled.*cannot be accepted.*no public revision.*no effective date/i],
      },
    },
  },
};

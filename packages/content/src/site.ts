import type { CaseStudy, ContentItem, Locale, Project, SiteContent } from "./types.js";

export const LOCALES = ["ru", "en"] as const satisfies readonly Locale[];

export const LOCALE_PATHS: Readonly<Record<Locale, "/" | "/en/">> = {
  ru: "/",
  en: "/en/",
};

type CaseId = CaseStudy["id"];
type CaseEditorial = Omit<CaseStudy, "href" | "id" | "name" | "status" | "tags">;
type ProjectId = Project["id"];
type ProjectEditorial = Pick<Project, "description" | "status">;

const CASE_FACTS: Readonly<
  Record<CaseId, Pick<CaseStudy, "href" | "id" | "name" | "status" | "tags">>
> = {
  markiro: {
    id: "markiro",
    name: "Markiro",
    status: "production / flagship",
    href: "https://markiro.app",
    tags: ["TypeScript", "React", "Tauri", "NestJS", "PostgreSQL", "SQLite"],
  },
  idento: {
    id: "idento",
    name: "Idento",
    status: "active development",
    href: "https://github.com/thevladbog/idento",
    tags: ["React", "Go", "Kotlin", "PostgreSQL", "Redis"],
  },
  quokkaq: {
    id: "quokkaq",
    name: "QuokkaQ",
    status: "active development",
    href: "https://github.com/thevladbog/quokkaq",
    tags: ["Next.js", "React", "Go", "Tauri", "PostgreSQL", "Redis"],
  },
};

const casesFor = (
  editorial: Readonly<Record<CaseId, CaseEditorial>>,
): readonly CaseStudy[] =>
  (["markiro", "idento", "quokkaq"] as const).map((id) => ({
    ...CASE_FACTS[id],
    ...editorial[id],
  }));

const RU_CASES = casesFor({
  markiro: {
    problem: "Маркировка на производстве не может останавливаться из-за сети, дубля кода или недоступного сервера.",
    role: "Продуктовая модель, UX цеховых операций, архитектура, frontend, backend, desktop station и эксплуатация.",
    solution: "Offline-first станции, локальные журналы, GS1/SSCC, интеграция сканеров и принтеров, синхронизация с сервером.",
    outcome: "Операции продолжаются локально, конфликты видимы, а восстановление связи становится штатным сценарием.",
  },
  idento: {
    problem: "Регистрация на мероприятии превращается в очередь, если импорт, печать бейджа и чек-ин живут в разных системах.",
    role: "Продуктовый контур, панель оператора, мобильный чек-ин, kiosk и протокол подключения принтеров.",
    solution: "Единый путь CSV → профиль → бейдж → QR-чек-ин с динамическими полями и локальными сценариями.",
    outcome: "Команда получает связный операционный инструмент вместо набора разрозненных утилит.",
  },
  quokkaq: {
    problem: "Филиальной сети нужно управлять визитами, живой очередью и навыками операторов как одним потоком.",
    role: "Переосмысление продукта, архитектура рабочих мест, API-контракты, доступы и сценарии клиентского пути.",
    solution: "Запись, киоск, табло и рабочее место оператора соединены общей моделью маршрутизации.",
    outcome: "Очередь становится управляемым опытом для посетителя и операционной системой для филиала.",
  },
});

const EN_CASES = casesFor({
  markiro: {
    problem: "Production marking cannot stop because the network drops, a code is duplicated, or the server is unavailable.",
    role: "Product model, shop-floor UX, architecture, frontend, backend, desktop station, and production operations.",
    solution: "Offline-first stations, local journals, GS1/SSCC, scanner and printer integration, and server reconciliation.",
    outcome: "Operations continue locally, conflicts stay visible, and reconnecting becomes a rehearsed recovery path.",
  },
  idento: {
    problem: "Event registration becomes a queue when importing, badge printing, and check-in live in separate tools.",
    role: "Product loop, operator panel, mobile check-in, kiosk, and printer-pairing protocol.",
    solution: "One CSV → profile → badge → QR check-in flow with dynamic fields and local operational paths.",
    outcome: "The event team gets one coherent operating tool instead of a collection of utilities.",
  },
  quokkaq: {
    problem: "A branch network needs appointments, live queues, and operator skills to behave as one visitor flow.",
    role: "Product rethink, workplace architecture, API contracts, authorization, and end-to-end visitor journeys.",
    solution: "Appointments, kiosk, display, and operator workplace share one routing model.",
    outcome: "The queue becomes a managed visitor experience and an operating system for the branch.",
  },
});

const RU_EXPERTISE: readonly ContentItem[] = [
  { number: "01", title: "Продукт целиком", description: "Исследование, воркфлоу, интерфейс, архитектура, реализация, запуск и развитие." },
  { number: "02", title: "Сложные веб-системы", description: "Личные кабинеты, внутренние панели, real-time интерфейсы и многоуровневые роли." },
  { number: "03", title: "Offline-first", description: "Локальная работа, очереди синхронизации, разрешение конфликтов и восстановление." },
  { number: "04", title: "Интеграция железа", description: "Киоски, сканеры, принтеры, ТСД, табло и desktop-агенты." },
  { number: "05", title: "Контракты и данные", description: "API, схемы, миграции, аудит операций и воспроизводимые интеграции." },
  { number: "06", title: "Production ownership", description: "Наблюдаемость, CI/CD, диагностика и работа со сбоем как со сценарием." },
];

const EN_EXPERTISE: readonly ContentItem[] = [
  { number: "01", title: "Complete product", description: "Discovery, workflows, interface, architecture, implementation, launch, and iteration." },
  { number: "02", title: "Complex web systems", description: "Customer accounts, internal tools, real-time interfaces, and layered permissions." },
  { number: "03", title: "Offline-first", description: "Local operation, sync queues, conflict resolution, and recovery." },
  { number: "04", title: "Hardware integration", description: "Kiosks, scanners, printers, handheld terminals, displays, and desktop agents." },
  { number: "05", title: "Contracts and data", description: "APIs, schemas, migrations, operational audit, and reproducible integrations." },
  { number: "06", title: "Production ownership", description: "Observability, CI/CD, diagnosis, and treating failure as a designed scenario." },
];

const RU_APPROACH: readonly ContentItem[] = [
  { number: "01", title: "Разобраться", description: "Наблюдаю реальный процесс, ограничения и стоимость ошибки." },
  { number: "02", title: "Спроектировать", description: "Фиксирую воркфлоу, границы системы и проверяемый прототип." },
  { number: "03", title: "Собрать", description: "Реализую короткими срезами, сохраняя контракты и путь восстановления." },
  { number: "04", title: "Запустить", description: "Проверяю продукт в целевой среде, мониторинг и операционные инструкции." },
  { number: "05", title: "Развивать", description: "Сопоставляю сигналы эксплуатации с продуктовой моделью и приоритетами." },
];

const EN_APPROACH: readonly ContentItem[] = [
  { number: "01", title: "Understand", description: "Observe the real process, its constraints, and the cost of failure." },
  { number: "02", title: "Design", description: "Define the workflow, system boundaries, and a testable prototype." },
  { number: "03", title: "Build", description: "Deliver in thin slices while protecting contracts and recovery paths." },
  { number: "04", title: "Launch", description: "Verify the target environment, monitoring, and operating instructions." },
  { number: "05", title: "Iterate", description: "Connect production signals back to the product model and priorities." },
];

const PROJECT_FACTS: Readonly<
  Record<ProjectId, Pick<Project, "href" | "id" | "name">>
> = {
  "sys-004": {
    id: "sys-004",
    name: "Scanio",
    href: "https://github.com/thevladbog/scanio",
  },
  "sys-005": {
    id: "sys-005",
    name: "Mercadia.POS",
    href: "https://github.com/thevladbog/mercadia.pos",
  },
};

const projectsFor = (
  editorial: Readonly<Record<ProjectId, ProjectEditorial>>,
): readonly Project[] =>
  (["sys-004", "sys-005"] as const).map((id) => ({
    ...PROJECT_FACTS[id],
    ...editorial[id],
  }));

const RU_PROJECTS = projectsFor({
  "sys-004": {
    description: "Диагностика COM/HID-сканеров для Windows",
    status: "beta",
  },
  "sys-005": {
    description: "Store-edge POS и hardware-agent",
    status: "concept",
  },
});

const EN_PROJECTS = projectsFor({
  "sys-004": {
    description: "COM/HID scanner diagnostics for Windows",
    status: "beta",
  },
  "sys-005": {
    description: "Store-edge POS and hardware agent",
    status: "concept",
  },
});

export const SITE_CONTENT: Readonly<Record<Locale, SiteContent>> = {
  ru: {
    meta: { title: "Влад Богатырев — продуктовый инженер полного цикла", description: "Проектирую и разрабатываю сложные цифровые продукты — от воркфлоу и интерфейса до инфраструктуры, запуска и эксплуатации." },
    skip: "Перейти к содержанию",
    navigation: { work: "кейсы", expertise: "экспертиза", approach: "подход", about: "обо мне", contact: "обсудить проект", homeLabel: "v-b.tech, на главную", primaryLabel: "Основная навигация", languageLabel: "Язык", menuOpen: "Открыть меню", menuClose: "Закрыть меню" },
    availability: "Открыт к избранным проектам",
    hero: { kicker: "Влад Богатырев · продуктовый инженер", title: "Отвечаю за продукт <em>целиком.</em>", lead: "Проектирую и разрабатываю сложные цифровые продукты — от воркфлоу и интерфейса до инфраструктуры, запуска и эксплуатации.", speciality: "Особенно силён там, где софт встречается с физическим миром: киоски, сканеры, принтеры, терминалы и нестабильная связь.", discuss: "Обсудить проект", viewWork: "Смотреть кейсы" },
    proof: { label: "Опыт в эксплуатации, не только в макетах", companies: "Yandex · Kaspersky · Sberbank", companiesCaption: "коммерческий опыт", years: "4+", yearsCaption: "года разработки продуктов", users: "1 000+", usersCaption: "пользователей продуктов", errors: "−20%", errorsCaption: "операционных ошибок", time: "15 → 1 мин", timeCaption: "ключевая операция" },
    work: { eyebrow: "01 / выбранные кейсы", title: "Системы с последствиями в реальном мире", lead: "Не галерея интерфейсов: задача, моя зона ответственности, инженерное решение и эффект для операции.", cta: "Есть похожая задача? Давайте разберём её." },
    cases: RU_CASES,
    moreProjects: { eyebrow: "ещё проекты", items: RU_PROJECTS },
    expertise: { eyebrow: "02 / экспертиза", title: "Одна точка ответственности", lead: "Подключаюсь не как исполнитель отдельного экрана, а как партнёр, который удерживает продукт, систему и запуск в одном контуре.", items: RU_EXPERTISE },
    approach: { eyebrow: "03 / как работаю", title: "От неопределённости до работающей операции", lead: "Каждый этап оставляет проверяемый результат: решение можно обсудить, протестировать, запустить и восстановить после сбоя.", items: RU_APPROACH },
    about: { eyebrow: "04 / обо мне", title: "Инженерное мышление без туннельного зрения", body: "Я — Влад Богатырев. Соединяю продуктовую логику, дизайн интерфейсов и техническую реализацию. Моя сильная сторона — разложить сложный физический процесс на понятный воркфлоу, собрать систему и довести её до реальной эксплуатации.", bodyTwo: "Работаю самостоятельно, при необходимости подключаю специалистов под узкие задачи и остаюсь одной точкой ответственности за результат." },
    contact: {
      eyebrow: "контакт / новый проект",
      title: "Расскажите, что должно начать работать лучше",
      lead: "Подойдёт короткое описание продукта, процесса или текущего сбоя. На первом разговоре разберём задачу и поймём, есть ли хороший рабочий формат.",
      telegram: "Telegram",
      telegramNewTabLabel: "Написать Владу в Telegram (откроется в новой вкладке)",
      email: "Email",
      directContactContext: "Онлайн-форма временно недоступна. Telegram и email работают и остаются прямыми способами связи.",
      formTitle: "Обращение",
      formName: "Имя",
      formNameInstruction: "Укажите имя длиной до 100 символов.",
      formContact: "Email или Telegram",
      formContactInstruction: "Укажите email или Telegram в формате @username, не короче пяти символов после @.",
      formMessage: "Что вы хотите спроектировать или улучшить?",
      formMessageInstruction: "Опишите задачу без лишних персональных данных, максимум 4 000 символов.",
      formConsentInstruction: "Флажок изначально снят. Для отправки необходимо принять действующее согласие.",
      formSubmit: "Отправить обращение",
      formNote: "Сейчас форма не отправляет данные. Используйте прямые каналы связи.",
      formSuccess: "Обращение заполнено корректно.",
      formWarning: "Не отправляйте пароли, платёжные реквизиты, охраняемые законом тайны, специальные категории персональных данных или лишнюю конфиденциальную информацию. Вложения не принимаются.",
      formDisabled: "Онлайн-отправка недоступна. Напишите напрямую в Telegram или на email — эти каналы активны.",
      consentBeforePolicy: "Я ознакомился(-ась) с",
      policyLinkLabel: "политикой обработки персональных данных",
      consentBetweenLinks: "и",
      consentLinkLabel: "согласием на обработку персональных данных",
      consentAfterLinks: ".",
      consentDraftContext: "Редакция действует с 23.08.2026.",
      errorSummary: "Проверьте отмеченные поля.",
      errors: {
        name: "Укажите имя длиной не более 100 символов.",
        contact: "Укажите корректный email или Telegram @username.",
        message: "Введите сообщение длиной не более 4 000 символов.",
        consent: "Ознакомьтесь с действующим согласием и примите его, установив флажок.",
      },
      activeSubmission: {
        directContactContext: "Отправьте обращение через форму ниже или свяжитесь напрямую по email или в Telegram.",
        formTitle: "Отправить обращение",
        formConsentInstruction: "Перед отправкой ознакомьтесь с действующим согласием и примите его, установив флажок. Действующая редакция:",
        formNote: "Форма передаёт введённые данные, чтобы я мог ответить на обращение. Ознакомьтесь с действующей политикой обработки персональных данных и согласием по ссылкам выше.",
        formSuccess: "Обращение заполнено корректно.",
        consentLinkLabel: "согласием на обработку персональных данных",
        consentDraftContext: "Это согласие применяется к отправке формы.",
        consentError: "Ознакомьтесь с действующим согласием и примите его, установив флажок.",
      },
    },
    footerLine: "Продукты, которые продолжают работать, когда условия перестают быть идеальными.",
  },
  en: {
    meta: { title: "Vlad Bogatyrev — End-to-End Product Engineer", description: "I design and build complex digital products from workflows and interfaces to infrastructure, launch, and production operations." },
    skip: "Skip to content",
    navigation: { work: "case studies", expertise: "expertise", approach: "approach", about: "about", contact: "discuss a project", homeLabel: "v-b.tech, home", primaryLabel: "Primary navigation", languageLabel: "Language", menuOpen: "Open menu", menuClose: "Close menu" },
    availability: "Available for selected projects",
    hero: { kicker: "Vlad Bogatyrev · product engineer", title: "End-to-end product <em>engineering.</em>", lead: "I design and build complex digital products—from workflows and interfaces to infrastructure, launch, and production operations.", speciality: "Especially strong where software meets the physical world: kiosks, scanners, printers, terminals, and unreliable connectivity.", discuss: "Discuss a project", viewWork: "View case studies" },
    proof: { label: "Experience in production, not only in prototypes", companies: "Yandex · Kaspersky · Sberbank", companiesCaption: "commercial experience", years: "4+", yearsCaption: "years building products", users: "1,000+", usersCaption: "product users", errors: "−20%", errorsCaption: "operational errors", time: "15 → 1 min", timeCaption: "for a key operation" },
    work: { eyebrow: "01 / selected work", title: "Systems with real-world consequences", lead: "Not a gallery of screens: the problem, my responsibility, the engineering decision, and the operational outcome.", cta: "Working on a similar problem? Let’s unpack it." },
    cases: EN_CASES,
    moreProjects: { eyebrow: "more projects", items: EN_PROJECTS },
    expertise: { eyebrow: "02 / expertise", title: "One point of responsibility", lead: "I join as a product partner, not the implementer of one screen—holding the product, system, and launch in one coherent loop.", items: EN_EXPERTISE },
    approach: { eyebrow: "03 / approach", title: "From uncertainty to a working operation", lead: "Every stage leaves a verifiable result: a decision can be reviewed, tested, launched, and recovered after failure.", items: EN_APPROACH },
    about: { eyebrow: "04 / about", title: "Engineering depth without tunnel vision", body: "I’m Vlad Bogatyrev. I combine product logic, interface design, and technical implementation. My strength is turning a complex physical process into a clear workflow, building the system around it, and taking it into real operation.", bodyTwo: "I work independently, bring in specialists for narrow tasks when needed, and remain the single point of responsibility for the outcome." },
    contact: {
      eyebrow: "contact / new project",
      title: "Tell me what needs to work better",
      lead: "A short description of the product, process, or current failure is enough. The first conversation is for understanding the problem and whether there is a strong working fit.",
      telegram: "Telegram",
      telegramNewTabLabel: "Message Vlad on Telegram (opens in a new tab)",
      email: "Email",
      directContactContext: "Online submission is temporarily unavailable. Telegram and email remain active direct contact options.",
      formTitle: "Enquiry",
      formName: "Name",
      formNameInstruction: "Enter a name of up to 100 characters.",
      formContact: "Email or Telegram",
      formContactInstruction: "Enter an email or Telegram @username with at least five characters after @.",
      formMessage: "What do you want to design or improve?",
      formMessageInstruction: "Describe the task without unnecessary personal data, up to 4,000 characters.",
      formConsentInstruction: "The checkbox starts unchecked. Sending requires acceptance of the current consent.",
      formSubmit: "Send enquiry",
      formNote: "The form is not sending data at the moment. Use the direct contact options.",
      formSuccess: "The enquiry is valid.",
      formWarning: "Do not submit passwords, payment details, legally protected secrets, special-category personal data, or unnecessary confidential information. Attachments are not accepted.",
      formDisabled: "Online submission is unavailable. Contact me directly through Telegram or email — both channels remain active.",
      consentBeforePolicy: "I have reviewed the",
      policyLinkLabel: "personal data processing policy",
      consentBetweenLinks: "and the",
      consentLinkLabel: "personal data processing consent",
      consentAfterLinks: ".",
      consentDraftContext: "This release is effective from 23 August 2026.",
      errorSummary: "Review the marked fields.",
      errors: {
        name: "Enter a name no longer than 100 characters.",
        contact: "Enter a valid email or Telegram @username.",
        message: "Enter a message no longer than 4,000 characters.",
        consent: "Review and accept the current consent by selecting the checkbox.",
      },
      activeSubmission: {
        directContactContext: "Send an enquiry using the form below, or contact me directly by email or Telegram.",
        formTitle: "Send an enquiry",
        formConsentInstruction: "Review and accept the current consent by selecting the checkbox before sending. Current revision:",
        formNote: "The form transmits the entered data so I can respond to your enquiry. Review the current personal data processing policy and consent linked above.",
        formSuccess: "The enquiry is valid.",
        consentLinkLabel: "personal data processing consent",
        consentDraftContext: "This consent applies to the form submission.",
        consentError: "Review and accept the current consent by selecting the checkbox.",
      },
    },
    footerLine: "Products that keep working when conditions stop being ideal.",
  },
};

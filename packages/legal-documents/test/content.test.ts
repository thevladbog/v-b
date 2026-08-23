import { describe, expect, it } from "vitest";
import {
  LEGAL_DOCUMENT_CONTRACTS,
  LEGAL_DOCUMENTS,
  type LegalDocumentLocaleContent,
} from "../src/index.js";

const textFor = (content: LegalDocumentLocaleContent) =>
  content.sections.flatMap(({ heading, blocks }) => [
    heading,
    ...blocks.flatMap((block) => {
      if (block.kind === "paragraph") return [block.text];
      if (block.kind === "definition-list") {
        return block.items.flatMap(({ term, detail }) => [term, detail]);
      }
      return block.items;
    }),
  ]).join(" ");

describe("legal document content contracts", () => {
  it("publishes matched ACTIVE text without draft-only activation disclaimers", () => {
    expect(LEGAL_DOCUMENTS.map(({ releaseIdentity }) => releaseIdentity)).toEqual([
      "VBT-PD-01/2026.08/01",
      "VBT-PD-02/2026.08/01",
    ]);

    const serialized = JSON.stringify(LEGAL_DOCUMENTS);
    expect(serialized).not.toMatch(
      /VBT-PD-0[12]\/DRAFT|submission is disabled|отправка.{0,30}отключена|no public revision|публичн.{0,30}редакц.{0,30}(?:не|отсутств)|no effective date|дат.{0,30}вступлен.{0,30}отсутств|must be reviewed before activation|подлежат повторной проверке до активации/i,
    );

    for (const document of LEGAL_DOCUMENTS) {
      for (const locale of ["ru", "en"] as const) {
        expect(document.content[locale].releaseIdentity).toBe(document.releaseIdentity);
      }
    }
  });

  it("covers the complete policy structure in matched RU and EN sections", () => {
    const policy = LEGAL_DOCUMENTS.find(({ releaseIdentity }) => releaseIdentity === "VBT-PD-01/2026.08/01");
    expect(policy).toBeDefined();
    const expectedSections = [
      "operator-and-scope",
      "definitions-and-principles",
      "subjects-and-user-data",
      "operational-data",
      "purposes-and-exclusions",
      "grounds-and-consent",
      "operations",
      "retention-and-destruction",
      "providers",
      "localization-and-transfer",
      "security-and-incidents",
      "subject-rights",
      "browser-storage-and-logs",
      "revisions-and-language",
    ];
    expect(policy!.content.ru.sections.map(({ id }) => id)).toEqual(expectedSections);
    expect(policy!.content.en.sections.map(({ id }) => id)).toEqual(expectedSections);

    for (const locale of ["ru", "en"] as const) {
      const text = textFor(policy!.content[locale]);
      expect(text).toMatch(/100/);
      expect(text).toMatch(/254/);
      expect(text).toMatch(/4[ ,.]?000/);
      expect(text).toMatch(/UUID/i);
      expect(text).toMatch(/Postbox/i);
      expect(text).toMatch(/SmartCaptcha/i);
      expect(text).toMatch(/vbtech-theme-v1/);
      expect(text).toMatch(/one year|одного года/i);
      expect(text).toMatch(/cross-border|трансгранич/i);
      expect(text).toMatch(/no analytics|аналитик/i);
      expect(text).toMatch(/VBT-PD-01\/2026\.08\/01/);
      expect(text).toMatch(/23 August 2026|23\.08\.2026/);
    }
  });

  it("covers the ACTIVE consent boundary in both languages", () => {
    const consent = LEGAL_DOCUMENTS.find(({ releaseIdentity }) => releaseIdentity === "VBT-PD-02/2026.08/01");
    expect(consent).toBeDefined();
    expect(consent!.content.ru.sections.map(({ id }) => id)).toEqual(
      consent!.content.en.sections.map(({ id }) => id),
    );

    for (const locale of ["ru", "en"] as const) {
      const text = textFor(consent!.content[locale]);
      expect(text).toContain("VBT-PD-02/2026.08/01");
      expect(text).toMatch(/unchecked|required|не отмеченн|обязательн/i);
      expect(text).toMatch(/effective from 23 August 2026|действует с 23\.08\.2026/i);
      expect(text).toMatch(/one year|одного года/i);
      expect(text).toMatch(/withdraw|отозвать|отзыв/i);
    }
  });

  it("contains no source-product or unsupported-field residue", () => {
    const serialized = JSON.stringify(LEGAL_DOCUMENTS);
    expect(serialized).not.toMatch(/Markiro|MKR-|tenant|demo|company|optional phone|компани|необязательн.{0,20}телефон/i);
  });

  it("pins complete per-section requirement markers for both locales", () => {
    const expectedByIdentity = {
      "VBT-PD-01/2026.08/01": [
        "operator", "scope", "definitions", "principles", "subject-rights", "subjects",
        "user-data", "sensitive-data-warning", "operational-data", "data-minimization",
        "purposes", "exclusions", "legal-grounds", "consent-boundary", "operations",
        "retention", "delivery-lifecycle", "providers", "provider-review", "localization",
        "cross-border", "security", "incidents", "withdrawal", "browser-storage", "logs",
        "captcha", "lifecycle", "authoritative-language",
      ],
      "VBT-PD-02/2026.08/01": [
        "affirmative-action", "consent-boundary", "lifecycle", "operator", "user-data",
        "sensitive-data-warning", "operational-data", "purposes", "exclusions", "operations",
        "providers", "provider-review", "retention", "delivery-lifecycle", "withdrawal",
        "authoritative-language", "captcha", "logs",
      ],
    } as const;

    for (const document of LEGAL_DOCUMENTS) {
      for (const locale of ["ru", "en"] as const) {
        const content = document.content[locale];
        expect(content.documentCode).toBe(document.releaseIdentity.slice(0, 9));
        expect(content.releaseIdentity).toBe(document.releaseIdentity);
        expect(content.sections.map(({ id }) => id)).toEqual(
          document.content[locale === "ru" ? "en" : "ru"].sections.map(({ id }) => id),
        );
        expect(content.sections.map(({ requirements }) => requirements)).toEqual(
          document.content[locale === "ru" ? "en" : "ru"].sections.map(({ requirements }) => requirements),
        );
        expect(content.sections.map(({ id, requirements }) => ({ id, requirements }))).toEqual(
          LEGAL_DOCUMENT_CONTRACTS[content.documentCode],
        );
        expect(new Set(content.sections.flatMap(({ requirements }) => requirements))).toEqual(
          new Set(expectedByIdentity[document.releaseIdentity]),
        );
      }
    }
  });

  it("states the exact bounded operational inventory in policy and consent RU/EN", () => {
    for (const document of LEGAL_DOCUMENTS) {
      for (const locale of ["ru", "en"] as const) {
        const text = textFor(document.content[locale]);
        expect(text).toMatch(/UUID/i);
        expect(text).toMatch(/locale|локал/i);
        expect(text).toMatch(/allow-list|разрешенн.{0,30}спис/i);
        expect(text).toMatch(/consent identity|идентификатор согласия/i);
        expect(text).toMatch(/submission and delivery timestamps|временн.{0,30}отправк.{0,40}доставк/i);
        expect(text).toMatch(/keyed HMAC|ключев.{0,20}HMAC/i);
        expect(text).toMatch(/fixed rate-limit window|фиксированн.{0,40}окн.{0,40}ограничен/i);
        expect(text).toMatch(/raw IP.{0,80}not (?:be )?persisted.{0,80}application database|IP-адрес.{0,100}не (?:должен )?сохраня.{0,80}баз.{0,30}прилож/i);
        expect(text).toMatch(/delivery state.{0,80}bounded provider message identifier|состоян.{0,30}доставк.{0,100}ограниченн.{0,40}идентификатор.{0,40}поставщик/i);
        expect(text).toMatch(/minimum network context|минимальн.{0,40}сетев.{0,30}контекст/i);
        expect(text).toMatch(/no name, contact, or message|имя, контакт и сообщен.{0,30}не переда/i);
        expect(text).toMatch(/telemetry and logs|телеметри.{0,20}журнал/i);
        expect(text).toMatch(/exclude.{0,80}personal body.{0,80}token.{0,80}secrets|не (?:должны )?включа.{0,80}персональн.{0,30}содержим.{0,80}токен.{0,80}секрет/i);
      }
    }
  });

  it("states operational controls as binding requirements or current controls", () => {
    for (const document of LEGAL_DOCUMENTS) {
      for (const locale of ["ru", "en"] as const) {
        const operationalSections = document.content[locale].sections.filter(({ requirements }) =>
          (requirements as readonly string[]).includes("operational-data"),
        );
        expect(operationalSections).toHaveLength(1);
        const operationalText = textFor({
          ...document.content[locale],
          sections: operationalSections,
        });
        expect(operationalText).toMatch(
          locale === "ru"
            ? /IP-адрес.{0,50}(?:не должен сохраняться|не сохраняется).{0,50}баз.{0,30}прилож/i
            : /raw IP address.{0,50}(?:must not be|is not) persisted.{0,50}application database/i,
        );
        expect(operationalText).toMatch(
          locale === "ru"
            ? /телеметри.{0,30}журнал.{0,50}(?:должны быть )?ограничены/i
            : /telemetry and logs.{0,50}(?:must be|are) limited/i,
        );
      }
    }
  });

  it("pins the bounded correlation telemetry boundary without excluding its UUID", () => {
    for (const document of LEGAL_DOCUMENTS) {
      for (const locale of ["ru", "en"] as const) {
        const logSections = document.content[locale].sections.filter(({ requirements }) =>
          (requirements as readonly string[]).includes("logs"),
        );
        expect(logSections).toHaveLength(1);
        const text = textFor({ ...document.content[locale], sections: logSections });

        expect(text).toMatch(
          locale === "ru"
            ? /UUID.{0,50}ограниченн.{0,40}корреляц/i
            : /UUID.{0,50}bounded correlation identifier/i,
        );
        expect(text).toMatch(
          locale === "ru"
            ? /вид.{0,20}событ.{0,50}UUID.{0,50}этап.{0,50}статус.{0,50}длительност/i
            : /event kind.{0,50}UUID.{0,50}stage.{0,50}status.{0,50}latency/i,
        );
        expect(text).toMatch(
          locale === "ru"
            ? /не (?:должны )?включа.{0,80}(?:поля|данные).{0,30}им.{0,30}контакт.{0,30}сообщен.{0,80}(?:ин.{0,20})?персональн.{0,30}содержим.{0,80}captcha-токен.{0,50}секрет/i
            : /(?:must )?exclude.{0,80}user-provided fields.{0,30}name.{0,30}contact.{0,30}message.{0,80}other personal body data.{0,80}captcha token.{0,50}secrets/i,
        );
      }
    }
  });
});

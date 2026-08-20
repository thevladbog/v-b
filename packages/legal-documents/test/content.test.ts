import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENTS, type LegalDocumentLocaleContent } from "../src/index.js";

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
  it("covers the complete policy structure in matched RU and EN sections", () => {
    const policy = LEGAL_DOCUMENTS.find(({ releaseIdentity }) => releaseIdentity === "VBT-PD-01/DRAFT");
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
      expect(text).toMatch(/draft|проект/i);
    }
  });

  it("covers the draft consent boundary in both languages", () => {
    const consent = LEGAL_DOCUMENTS.find(({ releaseIdentity }) => releaseIdentity === "VBT-PD-02/DRAFT");
    expect(consent).toBeDefined();
    expect(consent!.content.ru.sections.map(({ id }) => id)).toEqual(
      consent!.content.en.sections.map(({ id }) => id),
    );

    for (const locale of ["ru", "en"] as const) {
      const text = textFor(consent!.content[locale]);
      expect(text).toContain("VBT-PD-02/DRAFT");
      expect(text).toMatch(/unchecked|required|не отмеченн|обязательн/i);
      expect(text).toMatch(/submission is disabled|отправка.*отключена/i);
      expect(text).toMatch(/no public revision|публичн.*редакц/i);
      expect(text).toMatch(/no effective date|дат.*вступлен.*отсутств/i);
      expect(text).toMatch(/one year|одного года/i);
      expect(text).toMatch(/withdraw|отозвать|отзыв/i);
    }
  });

  it("contains no source-product or unsupported-field residue", () => {
    const serialized = JSON.stringify(LEGAL_DOCUMENTS);
    expect(serialized).not.toMatch(/Markiro|MKR-|tenant|demo|company|optional phone|компани|необязательн.{0,20}телефон/i);
  });
});

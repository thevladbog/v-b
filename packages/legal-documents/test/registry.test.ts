import { describe, expect, it } from "vitest";
import {
  CURRENT_CONTACT_CONSENT_ID,
  LEGAL_ACTIVATION_CHECKLIST,
  LEGAL_DOCUMENTS,
  LEGAL_RELEASES,
  LEGAL_SOURCE_REVIEW,
  OPERATOR_PROFILES,
  assertContactConsentPublishable,
  getActiveLegalDocument,
  getCurrentLegalDocument,
  listActiveLegalDocuments,
  listCurrentLegalDocuments,
  validateLegalRegistry,
  type LegalDocumentRelease,
} from "../src/index.js";

const syntheticActiveReleases = (): LegalDocumentRelease[] =>
  LEGAL_RELEASES.map((release, index) => ({
    ...release,
    identity: `${release.code}/2026.09/0${index + 1}`,
    revision: `2026.09/0${index + 1}`,
    effectiveDate: "2026-09-15",
    status: "active",
  })) as LegalDocumentRelease[];

const syntheticActiveDocuments = () => {
  const releases = syntheticActiveReleases();
  return LEGAL_DOCUMENTS.map((document, index) => ({
    ...document,
    releaseIdentity: releases[index]!.identity,
  }));
};

describe("draft legal document registry", () => {
  it("pins exactly two paired current draft candidates", () => {
    expect(LEGAL_RELEASES).toHaveLength(2);
    expect(LEGAL_RELEASES.map(({ code }) => code)).toEqual(["VBT-PD-01", "VBT-PD-02"]);
    expect(LEGAL_RELEASES.map(({ identity }) => identity)).toEqual([
      "VBT-PD-01/DRAFT",
      "VBT-PD-02/DRAFT",
    ]);
    expect(LEGAL_RELEASES.every(({ status }) => status === "draft")).toBe(true);
    expect(LEGAL_RELEASES.every(({ revision }) => revision === null)).toBe(true);
    expect(LEGAL_RELEASES.every(({ effectiveDate }) => effectiveDate === null)).toBe(true);
    expect(LEGAL_DOCUMENTS.every(({ content }) => content.ru && content.en)).toBe(true);
    expect(new Set(LEGAL_RELEASES.flatMap(({ routes }) => Object.values(routes))).size).toBe(4);
    expect(listCurrentLegalDocuments("ru").map(({ code }) => code)).toEqual([
      "VBT-PD-01",
      "VBT-PD-02",
    ]);
    expect(getCurrentLegalDocument("VBT-PD-02", "en").identity).toBe("VBT-PD-02/DRAFT");
  });

  it("has no active document and fails active lookup clearly", () => {
    expect(listActiveLegalDocuments("ru")).toEqual([]);
    expect(listActiveLegalDocuments("en")).toEqual([]);
    expect(() => getActiveLegalDocument("VBT-PD-02", "ru")).toThrow(
      /no active legal document.*VBT-PD-02/i,
    );
  });

  it("keeps the draft consent identity unusable for enabled submission", () => {
    expect(CURRENT_CONTACT_CONSENT_ID).toBe("VBT-PD-02/DRAFT");
    expect(() => assertContactConsentPublishable(CURRENT_CONTACT_CONSENT_ID, false)).not.toThrow();
    expect(() => assertContactConsentPublishable(CURRENT_CONTACT_CONSENT_ID, true)).toThrow(
      /draft consent.*cannot.*submission/i,
    );
  });

  it("pins the approved operator snapshot without unsupported identity fields", () => {
    const operator = OPERATOR_PROFILES["operator-vbtech-2026-08-20"];
    expect(operator).toEqual({
      name: "Богатырев Владислав Сергеевич",
      address:
        "353745, Краснодарский край, Ленинградский район, ст. Ленинградская, ул. Грузская, д. 26",
      email: "hello@v-b.tech",
      phone: "+7 934 355-14-90",
      site: "https://v-b.tech",
    });
    expect(operator).not.toHaveProperty("taxId");
    expect(operator).not.toHaveProperty("registrationNumber");
    expect(operator).not.toHaveProperty("legalStatus");
  });

  it("records repeatable source review and owner-confirmation gates", () => {
    expect(LEGAL_SOURCE_REVIEW.reviewedOn).toBe("2026-08-20");
    expect(LEGAL_SOURCE_REVIEW.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: expect.stringContaining("ips.pravo.gov.ru") }),
        expect.objectContaining({ url: "https://yandex.cloud/ru/docs/troubleshooting/legal/how-to/fl-152" }),
        expect.objectContaining({ url: "https://yandex.cloud/ru/solutions/152-fz" }),
        expect.objectContaining({ url: "https://yandex.ru/legal/cloud_terms_smartcaptcha/ru/" }),
      ]),
    );
    expect(LEGAL_ACTIVATION_CHECKLIST).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/owner.*every operator field/i),
        expect.stringMatching(/legal review/i),
        expect.stringMatching(/provider.*entities.*roles.*regions.*terms/i),
        expect.stringMatching(/assign.*revision.*effective date/i),
      ]),
    );
  });

  it("accepts a future valid active release set", () => {
    expect(() => validateLegalRegistry(syntheticActiveReleases(), syntheticActiveDocuments())).not.toThrow();
  });

  it("rejects duplicate identities, duplicate routes and duplicate active releases", () => {
    expect(() => validateLegalRegistry([...LEGAL_RELEASES, LEGAL_RELEASES[0]!], LEGAL_DOCUMENTS)).toThrow(
      /duplicate release identity/i,
    );

    const duplicateRoute = LEGAL_RELEASES.map((release) => ({
      ...release,
      routes: { ...release.routes },
    })) as LegalDocumentRelease[];
    duplicateRoute[1] = { ...duplicateRoute[1]!, routes: duplicateRoute[0]!.routes };
    expect(() => validateLegalRegistry(duplicateRoute, LEGAL_DOCUMENTS)).toThrow(/duplicate route/i);

    const active = syntheticActiveReleases();
    const secondPolicy = {
      ...active[0]!,
      identity: "VBT-PD-01/2026.10/01",
      revision: "2026.10/01",
      effectiveDate: "2026-10-01",
      routes: { ru: "/legal/archive/privacy-2026-10/", en: "/en/legal/archive/privacy-2026-10/" },
    } as LegalDocumentRelease;
    expect(() => validateLegalRegistry([...active, secondPolicy], syntheticActiveDocuments())).toThrow(
      /multiple active releases/i,
    );
  });

  it("rejects missing locale pairs and malformed or external routes", () => {
    const missingLocale = [{
      ...LEGAL_RELEASES[0]!,
      routes: { ru: "/privacy/" },
    }] as unknown as LegalDocumentRelease[];
    expect(() => validateLegalRegistry(missingLocale, LEGAL_DOCUMENTS)).toThrow(/paired RU and EN/i);

    for (const route of ["https://example.com/privacy/", "privacy/", "/privacy", "/privacy/?draft=1"] ) {
      const malformed = LEGAL_RELEASES.map((release) => ({
        ...release,
        routes: { ...release.routes },
      })) as LegalDocumentRelease[];
      malformed[0] = { ...malformed[0]!, routes: { ...malformed[0]!.routes, ru: route } } as LegalDocumentRelease;
      expect(() => validateLegalRegistry(malformed, LEGAL_DOCUMENTS)).toThrow(/invalid legal route/i);
    }
  });

  it("rejects active metadata that is invalid and drafts that invent publication metadata", () => {
    const active = syntheticActiveReleases();
    expect(() => validateLegalRegistry([
      { ...active[0]!, revision: "2026.13/01" } as LegalDocumentRelease,
      active[1]!,
    ], LEGAL_DOCUMENTS)).toThrow(/valid YYYY.MM\/NN revision/i);
    expect(() => validateLegalRegistry([
      { ...active[0]!, effectiveDate: "2026-02-31" } as LegalDocumentRelease,
      active[1]!,
    ], LEGAL_DOCUMENTS)).toThrow(/valid ISO effective date/i);

    expect(() => validateLegalRegistry([
      { ...LEGAL_RELEASES[0]!, revision: "2026.08/01" } as unknown as LegalDocumentRelease,
      LEGAL_RELEASES[1]!,
    ], LEGAL_DOCUMENTS)).toThrow(/draft.*revision.*effective date/i);
    expect(() => validateLegalRegistry([
      { ...LEGAL_RELEASES[0]!, effectiveDate: "2026-08-20" } as unknown as LegalDocumentRelease,
      LEGAL_RELEASES[1]!,
    ], LEGAL_DOCUMENTS)).toThrow(/draft.*revision.*effective date/i);
  });

  it("rejects release identity and content-source mismatches", () => {
    const mismatchedIdentity = [{
      ...LEGAL_RELEASES[0]!,
      identity: "VBT-PD-01/2026.08/01",
    } as unknown as LegalDocumentRelease, LEGAL_RELEASES[1]!];
    expect(() => validateLegalRegistry(mismatchedIdentity, LEGAL_DOCUMENTS)).toThrow(
      /identity.*metadata/i,
    );

    expect(() => validateLegalRegistry(LEGAL_RELEASES, [LEGAL_DOCUMENTS[0]!])).toThrow(
      /content.*release.*mismatch/i,
    );
  });
});

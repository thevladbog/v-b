import { describe, expect, it } from "vitest";
import { containsDeveloperHomePath } from "../../../test/helpers/developer-home-path.js";
import {
  CURRENT_CONTACT_CONSENT_ID,
  LEGAL_ACTIVATION_CHECKLIST,
  LEGAL_DOCUMENTS,
  LEGAL_RELEASES,
  LEGAL_SOURCE_REVIEW,
  OPERATOR_PROFILES,
  assertContactConsentPublishable,
  deriveCurrentLegalReleases,
  getActiveLegalDocument,
  getCurrentLegalDocument,
  listActiveLegalDocuments,
  listCurrentLegalDocuments,
  validateLegalRegistry,
  type LegalDocumentSource,
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
    content: {
      ru: { ...document.content.ru, releaseIdentity: releases[index]!.identity },
      en: { ...document.content.en, releaseIdentity: releases[index]!.identity },
    },
  }));
};

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

type MutableLegalDocumentSource = Mutable<LegalDocumentSource>;

const cloneDocuments = (): MutableLegalDocumentSource[] =>
  structuredClone(LEGAL_DOCUMENTS) as unknown as MutableLegalDocumentSource[];

const retainedPolicyHistory = () => {
  const superseded: LegalDocumentRelease = {
    code: "VBT-PD-01",
    identity: "VBT-PD-01/2026.08/01",
    revision: "2026.08/01",
    effectiveDate: "2026-08-20",
    status: "superseded",
    operatorProfileId: "operator-vbtech-2026-08-20",
    routes: {
      ru: "/legal/archive/privacy-2026-08/",
      en: "/en/legal/archive/privacy-2026-08/",
    },
  };
  const active: LegalDocumentRelease = {
    code: "VBT-PD-01",
    identity: "VBT-PD-01/2026.09/01",
    revision: "2026.09/01",
    effectiveDate: "2026-09-15",
    status: "active",
    supersedes: superseded.identity,
    operatorProfileId: "operator-vbtech-2026-08-20",
    routes: { ru: "/privacy/", en: "/en/privacy/" },
  };
  const consent = LEGAL_RELEASES[1]!;
  const policyTemplate = LEGAL_DOCUMENTS[0]!;
  const sourceFor = (release: LegalDocumentRelease): LegalDocumentSource => ({
    releaseIdentity: release.identity,
    content: {
      ru: { ...policyTemplate.content.ru, releaseIdentity: release.identity },
      en: { ...policyTemplate.content.en, releaseIdentity: release.identity },
    },
  });
  return {
    active,
    superseded,
    consent,
    releases: [active, superseded, consent] as LegalDocumentRelease[],
    documents: [sourceFor(active), sourceFor(superseded), LEGAL_DOCUMENTS[1]!] as LegalDocumentSource[],
  };
};

describe("draft legal document registry", () => {
  const rawWindowsHome = String.raw`C:\Users\alice\source\operator.ts`;

  it.each([
    ["raw Windows", rawWindowsHome],
    ["JSON-escaped Windows", JSON.stringify({ source: rawWindowsHome })],
    ["twice JSON-serialized Windows", JSON.stringify(JSON.stringify({ source: rawWindowsHome }))],
    ["macOS", "/Users/alice/source/operator.ts"],
    ["Linux", "/home/alice/source/operator.ts"],
    ["slash-escaped macOS JSON", String.raw`{"source":"\/Users\/alice\/source\/operator.ts"}`],
    ["slash-escaped Linux JSON", String.raw`{"source":"\/home\/alice\/source\/operator.ts"}`],
  ])("strict provenance detects a %s developer-home path", (_label, value) => {
    expect(containsDeveloperHomePath(value, "strict-provenance")).toBe(true);
  });

  it.each([
    ["raw Windows", rawWindowsHome],
    ["twice JSON-serialized Windows", JSON.stringify(JSON.stringify({ source: rawWindowsHome }))],
    ["raw macOS", "/Users/alice/source/operator.ts"],
    ["macOS file URL", "file:///Users/alice/source/operator.ts"],
    ["Linux file URL", "file:///home/alice/source/operator.ts"],
    ["slash-escaped macOS JSON", String.raw`{"source":"\/Users\/alice\/source\/operator.ts"}`],
    ["slash-escaped Linux JSON", String.raw`{"source":"\/home\/alice\/source\/operator.ts"}`],
    ["path field", "{path:'/home/alice/project/app.css'}"],
    ["file field", "{file:'/home/alice/project/app.css'}"],
    ["filename field", "{filename:'/home/alice/project/app.css'}"],
    ["fileName field", "{fileName:'/home/alice/project/app.css'}"],
    ["sourceFile field", "{sourceFile:'/home/alice/project/app.ts'}"],
    ["sourceMap field", "{sourceMap:'/home/alice/project/app.css.map'}"],
    ["absolutePath field", "{absolutePath:'/home/alice/project/app.css'}"],
    ["sourceRoot field", "{sourceRoot:'/home/alice/project'}"],
    [
      "later sources array field entry",
      '{"sources":["src/a.ts","/home/alice/project/app.ts"]}',
    ],
    [
      "CSS sourceMappingURL field",
      "/*# sourceMappingURL=/home/alice/project/app.css.map */",
    ],
  ])("generated artifacts detect a %s developer-home path", (_label, value) => {
    expect(containsDeveloperHomePath(value, "generated-artifact")).toBe(true);
  });

  it.each([
    [
      "CSS comma delimiter",
      "background:url(https://example.test/a),url(/Users/alice/project/app.css)",
    ],
    [
      "semicolon delimiter",
      "https://example.test/a;absolutePath:/Users/alice/project/app.css",
    ],
    ["list delimiter", "https://example.test/a,/Users/alice/project/app.css"],
    [
      "quoted delimiter",
      'background:url("https://example.test/a"),url("/Users/alice/project/app.css")',
    ],
  ])("preserves a developer path after a hosted URL %s", (_label, value) => {
    expect(containsDeveloperHomePath(value, "generated-artifact")).toBe(true);
  });

  it.each([
    ["hosted URL", "https://example.test/home/docs/page"],
    ["hosted CSS URL", "background:url(https://example.test/home/docs/page)"],
    ["root-relative href-like path", "/home/docs/page"],
    ["query path", "?next=/home/docs/page"],
    [
      "ordinary prose and URLs",
      "Read the home docs at /home/docs/page or https://example.test/Users/guide.",
    ],
    ["Resource label", "Resource: /home/docs/page"],
    ["resource field", "{resource:'/home/docs/page'}"],
    ["arbitrary source suffix", "DataSource: /home/docs/page"],
    ["extended field token", "{fileNameExtra:'/home/docs/page'}"],
    [
      "multiple safe sources entries",
      '{"sources":["src/a.ts","../shared/b.ts","/vendor/cache/c.ts"]}',
    ],
  ])("generated artifacts do not classify a %s as a developer home", (_label, value) => {
    expect(containsDeveloperHomePath(value, "generated-artifact")).toBe(false);
  });

  it("fails closed without crossing a malformed sources array into another array", () => {
    expect(() =>
      containsDeveloperHomePath(
        '{"sources":["src/a.ts" "src/b.ts"],"other":["/home/alice/project/app.ts"]}',
        "generated-artifact",
      ),
    ).toThrow(/malformed sources array/i);
  });

  it("bounds sources array scanning", () => {
    const oversizedSources = JSON.stringify({ sources: ["a".repeat(65 * 1024)] });
    expect(() => containsDeveloperHomePath(oversizedSources, "generated-artifact")).toThrow(
      /sources array.*limit/i,
    );
  });

  it.each([
    ["hosted URL", "https://example.test/home/docs/page"],
    ["query path", "?next=/home/docs/page"],
  ])("strict provenance does not classify a %s as a developer home", (_label, value) => {
    expect(containsDeveloperHomePath(value, "strict-provenance")).toBe(false);
  });

  it("applies different strict and generated policies to an ambiguous root path", () => {
    const ambiguousPath = "/home/docs/page";
    expect(containsDeveloperHomePath(ambiguousPath, "strict-provenance")).toBe(true);
    expect(containsDeveloperHomePath(ambiguousPath, "generated-artifact")).toBe(false);
  });

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
    expect(LEGAL_SOURCE_REVIEW.operatorSource).toBe(
      "operator-snapshot:operator-vbtech-2026-08-20",
    );
    expect(containsDeveloperHomePath(
      JSON.stringify(LEGAL_SOURCE_REVIEW),
      "strict-provenance",
    )).toBe(false);
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

  it("derives the same current release per code from retained history in either order", () => {
    const history = retainedPolicyHistory();
    expect(() => validateLegalRegistry(history.releases, history.documents)).not.toThrow();
    expect(() => validateLegalRegistry(
      [...history.releases].reverse(),
      [...history.documents].reverse(),
    )).not.toThrow();
    const forward = deriveCurrentLegalReleases(history.releases);
    const reverse = deriveCurrentLegalReleases([...history.releases].reverse());
    expect(forward.map(({ identity }) => identity)).toEqual([
      history.active.identity,
      history.consent.identity,
    ]);
    expect(reverse.map(({ identity }) => identity)).toEqual(
      forward.map(({ identity }) => identity),
    );
    const withNextDraft = [...history.releases, LEGAL_RELEASES[0]!];
    expect(deriveCurrentLegalReleases(withNextDraft)[0]!.identity).toBe(history.active.identity);
  });

  it("requires an active or draft current release for every document code", () => {
    const history = retainedPolicyHistory();
    history.releases[0] = { ...history.active, status: "withdrawn" } as LegalDocumentRelease;
    expect(() => deriveCurrentLegalReleases(history.releases)).toThrow(
      /no current active or draft legal release.*VBT-PD-01/i,
    );
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

  it("rejects invalid supersedes targets, status relationships, forks, and cycles", () => {
    const missing = retainedPolicyHistory();
    missing.active = {
      ...missing.active,
      supersedes: "VBT-PD-01/2026.07/01",
    } as typeof missing.active;
    missing.releases[0] = missing.active;
    expect(() => validateLegalRegistry(missing.releases, missing.documents)).toThrow(
      /supersedes target.*does not exist/i,
    );

    const wrongCode = retainedPolicyHistory();
    wrongCode.active = {
      ...wrongCode.active,
      supersedes: "VBT-PD-02/2026.08/01",
    } as typeof wrongCode.active;
    wrongCode.releases[0] = wrongCode.active;
    const consentHistory = {
      ...wrongCode.superseded,
      code: "VBT-PD-02",
      identity: "VBT-PD-02/2026.08/01",
      routes: {
        ru: "/legal/archive/consent-2026-08/",
        en: "/en/legal/archive/consent-2026-08/",
      },
    } as LegalDocumentRelease;
    wrongCode.releases.push(consentHistory);
    wrongCode.documents.push({
      ...LEGAL_DOCUMENTS[1]!,
      releaseIdentity: consentHistory.identity,
      content: {
        ru: { ...LEGAL_DOCUMENTS[1]!.content.ru, releaseIdentity: consentHistory.identity },
        en: { ...LEGAL_DOCUMENTS[1]!.content.en, releaseIdentity: consentHistory.identity },
      },
    });
    expect(() => validateLegalRegistry(wrongCode.releases, wrongCode.documents)).toThrow(
      /supersedes target.*same document code/i,
    );

    const wrongStatus = retainedPolicyHistory();
    wrongStatus.releases[1] = {
      ...wrongStatus.superseded,
      status: "withdrawn",
    } as LegalDocumentRelease;
    expect(() => validateLegalRegistry(wrongStatus.releases, wrongStatus.documents)).toThrow(
      /supersedes target.*status superseded/i,
    );

    const draftSource = retainedPolicyHistory();
    draftSource.releases[2] = {
      ...draftSource.consent,
      supersedes: draftSource.superseded.identity,
    } as unknown as LegalDocumentRelease;
    expect(() => validateLegalRegistry(draftSource.releases, draftSource.documents)).toThrow(
      /draft.*cannot.*supersede/i,
    );

    const orphaned = retainedPolicyHistory();
    orphaned.active = { ...orphaned.active, supersedes: undefined } as unknown as typeof orphaned.active;
    orphaned.releases[0] = orphaned.active;
    expect(() => validateLegalRegistry(orphaned.releases, orphaned.documents)).toThrow(
      /superseded release.*must be referenced/i,
    );

    const fork = retainedPolicyHistory();
    const secondSuccessor = {
      ...fork.superseded,
      identity: "VBT-PD-01/2026.10/01",
      revision: "2026.10/01",
      effectiveDate: "2026-10-01",
      supersedes: fork.superseded.identity,
      routes: {
        ru: "/legal/archive/privacy-2026-10/",
        en: "/en/legal/archive/privacy-2026-10/",
      },
    } as LegalDocumentRelease;
    fork.releases.push(secondSuccessor);
    fork.documents.push({
      ...fork.documents[1]!,
      releaseIdentity: secondSuccessor.identity,
      content: {
        ru: { ...fork.documents[1]!.content.ru, releaseIdentity: secondSuccessor.identity },
        en: { ...fork.documents[1]!.content.en, releaseIdentity: secondSuccessor.identity },
      },
    });
    expect(() => validateLegalRegistry(fork.releases, fork.documents)).toThrow(
      /multiple releases supersede/i,
    );

    const cycle = retainedPolicyHistory();
    cycle.active = { ...cycle.active, supersedes: undefined } as unknown as typeof cycle.active;
    cycle.releases[0] = cycle.active;
    const first = {
      ...cycle.superseded,
      supersedes: "VBT-PD-01/2026.07/01",
    } as LegalDocumentRelease;
    const second = {
      ...cycle.superseded,
      identity: "VBT-PD-01/2026.07/01",
      revision: "2026.07/01",
      effectiveDate: "2026-07-20",
      supersedes: cycle.superseded.identity,
      routes: {
        ru: "/legal/archive/privacy-2026-07/",
        en: "/en/legal/archive/privacy-2026-07/",
      },
    } as LegalDocumentRelease;
    cycle.releases[1] = first;
    cycle.releases.push(second);
    cycle.documents.push({
      ...cycle.documents[1]!,
      releaseIdentity: second.identity,
      content: {
        ru: { ...cycle.documents[1]!.content.ru, releaseIdentity: second.identity },
        en: { ...cycle.documents[1]!.content.en, releaseIdentity: second.identity },
      },
    });
    expect(() => validateLegalRegistry(cycle.releases, cycle.documents)).toThrow(
      /supersedes graph.*cycle/i,
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

  it("pins localized content to its document code, release identity and locale", () => {
    for (const document of LEGAL_DOCUMENTS) {
      const release = LEGAL_RELEASES.find(({ identity }) => identity === document.releaseIdentity);
      expect(release).toBeDefined();
      for (const locale of ["ru", "en"] as const) {
        expect(document.content[locale]).toMatchObject({
          documentCode: release!.code,
          releaseIdentity: release!.identity,
          locale,
        });
      }
    }
  });

  it("rejects swapped policy and consent localized content", () => {
    const documents = cloneDocuments();
    const policyContent = documents[0]!.content;
    const consentContent = documents[1]!.content;
    documents[0] = { ...documents[0]!, content: consentContent };
    documents[1] = { ...documents[1]!, content: policyContent };
    expect(() => validateLegalRegistry(LEGAL_RELEASES, documents)).toThrow(
      /content document code.*release|localized content identity/i,
    );
  });

  it("rejects genuinely swapped bodies even when their shallow identities are relabeled", () => {
    const documents = cloneDocuments();
    const policyContent = documents[0]!.content;
    const consentContent = documents[1]!.content;
    documents[0] = {
      ...documents[0]!,
      content: {
        ru: {
          ...consentContent.ru,
          documentCode: "VBT-PD-01",
          releaseIdentity: "VBT-PD-01/DRAFT",
        },
        en: {
          ...consentContent.en,
          documentCode: "VBT-PD-01",
          releaseIdentity: "VBT-PD-01/DRAFT",
        },
      },
    };
    documents[1] = {
      ...documents[1]!,
      content: {
        ru: {
          ...policyContent.ru,
          documentCode: "VBT-PD-02",
          releaseIdentity: "VBT-PD-02/DRAFT",
        },
        en: {
          ...policyContent.en,
          documentCode: "VBT-PD-02",
          releaseIdentity: "VBT-PD-02/DRAFT",
        },
      },
    };
    expect(() => validateLegalRegistry(LEGAL_RELEASES, documents)).toThrow(
      /release-specific section contract/i,
    );
  });

  it("rejects matching section-contract drift in both locales", () => {
    const removedMarker = cloneDocuments();
    for (const locale of ["ru", "en"] as const) {
      removedMarker[0]!.content[locale].sections[0]!.requirements = ["operator"];
    }
    expect(() => validateLegalRegistry(LEGAL_RELEASES, removedMarker)).toThrow(
      /release-specific section contract/i,
    );

    const remappedSection = cloneDocuments();
    for (const locale of ["ru", "en"] as const) {
      remappedSection[0]!.content[locale].sections[0]!.id = "controller-and-scope";
    }
    expect(() => validateLegalRegistry(LEGAL_RELEASES, remappedSection)).toThrow(
      /release-specific section contract/i,
    );

    const movedMarker = cloneDocuments();
    for (const locale of ["ru", "en"] as const) {
      const operational = movedMarker[0]!.content[locale].sections[3]!;
      const purposes = movedMarker[0]!.content[locale].sections[4]!;
      operational.requirements = ["operational-data"];
      purposes.requirements = [...purposes.requirements, "data-minimization"];
    }
    expect(() => validateLegalRegistry(LEGAL_RELEASES, movedMarker)).toThrow(
      /release-specific section contract/i,
    );
  });

  it.each(["ru", "en"] as const)(
    "rejects arbitrary %s prose that retains requirement markers",
    (locale) => {
      const documents = cloneDocuments();
      documents[0]!.content[locale].sections[0]!.blocks = [
        { kind: "paragraph", text: "Arbitrary nonblank replacement prose." },
      ];
      expect(() => validateLegalRegistry(LEGAL_RELEASES, documents)).toThrow(
        /missing localized evidence.*operator/i,
      );
    },
  );

  it("rejects localized content identity and locale mismatches", () => {
    const identityMismatch = cloneDocuments();
    identityMismatch[0]!.content.ru = {
      ...identityMismatch[0]!.content.ru,
      releaseIdentity: "VBT-PD-02/DRAFT",
    } as typeof identityMismatch[0]["content"]["ru"];
    expect(() => validateLegalRegistry(LEGAL_RELEASES, identityMismatch)).toThrow(
      /localized content identity/i,
    );

    const localeMismatch = cloneDocuments();
    localeMismatch[0]!.content.en = {
      ...localeMismatch[0]!.content.en,
      locale: "ru",
    } as typeof localeMismatch[0]["content"]["en"];
    expect(() => validateLegalRegistry(LEGAL_RELEASES, localeMismatch)).toThrow(
      /locale.*mismatch/i,
    );
  });

  it.each([
    ["title", (documents: MutableLegalDocumentSource[]) => { documents[0]!.content.ru.title = " "; }],
    ["description", (documents: MutableLegalDocumentSource[]) => { documents[0]!.content.ru.description = "\n"; }],
    ["summary", (documents: MutableLegalDocumentSource[]) => { documents[0]!.content.ru.summary = ""; }],
    ["heading", (documents: MutableLegalDocumentSource[]) => { documents[0]!.content.ru.sections[0]!.heading = " "; }],
    ["paragraph text", (documents: MutableLegalDocumentSource[]) => {
      const block = documents[0]!.content.ru.sections[0]!.blocks[0]!;
      if (block.kind !== "paragraph") throw new Error("fixture requires paragraph");
      block.text = " ";
    }],
    ["list item", (documents: MutableLegalDocumentSource[]) => {
      const block = documents[0]!.content.ru.sections[3]!.blocks[0]!;
      if (block.kind === "paragraph" || block.kind === "definition-list") throw new Error("fixture requires string list");
      block.items[0] = " ";
    }],
    ["definition term", (documents: MutableLegalDocumentSource[]) => {
      const block = documents[0]!.content.ru.sections[1]!.blocks[0]!;
      if (block.kind !== "definition-list") throw new Error("fixture requires definitions");
      block.items[0]!.term = " ";
    }],
    ["definition detail", (documents: MutableLegalDocumentSource[]) => {
      const block = documents[0]!.content.ru.sections[1]!.blocks[0]!;
      if (block.kind !== "definition-list") throw new Error("fixture requires definitions");
      block.items[0]!.detail = " ";
    }],
  ])("rejects blank localized %s", (_label, mutate) => {
    const documents = cloneDocuments();
    mutate(documents);
    expect(() => validateLegalRegistry(LEGAL_RELEASES, documents)).toThrow(/blank legal content/i);
  });

  it("rejects empty sections, blocks, lists and requirement markers", () => {
    const emptySections = cloneDocuments();
    emptySections[0]!.content.ru.sections = [];
    expect(() => validateLegalRegistry(LEGAL_RELEASES, emptySections)).toThrow(/at least one section/i);

    const emptyBlocks = cloneDocuments();
    emptyBlocks[0]!.content.ru.sections[0]!.blocks = [];
    expect(() => validateLegalRegistry(LEGAL_RELEASES, emptyBlocks)).toThrow(/at least one block/i);

    const emptyList = cloneDocuments();
    const list = emptyList[0]!.content.ru.sections[3]!.blocks[0]!;
    if (list.kind === "paragraph") throw new Error("fixture requires list");
    list.items = [];
    expect(() => validateLegalRegistry(LEGAL_RELEASES, emptyList)).toThrow(/list.*at least one item/i);

    const emptyRequirements = cloneDocuments();
    emptyRequirements[0]!.content.ru.sections[0]!.requirements = [];
    expect(() => validateLegalRegistry(LEGAL_RELEASES, emptyRequirements)).toThrow(
      /at least one requirement marker/i,
    );
  });

  it("rejects duplicate and unsafe section identifiers", () => {
    const duplicate = cloneDocuments();
    duplicate[0]!.content.ru.sections[1]!.id = duplicate[0]!.content.ru.sections[0]!.id;
    expect(() => validateLegalRegistry(LEGAL_RELEASES, duplicate)).toThrow(/duplicate section id/i);

    for (const id of ["Unsafe ID", "../escape", "section<script>", "-leading"]) {
      const unsafe = cloneDocuments();
      unsafe[0]!.content.ru.sections[0]!.id = id;
      expect(() => validateLegalRegistry(LEGAL_RELEASES, unsafe)).toThrow(/unsafe section id/i);
    }
  });
});

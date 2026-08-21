import { isValidIsoDate, isValidLegalRevision } from "./identity.js";
import type {
  LegalActiveRelease,
  LegalDocumentRelease,
  LegalDraftRelease,
  PersonalDataLegalContour,
} from "./types.js";

const PERSONAL_DATA_CODES = ["VBT-PD-01", "VBT-PD-02"] as const;

export function deriveCurrentLegalReleases(
  releases: readonly LegalDocumentRelease[],
): readonly LegalDocumentRelease[] {
  const byIdentity = new Map(releases.map((release) => [release.identity, release]));
  if (byIdentity.size !== releases.length) {
    throw new Error("Duplicate release identity prevents current legal release derivation");
  }
  const incomingSupersedes = new Map<string, string>();

  for (const release of releases) {
    if (release.status === "draft" || !release.supersedes) continue;
    const target = byIdentity.get(release.supersedes);
    if (!target) {
      throw new Error(
        `Supersedes target ${release.supersedes} for ${release.identity} does not exist`,
      );
    }
    if (target.code !== release.code) {
      throw new Error(
        `Supersedes target ${target.identity} must use the same document code as ${release.identity}`,
      );
    }
    if (target.status !== "superseded") {
      throw new Error(`Supersedes target ${target.identity} must have status superseded`);
    }
    const existingSuccessor = incomingSupersedes.get(target.identity);
    if (existingSuccessor) {
      throw new Error(
        `Multiple releases supersede ${target.identity}: ${existingSuccessor} and ${release.identity}`,
      );
    }
    incomingSupersedes.set(target.identity, release.identity);
  }

  for (const release of releases) {
    if (release.status === "superseded" && !incomingSupersedes.has(release.identity)) {
      throw new Error(
        `Superseded release ${release.identity} must be referenced by exactly one successor`,
      );
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (release: LegalDocumentRelease): void => {
    if (visited.has(release.identity)) return;
    if (visiting.has(release.identity)) {
      throw new Error(`Legal supersedes graph contains a cycle at ${release.identity}`);
    }
    visiting.add(release.identity);
    if (release.status !== "draft" && release.supersedes) {
      const target = byIdentity.get(release.supersedes);
      if (target) visit(target);
    }
    visiting.delete(release.identity);
    visited.add(release.identity);
  };
  releases.forEach(visit);

  return PERSONAL_DATA_CODES.map((code) => {
    const releasesForCode = releases.filter((release) => release.code === code);
    const active = releasesForCode.filter((release) => release.status === "active");
    const drafts = releasesForCode.filter((release) => release.status === "draft");
    if (active.length > 1) throw new Error(`Multiple active releases for ${code}`);
    if (drafts.length > 1) throw new Error(`Multiple draft releases for ${code}`);
    const current = active[0] ?? drafts[0];
    if (!current) throw new Error(`No current active or draft legal release for ${code}`);
    return current;
  });
}

function assertDraftPersonalDataRelease(
  release: LegalDocumentRelease,
): asserts release is LegalDraftRelease {
  if (release.status !== "draft") {
    throw new Error(`Personal data release ${release.code} must be DRAFT`);
  }
  if (release.identity !== `${release.code}/DRAFT`) {
    throw new Error(`DRAFT personal data release ${release.code} has an inconsistent identity`);
  }
  const raw = release as unknown as Record<string, unknown>;
  if (raw.revision !== null || raw.effectiveDate !== null) {
    throw new Error(
      `DRAFT personal data release ${release.code} cannot have a revision or effective date`,
    );
  }
}

function assertActivePersonalDataRelease(
  release: LegalDocumentRelease,
): asserts release is LegalActiveRelease {
  if (release.status !== "active") {
    throw new Error(`Personal data release ${release.code} must be ACTIVE`);
  }
  if (!isValidLegalRevision(release.revision)) {
    throw new Error(`ACTIVE personal data release ${release.code} must have a valid revision`);
  }
  if (!isValidIsoDate(release.effectiveDate)) {
    throw new Error(`ACTIVE personal data release ${release.code} must have a valid effective date`);
  }
  if (release.identity !== `${release.code}/${release.revision}`) {
    throw new Error(`ACTIVE personal data release ${release.code} has an inconsistent identity`);
  }
}

export function derivePersonalDataLegalContour(
  releases: readonly LegalDocumentRelease[],
): PersonalDataLegalContour {
  const current = deriveCurrentLegalReleases(releases);
  const policy = current.find(({ code }) => code === "VBT-PD-01");
  const consent = current.find(({ code }) => code === "VBT-PD-02");
  if (!policy) throw new Error("Current personal data policy release is missing");
  if (!consent) throw new Error("Current personal data consent release is missing");

  if (policy.status === "draft" && consent.status === "draft") {
    assertDraftPersonalDataRelease(policy);
    assertDraftPersonalDataRelease(consent);
    return { status: "draft", policy, consent };
  }

  if (policy.status === "active" && consent.status === "active") {
    assertActivePersonalDataRelease(policy);
    assertActivePersonalDataRelease(consent);
    return { status: "active", policy, consent };
  }

  throw new Error(
    `Incoherent personal data legal contour: VBT-PD-01=${policy.status}, VBT-PD-02=${consent.status}`,
  );
}

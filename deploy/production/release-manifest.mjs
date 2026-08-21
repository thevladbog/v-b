const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/;
const CONSENT_PATTERN = /^VBT-PD-02\/(?:DRAFT|\d{4}\.\d{2}\/\d{2})$/;

function uniqueMatch(documents, pattern, errorCode) {
  const values = documents.map((document) => {
    const matches = [...document.matchAll(pattern)].map((match) => match[1]);
    if (matches.length === 0 || new Set(matches).size !== 1) throw new Error(errorCode);
    return matches[0];
  });
  if (new Set(values).size !== 1) {
    throw new Error(errorCode);
  }
  return values[0];
}

export function extractArtifactIdentity(documents) {
  if (!Array.isArray(documents) || documents.length < 2) {
    throw new Error("paired_artifacts_required");
  }
  if (documents.some((document) => typeof document !== "string" || document.length === 0)) {
    throw new Error("invalid_artifact_document");
  }

  const releaseSha = uniqueMatch(
    documents,
    /<meta\s+name="vbtech-release-sha"\s+content="([0-9a-f]{40})"\s*\/?\s*>/g,
    "artifact_release_identity_missing",
  );
  const submission = uniqueMatch(
    documents,
    /\bdata-submission-enabled="(true|false)"/g,
    "artifact_identity_mismatch",
  );
  const consentId = uniqueMatch(
    documents,
    /\bdata-consent-id="([^"]{1,64})"/g,
    "artifact_identity_mismatch",
  );

  if (!RELEASE_SHA_PATTERN.test(releaseSha) || !CONSENT_PATTERN.test(consentId)) {
    throw new Error("artifact_identity_invalid");
  }

  return Object.freeze({
    releaseSha,
    submissionEnabled: submission === "true",
    consentId,
  });
}

export function createReleaseManifest(config, artifact) {
  if (config.image.releaseSha !== artifact.releaseSha) {
    throw new Error("image_artifact_release_mismatch");
  }
  if ((config.contact.submissionState === "enabled") !== artifact.submissionEnabled) {
    throw new Error("submission_artifact_state_mismatch");
  }
  if (config.contact.consentRelease !== artifact.consentId) {
    throw new Error("consent_artifact_release_mismatch");
  }

  return Object.freeze({
    schemaVersion: 1,
    releaseSha: artifact.releaseSha,
    image: Object.freeze({ repository: config.image.repository, tag: config.image.tag }),
    domains: Object.freeze({ ...config.domains }),
    function: Object.freeze({
      origin: config.contact.functionOrigin,
      audience: config.contact.functionAudience,
    }),
    contact: Object.freeze({
      submissionState: config.contact.submissionState,
      consentRelease: config.contact.consentRelease,
    }),
  });
}

export function serializeReleaseManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

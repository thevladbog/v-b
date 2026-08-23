import assert from "node:assert/strict";
import test from "node:test";

import {
  createReleaseManifest,
  extractArtifactIdentity,
  serializeReleaseManifest,
} from "../release-manifest.mjs";
import { parseDeploymentConfig } from "../preflight.mjs";

const SHA = "80202fad19521feb5b3ad291a4eb843ee030fb0f";

function artifactHtml({
  releaseSha = SHA,
  submissionEnabled = false,
  consentId = "VBT-PD-02/DRAFT",
} = {}) {
  return `<!doctype html><html><head><meta name="vbtech-release-sha" content="${releaseSha}"></head><body><form data-contact-form data-submission-enabled="${String(submissionEnabled)}" data-consent-id="${consentId}"></form></body></html>`;
}

function artifact(options = {}) {
  const html = artifactHtml(options);
  return extractArtifactIdentity([html, html]);
}

function environment(overrides = {}) {
  return {
    VBTECH_IMAGE_TAG: `ghcr.io/thevladbog/vbtech-web:${SHA}-disabled`,
    VBTECH_DOMAIN: "v-b.tech",
    VBTECH_WWW_DOMAIN: "www.v-b.tech",
    VBTECH_FUNCTION_ORIGIN: "https://functions.yandexcloud.net/d4example",
    VBTECH_FUNCTION_AUDIENCE: "d4example",
    VBTECH_SUBMISSION_STATE: "disabled",
    VBTECH_CONSENT_RELEASE: "VBT-PD-02/DRAFT",
    MARKIRO_EDGE_AUTHORITIES: "admin.markiro.app,kiosk.markiro.app,markiro.app",
    ...overrides,
  };
}

test("extracts one coherent release identity from paired locale artifacts", () => {
  assert.deepEqual(artifact(), {
    releaseSha: SHA,
    submissionEnabled: false,
    consentId: "VBT-PD-02/DRAFT",
  });

  assert.throws(
    () =>
      extractArtifactIdentity([
        artifactHtml(),
        artifactHtml({ consentId: "VBT-PD-02/2026.08/01" }),
      ]),
    /artifact_identity_mismatch/,
  );

  const missingConsent = artifactHtml().replace(
    /\sdata-consent-id="[^"]+"/,
    "",
  );
  const duplicatedConsent = artifactHtml().replace(
    "</body>",
    '<form data-consent-id="VBT-PD-02/DRAFT"></form></body>',
  );
  assert.throws(
    () => extractArtifactIdentity([missingConsent, duplicatedConsent]),
    /artifact_identity_mismatch/,
  );
});

test("accepts the exact disabled production inputs", () => {
  const parsed = parseDeploymentConfig(environment(), artifact());

  assert.equal(parsed.image.releaseSha, SHA);
  assert.deepEqual(parsed.domains, {
    canonical: "v-b.tech",
    www: "www.v-b.tech",
  });
  assert.equal(parsed.contact.submissionState, "disabled");
});

test("rejects missing, mutable, or artifact-mismatched image tags", () => {
  assert.throws(
    () =>
      parseDeploymentConfig(environment({ VBTECH_IMAGE_TAG: "" }), artifact()),
    /invalid_vbtech_image_tag/,
  );
  assert.throws(
    () =>
      parseDeploymentConfig(
        environment({
          VBTECH_IMAGE_TAG: "ghcr.io/thevladbog/vbtech-web:latest",
        }),
        artifact(),
      ),
    /invalid_vbtech_image_tag/,
  );
  assert.throws(
    () =>
      parseDeploymentConfig(
        environment({
          VBTECH_IMAGE_TAG: `ghcr.io/thevladbog/vbtech-web:${"1".repeat(40)}-disabled`,
        }),
        artifact(),
      ),
    /image_artifact_release_mismatch/,
  );
});

test("rejects malformed domains and collisions with existing edge authorities", () => {
  assert.throws(
    () =>
      parseDeploymentConfig(
        environment({ VBTECH_DOMAIN: "V-B.tech" }),
        artifact(),
      ),
    /invalid_vbtech_domain/,
  );
  assert.throws(
    () =>
      parseDeploymentConfig(
        environment({ MARKIRO_EDGE_AUTHORITIES: "admin.markiro.app,v-b.tech" }),
        artifact(),
      ),
    /authority_collision/,
  );
});

test("rejects an insecure function origin and an unknown submission state", () => {
  assert.throws(
    () =>
      parseDeploymentConfig(
        environment({ VBTECH_FUNCTION_ORIGIN: "http://function.internal" }),
        artifact(),
      ),
    /invalid_vbtech_function_origin/,
  );
  assert.throws(
    () =>
      parseDeploymentConfig(
        environment({ VBTECH_SUBMISSION_STATE: "preview" }),
        artifact(),
      ),
    /invalid_vbtech_submission_state/,
  );
});

test("enables submission only for the exact active consent embedded in the artifact", () => {
  const activeConsent = "VBT-PD-02/2026.08/01";
  const activeArtifact = artifact({
    submissionEnabled: true,
    consentId: activeConsent,
  });
  const activeEnvironment = environment({
    VBTECH_IMAGE_TAG: `ghcr.io/thevladbog/vbtech-web:${SHA}-enabled`,
    VBTECH_SUBMISSION_STATE: "enabled",
    VBTECH_CONSENT_RELEASE: activeConsent,
  });

  assert.equal(
    parseDeploymentConfig(activeEnvironment, activeArtifact).contact
      .consentRelease,
    activeConsent,
  );
  assert.throws(
    () =>
      parseDeploymentConfig(
        environment({
          VBTECH_IMAGE_TAG: `ghcr.io/thevladbog/vbtech-web:${SHA}-enabled`,
          VBTECH_SUBMISSION_STATE: "enabled",
        }),
        artifact({ submissionEnabled: true }),
      ),
    /active_consent_required/,
  );
  assert.throws(
    () => parseDeploymentConfig(activeEnvironment, artifact()),
    /submission_artifact_state_mismatch/,
  );
  assert.throws(
    () =>
      parseDeploymentConfig(
        {
          ...activeEnvironment,
          VBTECH_IMAGE_TAG: `ghcr.io/thevladbog/vbtech-web:${SHA}-disabled`,
        },
        activeArtifact,
      ),
    /image_submission_state_mismatch/,
  );
  assert.throws(
    () =>
      parseDeploymentConfig(
        {
          ...activeEnvironment,
          VBTECH_CONSENT_RELEASE: "VBT-PD-02/2026.08/02",
        },
        activeArtifact,
      ),
    /consent_artifact_release_mismatch/,
  );
});

test("builds a deterministic secret-free release manifest", () => {
  const parsed = parseDeploymentConfig(environment(), artifact());
  const manifest = createReleaseManifest(parsed, artifact());
  const serialized = serializeReleaseManifest(manifest);

  assert.equal(manifest.releaseSha, SHA);
  assert.equal(serialized, `${JSON.stringify(manifest, null, 2)}\n`);
  assert.doesNotMatch(serialized, /secret|password|token/i);
});

import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createPublishedReleaseManifest,
  verifyPublishedFunctionArtifact,
  validatePublishedReleaseManifest,
} from "../release-artifact.mjs";

const SHA = "80202fad19521feb5b3ad291a4eb843ee030fb0f";
const DIGEST = `sha256:${"a".repeat(64)}`;

test("creates a strict disabled release manifest bound to exact image and function digests", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vbtech-release-"));
  const functionPath = join(directory, "vbtech-contact-function.zip");
  await writeFile(functionPath, "function artifact");

  const manifest = await createPublishedReleaseManifest({
    releaseSha: SHA,
    publishRunId: "123456789",
    imageTag: `ghcr.io/thevladbog/vbtech-web:${SHA}`,
    imageDigest: DIGEST,
    functionPath,
  });

  assert.equal(manifest.releaseSha, SHA);
  assert.equal(manifest.image.digest, DIGEST);
  assert.equal(manifest.function.name, "vbtech-contact-function.zip");
  assert.match(manifest.function.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(manifest.contact, {
    submissionState: "disabled",
    consentRelease: "VBT-PD-02/DRAFT",
  });
  assert.deepEqual(
    validatePublishedReleaseManifest(manifest, {
      expectedReleaseSha: SHA,
      expectedPublishRunId: "123456789",
    }),
    manifest,
  );
  await assert.doesNotReject(() => verifyPublishedFunctionArtifact(manifest, functionPath));

  await writeFile(functionPath, "substituted function artifact");
  await assert.rejects(
    () => verifyPublishedFunctionArtifact(manifest, functionPath),
    /published_function_digest_mismatch/,
  );
});

test("rejects mutable, enabled, unexpected, or cross-run release metadata", () => {
  const valid = {
    schemaVersion: 1,
    releaseSha: SHA,
    publishRunId: "123456789",
    image: {
      repository: "ghcr.io/thevladbog/vbtech-web",
      tag: `ghcr.io/thevladbog/vbtech-web:${SHA}`,
      digest: DIGEST,
    },
    function: {
      name: "vbtech-contact-function.zip",
      sha256: "b".repeat(64),
    },
    contact: {
      submissionState: "disabled",
      consentRelease: "VBT-PD-02/DRAFT",
    },
  };

  assert.throws(
    () => validatePublishedReleaseManifest({ ...valid, releaseSha: "latest" }),
    /invalid_published_release_manifest/,
  );
  assert.throws(
    () =>
      validatePublishedReleaseManifest({
        ...valid,
        contact: { ...valid.contact, submissionState: "enabled" },
      }),
    /invalid_published_release_manifest/,
  );
  assert.throws(
    () => validatePublishedReleaseManifest({ ...valid, extra: true }),
    /invalid_published_release_manifest/,
  );
  assert.throws(
    () =>
      validatePublishedReleaseManifest(valid, {
        expectedReleaseSha: SHA,
        expectedPublishRunId: "987654321",
      }),
    /published_release_identity_mismatch/,
  );
});

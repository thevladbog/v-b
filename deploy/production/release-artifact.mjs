import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const RELEASE_SHA = /^[0-9a-f]{40}$/;
const RUN_ID = /^[1-9][0-9]{0,19}$/;
const OCI_DIGEST = /^sha256:[0-9a-f]{64}$/;
const FILE_DIGEST = /^[0-9a-f]{64}$/;
const IMAGE_REPOSITORY = "ghcr.io/thevladbog/vbtech-web";
const FUNCTION_NAME = "vbtech-contact-function.zip";

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
}

function invalid() {
  throw new Error("invalid_published_release_manifest");
}

async function fileSha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

export function validatePublishedReleaseManifest(manifest, expected = {}) {
  if (!exactKeys(manifest, ["schemaVersion", "releaseSha", "publishRunId", "image", "function", "contact"])) invalid();
  if (
    manifest.schemaVersion !== 1 ||
    typeof manifest.releaseSha !== "string" ||
    !RELEASE_SHA.test(manifest.releaseSha) ||
    typeof manifest.publishRunId !== "string" ||
    !RUN_ID.test(manifest.publishRunId)
  ) invalid();

  if (!exactKeys(manifest.image, ["repository", "tag", "digest"])) invalid();
  if (
    manifest.image.repository !== IMAGE_REPOSITORY ||
    manifest.image.tag !== `${IMAGE_REPOSITORY}:${manifest.releaseSha}` ||
    typeof manifest.image.digest !== "string" ||
    !OCI_DIGEST.test(manifest.image.digest)
  ) invalid();

  if (!exactKeys(manifest.function, ["name", "sha256"])) invalid();
  if (
    manifest.function.name !== FUNCTION_NAME ||
    typeof manifest.function.sha256 !== "string" ||
    !FILE_DIGEST.test(manifest.function.sha256)
  ) invalid();

  if (!exactKeys(manifest.contact, ["submissionState", "consentRelease"])) invalid();
  if (
    manifest.contact.submissionState !== "disabled" ||
    manifest.contact.consentRelease !== "VBT-PD-02/DRAFT"
  ) invalid();

  if (
    (expected.expectedReleaseSha !== undefined &&
      manifest.releaseSha !== expected.expectedReleaseSha) ||
    (expected.expectedPublishRunId !== undefined &&
      manifest.publishRunId !== expected.expectedPublishRunId)
  ) {
    throw new Error("published_release_identity_mismatch");
  }
  return manifest;
}

export async function createPublishedReleaseManifest({
  releaseSha,
  publishRunId,
  imageTag,
  imageDigest,
  functionPath,
}) {
  if (basename(functionPath) !== FUNCTION_NAME) invalid();
  const functionSha256 = await fileSha256(functionPath);
  return validatePublishedReleaseManifest({
    schemaVersion: 1,
    releaseSha,
    publishRunId,
    image: {
      repository: IMAGE_REPOSITORY,
      tag: imageTag,
      digest: imageDigest,
    },
    function: {
      name: FUNCTION_NAME,
      sha256: functionSha256,
    },
    contact: {
      submissionState: "disabled",
      consentRelease: "VBT-PD-02/DRAFT",
    },
  });
}

export async function verifyPublishedFunctionArtifact(manifest, functionPath) {
  validatePublishedReleaseManifest(manifest);
  if (
    basename(functionPath) !== manifest.function.name ||
    (await fileSha256(functionPath)) !== manifest.function.sha256
  ) {
    throw new Error("published_function_digest_mismatch");
  }
  return manifest;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "create" && args.length === 2) {
    const [manifestPath, functionPath] = args;
    const manifest = await createPublishedReleaseManifest({
      releaseSha: process.env.RELEASE_SHA,
      publishRunId: process.env.PUBLISH_RUN_ID,
      imageTag: process.env.IMAGE_TAG,
      imageDigest: process.env.IMAGE_DIGEST,
      functionPath,
    });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    return;
  }
  if (command === "validate" && args.length === 4) {
    const [manifestPath, expectedReleaseSha, expectedPublishRunId, functionPath] = args;
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    validatePublishedReleaseManifest(manifest, {
      expectedReleaseSha,
      expectedPublishRunId,
    });
    await verifyPublishedFunctionArtifact(manifest, functionPath);
    process.stdout.write(`${JSON.stringify(manifest)}\n`);
    return;
  }
  throw new Error("usage_release_artifact_create_or_validate");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    const code =
      typeof error?.message === "string" && /^[a-z0-9_]+$/.test(error.message)
        ? error.message
        : "release_artifact_failed";
    process.stderr.write(`${JSON.stringify({ error: code })}\n`);
    process.exitCode = 1;
  });
}

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  ACTIVATION_TARGETS,
  createActivationPlan,
} from "./activation-plan.mjs";
import { validatePublishedReleaseManifest } from "./release-artifact.mjs";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_BYTES = 128 * 1024;

function failed() {
  throw new Error("activation_failed");
}

function parseJson(value) {
  if (typeof value !== "string" || Buffer.byteLength(value) > MAX_OUTPUT_BYTES)
    failed();
  try {
    return JSON.parse(value);
  } catch {
    failed();
  }
}

function defaultRunner(command, args) {
  return execFileAsync(command, args, {
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: MAX_OUTPUT_BYTES,
    env: { PATH: process.env.PATH },
  });
}

function latestVersion(versions, functionId) {
  if (!Array.isArray(versions)) failed();
  const latest = versions.filter(
    (version) =>
      version?.function_id === functionId &&
      version?.status === "ACTIVE" &&
      Array.isArray(version.tags) &&
      version.tags.includes("$latest"),
  );
  if (latest.length !== 1) failed();
  return latest[0];
}

function publicInvoker(bindings) {
  if (!Array.isArray(bindings)) failed();
  return bindings.some(
    (binding) =>
      binding?.role_id === "functions.functionInvoker" &&
      binding?.subject?.type === "system" &&
      binding?.subject?.id === "allUsers",
  );
}

function validVersionBoundary(version, entrypoint, timeout, secretKeys) {
  const actualSecrets = Array.isArray(version.secrets)
    ? version.secrets
        .map((value) =>
          [
            value.id,
            value.version_id,
            value.key,
            value.environment_variable,
          ].join(":"),
        )
        .sort()
    : [];
  const expectedSecrets = secretKeys
    .map(([key, variable]) =>
      [
        ACTIVATION_TARGETS.secretId,
        ACTIVATION_TARGETS.lockboxVersionId,
        key,
        variable,
      ].join(":"),
    )
    .sort();
  return (
    version.runtime === "nodejs22" &&
    version.entrypoint === entrypoint &&
    version.execution_timeout === timeout &&
    version.resources?.memory === "268435456" &&
    version.service_account_id === ACTIVATION_TARGETS.serviceAccountId &&
    version.connectivity?.network_id === ACTIVATION_TARGETS.networkId &&
    JSON.stringify(actualSecrets) === JSON.stringify(expectedSecrets)
  );
}

export async function collectActivationInventory(run = defaultRunner) {
  const read = async (args) => parseJson((await run("yc", args)).stdout);
  const [
    http,
    worker,
    httpVersions,
    workerVersions,
    httpBindings,
    workerBindings,
  ] = await Promise.all([
    read([
      "serverless",
      "function",
      "get",
      ACTIVATION_TARGETS.httpFunctionId,
      "--format",
      "json",
    ]),
    read([
      "serverless",
      "function",
      "get",
      ACTIVATION_TARGETS.workerFunctionId,
      "--format",
      "json",
    ]),
    read([
      "serverless",
      "function",
      "version",
      "list",
      "--function-id",
      ACTIVATION_TARGETS.httpFunctionId,
      "--format",
      "json",
    ]),
    read([
      "serverless",
      "function",
      "version",
      "list",
      "--function-id",
      ACTIVATION_TARGETS.workerFunctionId,
      "--format",
      "json",
    ]),
    read([
      "serverless",
      "function",
      "list-access-bindings",
      ACTIVATION_TARGETS.httpFunctionId,
      "--format",
      "json",
    ]),
    read([
      "serverless",
      "function",
      "list-access-bindings",
      ACTIVATION_TARGETS.workerFunctionId,
      "--format",
      "json",
    ]),
  ]);

  const httpVersion = latestVersion(
    httpVersions,
    ACTIVATION_TARGETS.httpFunctionId,
  );
  const workerVersion = latestVersion(
    workerVersions,
    ACTIVATION_TARGETS.workerFunctionId,
  );
  const httpSecrets = [
    ["contact_database_url", "CONTACT_DATABASE_URL"],
    ["contact_outbox_encryption_key", "CONTACT_OUTBOX_ENCRYPTION_KEY"],
    ["contact_rate_limit_hmac_key", "CONTACT_RATE_LIMIT_HMAC_KEY"],
    ["smartcaptcha_secret", "SMARTCAPTCHA_SECRET"],
  ];
  const workerSecrets = httpSecrets.slice(0, 2);
  if (
    http.id !== ACTIVATION_TARGETS.httpFunctionId ||
    http.name !== "vbtech-contact-http" ||
    http.folder_id !== ACTIVATION_TARGETS.folderId ||
    worker.id !== ACTIVATION_TARGETS.workerFunctionId ||
    worker.name !== "vbtech-contact-worker" ||
    worker.folder_id !== ACTIVATION_TARGETS.folderId ||
    !validVersionBoundary(
      httpVersion,
      "index.httpHandler",
      "10s",
      httpSecrets,
    ) ||
    !validVersionBoundary(
      workerVersion,
      "index.timerHandler",
      "60s",
      workerSecrets,
    ) ||
    !["true", "false"].includes(
      httpVersion.environment?.CONTACT_SUBMISSION_ENABLED,
    ) ||
    workerVersion.environment?.CONTACT_SUBMISSION_ENABLED !== undefined ||
    publicInvoker(workerBindings)
  )
    failed();

  return {
    folderId: ACTIVATION_TARGETS.folderId,
    http: {
      id: http.id,
      name: http.name,
      latestVersionId: httpVersion.id,
      releaseSha: httpVersion.environment?.VBTECH_RELEASE_SHA,
      publicInvoker: publicInvoker(httpBindings),
      submissionEnabled:
        httpVersion.environment?.CONTACT_SUBMISSION_ENABLED === "true",
    },
    worker: {
      id: worker.id,
      name: worker.name,
      latestVersionId: workerVersion.id,
      releaseSha: workerVersion.environment?.VBTECH_RELEASE_SHA,
      publicInvoker: false,
      submissionEnabled: null,
    },
  };
}

export async function runActivation(
  { action, releaseSha, manifestPath, artifactPath, approval, apply = false },
  supplied = {},
) {
  if (approval !== `${action}:${releaseSha}`) failed();
  const metadata = await (supplied.stat ?? stat)(artifactPath);
  if (
    !metadata.isFile() ||
    metadata.size <= 0 ||
    metadata.size > 50 * 1024 * 1024
  )
    failed();
  const artifact = await (supplied.readFile ?? readFile)(artifactPath);
  const manifest = validatePublishedReleaseManifest(
    parseJson(await (supplied.readFile ?? readFile)(manifestPath, "utf8")),
    { expectedReleaseSha: releaseSha },
  );
  if (
    action === "enable" &&
    (manifest.contact.submissionState !== "enabled" ||
      manifest.contact.consentRelease !== "VBT-PD-02/2026.08/01")
  )
    failed();
  if (
    createHash("sha256").update(artifact).digest("hex") !==
    manifest.function.sha256
  )
    failed();
  const runner = supplied.run ?? defaultRunner;
  const inventory = await collectActivationInventory(runner);
  const plan = createActivationPlan({
    action,
    releaseSha,
    artifactPath,
    inventory,
  });
  if (!apply) return { inventory, plan, applied: false };
  for (const step of plan) await runner(step.command, step.args);
  return { inventory, plan, applied: true };
}

async function main() {
  const [action, releaseSha, manifestPath, artifactPath, flag] =
    process.argv.slice(2);
  if (!manifestPath || !artifactPath || flag !== "--apply") failed();
  await runActivation({
    action,
    releaseSha,
    manifestPath,
    artifactPath,
    approval: process.env.VBTECH_ACTIVATION_APPROVAL,
    apply: true,
  });
  process.stdout.write("VBTECH_ACTIVATION_APPLIED\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => {
    process.stderr.write("VBTECH_ACTIVATION_FAILED\n");
    process.exitCode = 1;
  });
}

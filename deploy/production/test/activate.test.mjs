import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { ACTIVATION_TARGETS } from "../activation-plan.mjs";
import { runActivation } from "../activate.mjs";

const releaseSha = "a".repeat(40);
const artifactPath = "/private/vbtech-contact-function.zip";
const manifestPath = "/private/release-manifest.json";
const artifact = Buffer.from("reviewed artifact");

function manifest(state = "enabled") {
  return {
    schemaVersion: 1,
    releaseSha,
    publishRunId: "123",
    image: {
      repository: "ghcr.io/thevladbog/vbtech-web",
      tag: `ghcr.io/thevladbog/vbtech-web:${releaseSha}-${state}`,
      digest: `sha256:${"b".repeat(64)}`,
    },
    function: {
      name: "vbtech-contact-function.zip",
      sha256: createHash("sha256").update(artifact).digest("hex"),
    },
    contact: {
      submissionState: state,
      consentRelease: "VBT-PD-02/2026.08/01",
    },
  };
}

function fixture({ enabled = false, publicInvoker = false } = {}) {
  const mutations = [];
  const response = (stdout) => ({ stdout: JSON.stringify(stdout) });
  const functions = {
    [ACTIVATION_TARGETS.httpFunctionId]: {
      id: ACTIVATION_TARGETS.httpFunctionId,
      folder_id: ACTIVATION_TARGETS.folderId,
      name: "vbtech-contact-http",
    },
    [ACTIVATION_TARGETS.workerFunctionId]: {
      id: ACTIVATION_TARGETS.workerFunctionId,
      folder_id: ACTIVATION_TARGETS.folderId,
      name: "vbtech-contact-worker",
    },
  };
  const versions = (id) => [
    {
      id:
        id === ACTIVATION_TARGETS.httpFunctionId
          ? "c".repeat(20)
          : "d".repeat(20),
      function_id: id,
      status: "ACTIVE",
      tags: ["$latest"],
      runtime: "nodejs22",
      entrypoint:
        id === ACTIVATION_TARGETS.httpFunctionId
          ? "index.httpHandler"
          : "index.timerHandler",
      execution_timeout:
        id === ACTIVATION_TARGETS.httpFunctionId ? "10s" : "60s",
      resources: { memory: "268435456" },
      service_account_id: ACTIVATION_TARGETS.serviceAccountId,
      connectivity: { network_id: ACTIVATION_TARGETS.networkId },
      secrets: (id === ACTIVATION_TARGETS.httpFunctionId
        ? [
            ["contact_database_url", "CONTACT_DATABASE_URL"],
            ["contact_outbox_encryption_key", "CONTACT_OUTBOX_ENCRYPTION_KEY"],
            ["contact_rate_limit_hmac_key", "CONTACT_RATE_LIMIT_HMAC_KEY"],
            ["smartcaptcha_secret", "SMARTCAPTCHA_SECRET"],
          ]
        : [
            ["contact_database_url", "CONTACT_DATABASE_URL"],
            ["contact_outbox_encryption_key", "CONTACT_OUTBOX_ENCRYPTION_KEY"],
          ]
      ).map(([key, environment_variable]) => ({
        id: ACTIVATION_TARGETS.secretId,
        version_id: ACTIVATION_TARGETS.lockboxVersionId,
        key,
        environment_variable,
      })),
      environment: {
        ...(id === ACTIVATION_TARGETS.httpFunctionId
          ? { CONTACT_SUBMISSION_ENABLED: String(enabled) }
          : {}),
        VBTECH_RELEASE_SHA: "e".repeat(40),
      },
    },
  ];
  const run = async (command, args) => {
    if (args[2] === "get") return response(functions[args[3]]);
    if (args[2] === "version" && args[3] === "list")
      return response(versions(args[5]));
    if (args[2] === "list-access-bindings") {
      const id = args[3];
      return response(
        id === ACTIVATION_TARGETS.httpFunctionId && publicInvoker
          ? [
              {
                role_id: "functions.functionInvoker",
                subject: { type: "system", id: "allUsers" },
              },
            ]
          : [],
      );
    }
    mutations.push({ command, args });
    return response({ id: "f".repeat(20) });
  };
  return { mutations, run };
}

const supplied = (runtime) => ({
  run: runtime.run,
  stat: async () => ({ isFile: () => true, size: artifact.length }),
  readFile: async (path) =>
    path === manifestPath ? JSON.stringify(manifest()) : artifact,
});

test("applies the enable plan only after artifact, approval, and live inventory verification", async () => {
  const runtime = fixture();
  const result = await runActivation(
    {
      action: "enable",
      releaseSha,
      manifestPath,
      artifactPath,
      approval: `enable:${releaseSha}`,
      apply: true,
    },
    supplied(runtime),
  );

  assert.equal(result.applied, true);
  assert.equal(runtime.mutations.length, 3);
  assert.deepEqual(
    runtime.mutations.map(({ args }) => args[2]),
    ["version", "version", "allow-unauthenticated-invoke"],
  );
});

test("a dry run reads inventory but performs no mutation", async () => {
  const runtime = fixture();
  const result = await runActivation(
    {
      action: "enable",
      releaseSha,
      manifestPath,
      artifactPath,
      approval: `enable:${releaseSha}`,
    },
    supplied(runtime),
  );
  assert.equal(result.applied, false);
  assert.equal(runtime.mutations.length, 0);
});

test("rejects missing approval, disabled enable artifact, digest drift, or live state drift", async () => {
  const cases = [
    { approval: "enable:wrong" },
    {
      readFile: async (path) =>
        path === manifestPath ? JSON.stringify(manifest("disabled")) : artifact,
    },
    {
      readFile: async (path) =>
        path === manifestPath
          ? JSON.stringify({
              ...manifest(),
              function: { ...manifest().function, sha256: "0".repeat(64) },
            })
          : artifact,
    },
    { runtime: fixture({ publicInvoker: true }) },
  ];
  for (const value of cases) {
    const runtime = value.runtime ?? fixture();
    await assert.rejects(
      runActivation(
        {
          action: "enable",
          releaseSha,
          manifestPath,
          artifactPath,
          approval: value.approval ?? `enable:${releaseSha}`,
        },
        {
          ...supplied(runtime),
          ...(value.readFile ? { readFile: value.readFile } : {}),
        },
      ),
    );
    assert.equal(runtime.mutations.length, 0);
  }
});

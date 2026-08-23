const RELEASE_SHA = /^[0-9a-f]{40}$/;
const VERSION_ID = /^[a-z0-9]{20}$/;

export const ACTIVATION_TARGETS = Object.freeze({
  folderId: "b1gi7na10jf4j62m62df",
  networkId: "enpalfhs9aap572kt2e5",
  serviceAccountId: "ajes5nrrv7nh2ti4jugv",
  secretId: "e6q5t8692c5a1kvctag9",
  lockboxVersionId: "e6qvb7h7bfgjsf6a4tg0",
  httpFunctionId: "d4egihdqfci0mhota3ac",
  workerFunctionId: "d4e92kfpn5h4b9amem8s",
});

const exactKeys = (value, keys) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(",") === [...keys].sort().join(",");

function invalid() {
  throw new Error("invalid_activation_plan");
}

function secret(key, environmentVariable) {
  return [
    "--secret",
    `id=${ACTIVATION_TARGETS.secretId},version-id=${ACTIVATION_TARGETS.lockboxVersionId},key=${key},environment-variable=${environmentVariable}`,
  ];
}

function versionCommand({
  functionId,
  entrypoint,
  timeout,
  releaseSha,
  artifactPath,
  enabled,
}) {
  const environment = [
    ...(enabled === undefined
      ? []
      : [`CONTACT_SUBMISSION_ENABLED=${String(enabled)}`]),
    "NODE_ENV=production",
    `VBTECH_RELEASE_SHA=${releaseSha}`,
  ].join(",");
  const secrets =
    entrypoint === "index.httpHandler"
      ? [
          ...secret("contact_database_url", "CONTACT_DATABASE_URL"),
          ...secret(
            "contact_outbox_encryption_key",
            "CONTACT_OUTBOX_ENCRYPTION_KEY",
          ),
          ...secret(
            "contact_rate_limit_hmac_key",
            "CONTACT_RATE_LIMIT_HMAC_KEY",
          ),
          ...secret("smartcaptcha_secret", "SMARTCAPTCHA_SECRET"),
        ]
      : [
          ...secret("contact_database_url", "CONTACT_DATABASE_URL"),
          ...secret(
            "contact_outbox_encryption_key",
            "CONTACT_OUTBOX_ENCRYPTION_KEY",
          ),
        ];
  return {
    command: "yc",
    args: [
      "serverless",
      "function",
      "version",
      "create",
      "--function-id",
      functionId,
      "--runtime",
      "nodejs22",
      "--entrypoint",
      entrypoint,
      "--memory",
      "256MB",
      "--execution-timeout",
      timeout,
      "--service-account-id",
      ACTIVATION_TARGETS.serviceAccountId,
      "--source-path",
      artifactPath,
      "--environment",
      environment,
      "--network-id",
      ACTIVATION_TARGETS.networkId,
      ...secrets,
      "--concurrency",
      "1",
      "--log-folder-id",
      ACTIVATION_TARGETS.folderId,
      "--format",
      "json",
    ],
  };
}

export function validateActivationInventory(inventory) {
  if (
    !exactKeys(inventory, ["folderId", "http", "worker"]) ||
    inventory.folderId !== ACTIVATION_TARGETS.folderId
  )
    invalid();
  for (const [key, id, name] of [
    ["http", ACTIVATION_TARGETS.httpFunctionId, "vbtech-contact-http"],
    ["worker", ACTIVATION_TARGETS.workerFunctionId, "vbtech-contact-worker"],
  ]) {
    const target = inventory[key];
    if (
      !exactKeys(target, [
        "id",
        "name",
        "latestVersionId",
        "releaseSha",
        "publicInvoker",
        "submissionEnabled",
      ]) ||
      target.id !== id ||
      target.name !== name ||
      !VERSION_ID.test(target.latestVersionId) ||
      !RELEASE_SHA.test(target.releaseSha) ||
      typeof target.publicInvoker !== "boolean" ||
      (key === "http" && typeof target.submissionEnabled !== "boolean") ||
      (key === "worker" && target.submissionEnabled !== null)
    )
      invalid();
  }
  return inventory;
}

export function createActivationPlan({
  action,
  releaseSha,
  artifactPath,
  inventory,
}) {
  validateActivationInventory(inventory);
  if (
    !["enable", "disable"].includes(action) ||
    !RELEASE_SHA.test(releaseSha) ||
    typeof artifactPath !== "string" ||
    !artifactPath.endsWith("/vbtech-contact-function.zip")
  )
    invalid();

  if (action === "enable") {
    if (inventory.http.submissionEnabled || inventory.http.publicInvoker)
      invalid();
    return Object.freeze([
      versionCommand({
        functionId: ACTIVATION_TARGETS.workerFunctionId,
        entrypoint: "index.timerHandler",
        timeout: "60s",
        releaseSha,
        artifactPath,
      }),
      versionCommand({
        functionId: ACTIVATION_TARGETS.httpFunctionId,
        entrypoint: "index.httpHandler",
        timeout: "10s",
        releaseSha,
        artifactPath,
        enabled: true,
      }),
      {
        command: "yc",
        args: [
          "serverless",
          "function",
          "allow-unauthenticated-invoke",
          "--id",
          ACTIVATION_TARGETS.httpFunctionId,
        ],
      },
    ]);
  }

  if (!inventory.http.submissionEnabled || !inventory.http.publicInvoker)
    invalid();
  return Object.freeze([
    versionCommand({
      functionId: ACTIVATION_TARGETS.httpFunctionId,
      entrypoint: "index.httpHandler",
      timeout: "10s",
      releaseSha,
      artifactPath,
      enabled: false,
    }),
    {
      command: "yc",
      args: [
        "serverless",
        "function",
        "deny-unauthenticated-invoke",
        "--id",
        ACTIVATION_TARGETS.httpFunctionId,
      ],
    },
  ]);
}

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const GIT_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const EXPECTED_CREATES = Object.freeze([
  "yandex_function.contact_http",
  "yandex_function.contact_worker",
  "yandex_function_iam_binding.contact_worker_invoker",
  "yandex_function_trigger.contact_worker",
  "yandex_iam_service_account.contact_runtime",
  "yandex_lockbox_secret_iam_member.contact_runtime",
  "yandex_resourcemanager_folder_iam_member.contact_postbox_sender",
].sort());

function fail(code) {
  throw new Error(`disabled_runtime_plan_${code}`);
}

function valueOf(plan, name) {
  return plan?.variables?.[name]?.value;
}

function isFalse(value) {
  return value === false || value === "false";
}

function plannedHttpSubmissionState(plan) {
  const resources = plan?.planned_values?.root_module?.resources;
  if (!Array.isArray(resources)) return undefined;
  return resources.find((resource) => resource?.address === "yandex_function.contact_http")
    ?.values?.environment?.CONTACT_SUBMISSION_ENABLED;
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function validateDisabledRuntimePlan(plan, expected) {
  if (
    plan === null ||
    typeof plan !== "object" ||
    plan.terraform_version !== "1.15.8" ||
    !Array.isArray(plan.resource_changes) ||
    !GIT_SHA.test(expected?.releaseSha ?? "") ||
    !SHA256.test(expected?.functionSha256 ?? "")
  ) {
    fail("invalid_input");
  }

  if (
    !isFalse(valueOf(plan, "contact_submission_enabled")) ||
    !isFalse(valueOf(plan, "public_endpoint_enabled")) ||
    !isFalse(valueOf(plan, "public_endpoint_abuse_controls_approved")) ||
    plannedHttpSubmissionState(plan) !== "false"
  ) {
    fail("gate_enabled");
  }
  if (
    valueOf(plan, "function_release_sha") !== expected.releaseSha ||
    valueOf(plan, "function_package_sha256") !== expected.functionSha256
  ) {
    fail("artifact_mismatch");
  }

  const creates = [];
  for (const change of plan.resource_changes) {
    const actions = change?.change?.actions;
    if (change?.mode === "data" && Array.isArray(actions) && sameStrings(actions, ["read"])) {
      continue;
    }
    if (change?.mode === "managed" && Array.isArray(actions) && sameStrings(actions, ["no-op"])) {
      continue;
    }
    if (
      change?.mode !== "managed" ||
      typeof change.address !== "string" ||
      !Array.isArray(actions) ||
      !sameStrings(actions, ["create"]) ||
      !EXPECTED_CREATES.includes(change.address)
    ) {
      fail("unexpected_change");
    }
    creates.push(change.address);
  }

  creates.sort();
  if (!sameStrings(creates, EXPECTED_CREATES)) fail("resource_set_mismatch");

  return Object.freeze({
    releaseSha: expected.releaseSha,
    functionSha256: expected.functionSha256,
    submissionEnabled: false,
    publicEndpointEnabled: false,
    creates,
    mutation: true,
  });
}

async function main() {
  const [planPath, releaseSha, functionSha256] = process.argv.slice(2);
  if (!planPath || !releaseSha || !functionSha256 || process.argv.length !== 5) {
    fail("usage");
  }
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  process.stdout.write(`${JSON.stringify(validateDisabledRuntimePlan(plan, { releaseSha, functionSha256 }))}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    const code = typeof error?.message === "string" && /^disabled_runtime_plan_[a-z0-9_]+$/.test(error.message)
      ? error.message
      : "disabled_runtime_plan_invalid_json";
    process.stderr.write(`${JSON.stringify({ error: code })}\n`);
    process.exitCode = 1;
  });
}

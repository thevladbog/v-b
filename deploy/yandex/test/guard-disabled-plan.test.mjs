import assert from "node:assert/strict";
import test from "node:test";

import { validateDisabledRuntimePlan } from "../scripts/guard-disabled-plan.mjs";

const RELEASE_SHA = "7aa5686b1f1a1d28d9a1f3242132bf13ded13f2c";
const FUNCTION_SHA = "2638bb357597ca9a749ecfd9fdb38f2866a9dcb334d791b51e3744f3ad29b315";
const CREATES = [
  "yandex_function.contact_http",
  "yandex_function.contact_worker",
  "yandex_function_iam_binding.contact_worker_invoker",
  "yandex_function_trigger.contact_worker",
  "yandex_iam_service_account.contact_runtime",
  "yandex_lockbox_secret_iam_member.contact_runtime",
  "yandex_resourcemanager_folder_iam_member.contact_postbox_sender",
];

function plan(overrides = {}) {
  return {
    format_version: "1.2",
    terraform_version: "1.15.8",
    variables: {
      contact_submission_enabled: { value: false },
      public_endpoint_enabled: { value: false },
      public_endpoint_abuse_controls_approved: { value: false },
      function_release_sha: { value: RELEASE_SHA },
      function_package_sha256: { value: FUNCTION_SHA },
    },
    resource_changes: CREATES.map((address) => ({
      address,
      mode: "managed",
      change: { actions: ["create"] },
    })),
    planned_values: {
      root_module: {
        resources: [
          {
            address: "yandex_function.contact_http",
            values: { environment: { CONTACT_SUBMISSION_ENABLED: "false" } },
          },
        ],
      },
    },
    ...overrides,
  };
}

test("accepts only the exact disabled runtime create plan", () => {
  assert.deepEqual(
    validateDisabledRuntimePlan(plan(), {
      releaseSha: RELEASE_SHA,
      functionSha256: FUNCTION_SHA,
    }),
    {
      releaseSha: RELEASE_SHA,
      functionSha256: FUNCTION_SHA,
      submissionEnabled: false,
      publicEndpointEnabled: false,
      creates: [...CREATES].sort(),
      mutation: true,
    },
  );
});

test("accepts Terraform's raw string representation only when the planned function remains disabled", () => {
  const value = plan();
  value.variables.contact_submission_enabled.value = "false";
  value.variables.public_endpoint_enabled.value = "false";
  value.variables.public_endpoint_abuse_controls_approved.value = "false";

  assert.equal(
    validateDisabledRuntimePlan(value, {
      releaseSha: RELEASE_SHA,
      functionSha256: FUNCTION_SHA,
    }).submissionEnabled,
    false,
  );

  value.planned_values.root_module.resources[0].values.environment.CONTACT_SUBMISSION_ENABLED = "true";
  assert.throws(
    () => validateDisabledRuntimePlan(value, { releaseSha: RELEASE_SHA, functionSha256: FUNCTION_SHA }),
    /disabled_runtime_plan_gate_enabled/,
  );
});

test("rejects an update, replacement, deletion, or unexpected resource", () => {
  for (const resourceChange of [
    { address: CREATES[0], mode: "managed", change: { actions: ["update"] } },
    { address: CREATES[0], mode: "managed", change: { actions: ["delete", "create"] } },
    { address: "yandex_vpc_security_group.postgres", mode: "managed", change: { actions: ["create"] } },
  ]) {
    const value = plan();
    value.resource_changes[0] = resourceChange;
    assert.throws(
      () => validateDisabledRuntimePlan(value, { releaseSha: RELEASE_SHA, functionSha256: FUNCTION_SHA }),
      /disabled_runtime_plan_unexpected_change/,
    );
  }
});

test("rejects a missing create and any enabled public or submission gate", () => {
  const missing = plan({ resource_changes: plan().resource_changes.slice(1) });
  assert.throws(
    () => validateDisabledRuntimePlan(missing, { releaseSha: RELEASE_SHA, functionSha256: FUNCTION_SHA }),
    /disabled_runtime_plan_resource_set_mismatch/,
  );

  for (const name of [
    "contact_submission_enabled",
    "public_endpoint_enabled",
    "public_endpoint_abuse_controls_approved",
  ]) {
    const enabled = plan();
    enabled.variables[name] = { value: true };
    assert.throws(
      () => validateDisabledRuntimePlan(enabled, { releaseSha: RELEASE_SHA, functionSha256: FUNCTION_SHA }),
      /disabled_runtime_plan_gate_enabled/,
    );
  }
});

test("rejects release or function artifact identity drift", () => {
  for (const [name, value] of [
    ["function_release_sha", "77a0cc6950f021aee3cebc13c5b9010dbd924204"],
    ["function_package_sha256", "0".repeat(64)],
  ]) {
    const drifted = plan();
    drifted.variables[name] = { value };
    assert.throws(
      () => validateDisabledRuntimePlan(drifted, { releaseSha: RELEASE_SHA, functionSha256: FUNCTION_SHA }),
      /disabled_runtime_plan_artifact_mismatch/,
    );
  }
});

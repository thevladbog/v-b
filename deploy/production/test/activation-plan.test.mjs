import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVATION_TARGETS,
  createActivationPlan,
} from "../activation-plan.mjs";

const releaseSha = "a".repeat(40);
const artifactPath = "/private/vbtech-contact-function.zip";

function inventory(overrides = {}) {
  return {
    folderId: overrides.folderId ?? ACTIVATION_TARGETS.folderId,
    http: {
      id: ACTIVATION_TARGETS.httpFunctionId,
      name: "vbtech-contact-http",
      latestVersionId: "b".repeat(20),
      releaseSha: "c".repeat(40),
      publicInvoker: false,
      submissionEnabled: false,
      ...overrides.http,
    },
    worker: {
      id: ACTIVATION_TARGETS.workerFunctionId,
      name: "vbtech-contact-worker",
      latestVersionId: "d".repeat(20),
      releaseSha: "c".repeat(40),
      publicInvoker: false,
      submissionEnabled: null,
      ...overrides.worker,
    },
  };
}

test("enables only the exact worker, HTTP revision, and public HTTP invoker in order", () => {
  const plan = createActivationPlan({
    action: "enable",
    releaseSha,
    artifactPath,
    inventory: inventory(),
  });

  assert.equal(plan.length, 3);
  assert.deepEqual(
    plan.map(({ args }, index) => args.slice(0, index === 2 ? 3 : 4)),
    [
      ["serverless", "function", "version", "create"],
      ["serverless", "function", "version", "create"],
      ["serverless", "function", "allow-unauthenticated-invoke"],
    ],
  );
  assert.ok(plan[0].args.includes(ACTIVATION_TARGETS.workerFunctionId));
  assert.ok(plan[1].args.includes(ACTIVATION_TARGETS.httpFunctionId));
  assert.ok(
    plan[1].args.includes(
      `CONTACT_SUBMISSION_ENABLED=true,NODE_ENV=production,VBTECH_RELEASE_SHA=${releaseSha}`,
    ),
  );
  assert.equal(JSON.stringify(plan).includes("password"), false);
  assert.equal(JSON.stringify(plan).includes("MARKIRO"), false);
});

test("disables HTTP acceptance before removing its public invoker", () => {
  const plan = createActivationPlan({
    action: "disable",
    releaseSha,
    artifactPath,
    inventory: inventory({
      http: { submissionEnabled: true, publicInvoker: true },
    }),
  });

  assert.equal(plan.length, 2);
  assert.ok(
    plan[0].args.includes(
      `CONTACT_SUBMISSION_ENABLED=false,NODE_ENV=production,VBTECH_RELEASE_SHA=${releaseSha}`,
    ),
  );
  assert.deepEqual(plan[1].args.slice(0, 3), [
    "serverless",
    "function",
    "deny-unauthenticated-invoke",
  ]);
});

test("fails closed on state drift, unrelated targets, malformed releases, or unsafe artifacts", () => {
  for (const input of [
    {
      action: "enable",
      releaseSha,
      artifactPath,
      inventory: inventory({ http: { publicInvoker: true } }),
    },
    { action: "disable", releaseSha, artifactPath, inventory: inventory() },
    {
      action: "enable",
      releaseSha,
      artifactPath,
      inventory: inventory({ folderId: "foreign" }),
    },
    {
      action: "enable",
      releaseSha,
      artifactPath,
      inventory: inventory({ http: { id: "e".repeat(20) } }),
    },
    {
      action: "enable",
      releaseSha: "latest",
      artifactPath,
      inventory: inventory(),
    },
    {
      action: "enable",
      releaseSha,
      artifactPath: "/private/function.zip",
      inventory: inventory(),
    },
  ])
    assert.throws(() => createActivationPlan(input), /invalid_activation_plan/);
});

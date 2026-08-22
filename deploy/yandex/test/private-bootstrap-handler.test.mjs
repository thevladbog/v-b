import assert from "node:assert/strict";
import test from "node:test";

import { createPrivateBootstrapHandler } from "../scripts/private-bootstrap-handler.mjs";

const RELEASE_SHA = "7aa5686b1f1a1d28d9a1f3242132bf13ded13f2c";

function target(approved) {
  return {
    approved,
    database: "vbtech_contact",
    role: "vbtech_contact",
  };
}

test("runs the real bootstrap boundary in check mode without approval", async () => {
  const calls = [];
  const handler = createPrivateBootstrapHandler({
    releaseSha: RELEASE_SHA,
    target: target(false),
    migrationSql: "migration",
    adapter: {},
    run: async (input) => {
      calls.push(input);
      return { mode: input.mode, mutation: false };
    },
  });

  assert.deepEqual(await handler({ mode: "check" }), { mode: "check", mutation: false });
  assert.deepEqual(calls, [{ mode: "check", target: target(false), adapter: {}, migrationSql: "migration" }]);
});

test("apply requires both the exact release approval and approved environment", async () => {
  const unapproved = createPrivateBootstrapHandler({
    releaseSha: RELEASE_SHA,
    target: target(false),
    migrationSql: "migration",
    adapter: {},
    run: async () => ({ mutation: true }),
  });
  await assert.rejects(
    () => unapproved({ mode: "apply", approval: RELEASE_SHA }),
    /private_bootstrap_environment_not_approved/,
  );

  const approved = createPrivateBootstrapHandler({
    releaseSha: RELEASE_SHA,
    target: target(true),
    migrationSql: "migration",
    adapter: {},
    run: async ({ mode }) => ({ mode, mutation: true }),
  });
  await assert.rejects(
    () => approved({ mode: "apply", approval: "77a0cc6950f021aee3cebc13c5b9010dbd924204" }),
    /private_bootstrap_release_mismatch/,
  );
  assert.deepEqual(
    await approved({ mode: "apply", approval: RELEASE_SHA }),
    { mode: "apply", mutation: true },
  );
});

test("rejects malformed events and unexpected fields", async () => {
  const handler = createPrivateBootstrapHandler({
    releaseSha: RELEASE_SHA,
    target: target(false),
    migrationSql: "migration",
    adapter: {},
    run: async () => ({ mutation: false }),
  });

  for (const event of [null, {}, { mode: "verify" }, { mode: "check", extra: true }]) {
    await assert.rejects(() => handler(event), /private_bootstrap_invalid_event/);
  }
});

test("inspect mode returns only bounded identity and isolation fields", async () => {
  const handler = createPrivateBootstrapHandler({
    releaseSha: RELEASE_SHA,
    target: target(false),
    migrationSql: "migration",
    adapter: {
      inspectTarget: async () => ({
        user: "vbtech_contact",
        database: "vbtech_contact",
        tls: true,
        serverVersionNumber: 170_010,
        databaseOwner: "vbtech_contact",
        publicSchemaOwner: "pg_database_owner",
        roleIsSuperuser: false,
        roleCanReplicate: false,
        roleCanBypassRls: false,
        roleMemberships: [],
        ignored: "must-not-escape",
      }),
      inspectProtected: async () => ({ connected: false, ignored: "must-not-escape" }),
    },
    run: async () => ({ mutation: false }),
  });

  assert.deepEqual(await handler({ mode: "inspect" }), {
    mode: "inspect",
    user: "vbtech_contact",
    database: "vbtech_contact",
    tls: true,
    serverVersionNumber: 170_010,
    databaseOwner: "vbtech_contact",
    publicSchemaOwner: "pg_database_owner",
    roleIsSuperuser: false,
    roleCanReplicate: false,
    roleCanBypassRls: false,
    roleMemberships: [],
    protectedDatabaseConnected: false,
    protectedDatabaseErrorCode: null,
    mutation: false,
  });
});

test("inspect mode reports only the protected connection error code", async () => {
  const denial = Object.assign(new Error("must-not-escape"), { code: "28000" });
  const handler = createPrivateBootstrapHandler({
    releaseSha: RELEASE_SHA,
    target: target(false),
    migrationSql: "migration",
    adapter: {
      inspectTarget: async () => ({
        user: "vbtech_contact",
        database: "vbtech_contact",
        tls: true,
        serverVersionNumber: 170_010,
        databaseOwner: "vbtech_contact",
        publicSchemaOwner: "pg_database_owner",
        roleIsSuperuser: false,
        roleCanReplicate: false,
        roleCanBypassRls: false,
        roleMemberships: [],
      }),
      inspectProtected: async () => { throw denial; },
    },
    run: async () => ({ mutation: false }),
  });

  const result = await handler({ mode: "inspect" });
  assert.equal(result.protectedDatabaseConnected, null);
  assert.equal(result.protectedDatabaseErrorCode, "28000");
  assert.doesNotMatch(JSON.stringify(result), /must-not-escape/);
});

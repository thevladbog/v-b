import { readFile } from "node:fs/promises";

import {
  createPostgresBootstrapAdapter,
  parseBootstrapTarget,
  runBootstrap,
} from "./bootstrap-database.mjs";

const GIT_SHA = /^[0-9a-f]{40}$/;

function exactEvent(event) {
  if (event === null || typeof event !== "object" || Array.isArray(event)) return false;
  const keys = Object.keys(event).sort();
  if (event.mode === "check" || event.mode === "inspect") {
    return keys.length === 1 && keys[0] === "mode";
  }
  return event.mode === "apply" && keys.length === 2 && keys[0] === "approval" && keys[1] === "mode";
}

export function createPrivateBootstrapHandler({
  releaseSha,
  target,
  migrationSql,
  adapter,
  run = runBootstrap,
}) {
  if (!GIT_SHA.test(releaseSha ?? "")) throw new Error("private_bootstrap_invalid_release");

  return async (event) => {
    if (!exactEvent(event)) throw new Error("private_bootstrap_invalid_event");
    if (event.mode === "inspect") {
      const identity = await adapter.inspectTarget(target);
      let protectedAccess;
      let protectedErrorCode = null;
      try {
        protectedAccess = await adapter.inspectProtected(target);
      } catch (error) {
        protectedAccess = { connected: null };
        protectedErrorCode = typeof error?.code === "string" && /^[0-9A-Z_]{1,16}$/.test(error.code)
          ? error.code
          : "UNKNOWN";
      }
      return Object.freeze({
        mode: "inspect",
        user: identity.user,
        database: identity.database,
        tls: identity.tls,
        serverVersionNumber: identity.serverVersionNumber,
        databaseOwner: identity.databaseOwner,
        publicSchemaOwner: identity.publicSchemaOwner,
        roleIsSuperuser: identity.roleIsSuperuser,
        roleCanReplicate: identity.roleCanReplicate,
        roleCanBypassRls: identity.roleCanBypassRls,
        roleMemberships: Array.isArray(identity.roleMemberships)
          ? identity.roleMemberships.filter((role) => typeof role === "string").slice(0, 16)
          : null,
        protectedDatabaseConnected: protectedAccess?.connected === null
          ? null
          : protectedAccess?.connected === true,
        protectedDatabaseErrorCode: protectedErrorCode,
        mutation: false,
      });
    }
    if (event.mode === "apply") {
      if (event.approval !== releaseSha) throw new Error("private_bootstrap_release_mismatch");
      if (target?.approved !== true) throw new Error("private_bootstrap_environment_not_approved");
    }

    return await run({
      mode: event.mode,
      target,
      adapter,
      migrationSql,
    });
  };
}

export async function handler(event) {
  const releaseSha = process.env.VBTECH_RELEASE_SHA;
  const caFile = process.env.VBTECH_BOOTSTRAP_CA_FILE;
  const migrationFile = process.env.VBTECH_BOOTSTRAP_MIGRATION_FILE;
  if (caFile !== "/function/code/CA.pem" || migrationFile !== "/function/code/migration.sql") {
    throw new Error("private_bootstrap_invalid_package_paths");
  }
  const migrationSql = await readFile(migrationFile, "utf8");
  const target = parseBootstrapTarget({
    ...process.env,
    VBTECH_CONTACT_DATABASE_URL: process.env.CONTACT_DATABASE_URL,
    VBTECH_POSTGRES_CA_FILE: caFile,
  });
  return await createPrivateBootstrapHandler({
    releaseSha,
    target,
    migrationSql,
    adapter: createPostgresBootstrapAdapter(),
  })(event);
}

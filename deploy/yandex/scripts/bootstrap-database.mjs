import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  openPostgresClient,
  validatePostgresCaFile,
  withPostgresClient,
} from "./postgres-client.mjs";

export const CONTACT_DATABASE = "vbtech_contact";
export const CONTACT_ROLE = "vbtech_contact";
const MIGRATION_NAME = "0001_contact_outbox.sql";
const MINIMUM_POSTGRES_VERSION = 150_000;
const MANAGED_POSTGRES_HOST = /^[a-z0-9-]+\.mdb\.yandexcloud\.net$/;
const RESOURCE_ID = /^[a-z0-9]{20}$/;
const DATABASE_NAME = /^[a-z][a-z0-9_]{0,62}$/;
const migrationUrl = new URL(
  "../../../apps/contact-function/migrations/0001_contact_outbox.sql",
  import.meta.url,
);
const TARGET_VARIABLES = Object.freeze([
  "VBTECH_CONTACT_DATABASE_URL",
  "VBTECH_EXPECTED_POSTGRES_HOST",
  "VBTECH_EXPECTED_POSTGRES_CLUSTER_ID",
  "VBTECH_OBSERVED_POSTGRES_CLUSTER_ID",
  "VBTECH_PROTECTED_DATABASE_NAME",
  "VBTECH_POSTGRES_CA_FILE",
  "VBTECH_DATABASE_BOOTSTRAP_APPROVED",
]);

function required(environment, name, maximum = 8_192) {
  const value = environment[name];
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    /\p{Cc}/u.test(value)
  ) {
    throw new Error(`invalid_${name.toLowerCase()}`);
  }
  return value;
}

function parseContactUrl(raw, expectedHost) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("invalid_vbtech_contact_database_url");
  }

  if (
    url.protocol !== "postgresql:" ||
    !MANAGED_POSTGRES_HOST.test(url.hostname) ||
    url.hostname !== expectedHost ||
    url.port !== "6432" ||
    decodeURIComponent(url.username) !== CONTACT_ROLE ||
    !url.password ||
    decodeURIComponent(url.pathname.slice(1)) !== CONTACT_DATABASE ||
    url.hash ||
    url.searchParams.size !== 1
  ) {
    throw new Error(
      MANAGED_POSTGRES_HOST.test(url.hostname)
        ? "invalid_vbtech_contact_database_url"
        : "invalid_vbtech_postgres_host",
    );
  }
  if (url.searchParams.get("sslmode") !== "verify-full") {
    throw new Error("postgres_verify_full_required");
  }
  return url;
}

export function parseBootstrapTarget(environment) {
  const expectedHost = required(environment, "VBTECH_EXPECTED_POSTGRES_HOST", 253);
  if (!MANAGED_POSTGRES_HOST.test(expectedHost)) {
    throw new Error("invalid_vbtech_postgres_host");
  }

  const expectedClusterId = required(environment, "VBTECH_EXPECTED_POSTGRES_CLUSTER_ID", 20);
  const observedClusterId = required(environment, "VBTECH_OBSERVED_POSTGRES_CLUSTER_ID", 20);
  if (!RESOURCE_ID.test(expectedClusterId) || !RESOURCE_ID.test(observedClusterId)) {
    throw new Error("invalid_vbtech_postgres_cluster_id");
  }
  if (expectedClusterId !== observedClusterId) {
    throw new Error("postgres_cluster_identity_mismatch");
  }

  const protectedDatabase = required(environment, "VBTECH_PROTECTED_DATABASE_NAME", 63);
  if (!DATABASE_NAME.test(protectedDatabase) || protectedDatabase === CONTACT_DATABASE) {
    throw new Error("invalid_vbtech_protected_database_name");
  }

  return Object.freeze({
    applicationUrl: parseContactUrl(
      required(environment, "VBTECH_CONTACT_DATABASE_URL"),
      expectedHost,
    ),
    database: CONTACT_DATABASE,
    role: CONTACT_ROLE,
    expectedHost,
    expectedClusterId,
    protectedDatabase,
    caFile: validatePostgresCaFile(
      required(environment, "VBTECH_POSTGRES_CA_FILE", 4_096),
    ),
    approved: environment.VBTECH_DATABASE_BOOTSTRAP_APPROVED === "yes",
  });
}

export function validateMigration(sql) {
  if (typeof sql !== "string" || sql.length === 0 || sql.length > 64 * 1_024) {
    throw new Error("invalid_contact_migration");
  }
  for (const object of ["contact_requests", "email_outbox", "contact_rate_limits"]) {
    if (!new RegExp(`CREATE TABLE IF NOT EXISTS ${object}\\b`).test(sql)) {
      throw new Error("invalid_contact_migration");
    }
  }
  if (/\b(?:DROP|ALTER\s+(?:DATABASE|ROLE)|CREATE\s+(?:DATABASE|ROLE|EXTENSION))\b/i.test(sql)) {
    throw new Error("unsafe_contact_migration");
  }
  return sql;
}

function assertSafeIdentity(identity, { requireSchemaOwnership = false } = {}) {
  if (
    identity.user !== CONTACT_ROLE ||
    identity.database !== CONTACT_DATABASE ||
    identity.tls !== true ||
    !Number.isInteger(identity.serverVersionNumber) ||
    identity.serverVersionNumber < MINIMUM_POSTGRES_VERSION ||
    identity.databaseOwner !== CONTACT_ROLE
  ) {
    throw new Error("postgres_target_identity_mismatch");
  }
  if (
    identity.roleIsSuperuser === true ||
    identity.roleCanReplicate === true ||
    identity.roleCanBypassRls === true ||
    !Array.isArray(identity.roleMemberships) ||
    identity.roleMemberships.length > 0
  ) {
    throw new Error("vbtech_role_privileges_mismatch");
  }
  if (requireSchemaOwnership && identity.publicSchemaOwner !== CONTACT_ROLE) {
    throw new Error("vbtech_public_schema_owner_mismatch");
  }
}

function assertProtectedAccessDenied(result) {
  if (result?.connected !== false) {
    throw new Error("vbtech_protected_database_access_detected");
  }
}

function safeReport(mode, identity) {
  return Object.freeze({
    mode,
    database: CONTACT_DATABASE,
    role: CONTACT_ROLE,
    databaseOwner: CONTACT_ROLE,
    publicSchemaOwned: identity.publicSchemaOwner === CONTACT_ROLE,
    protectedDatabaseConnected: false,
    mutation: mode === "apply",
  });
}

export async function runBootstrap({ mode, target, adapter, migrationSql = "" }) {
  if (mode !== "check" && mode !== "apply") throw new Error("invalid_bootstrap_mode");

  const identity = await adapter.inspectTarget(target);
  assertSafeIdentity(identity);

  // Yandex Cloud permissions are authoritative. Prove isolation before any
  // schema change or migration can fail.
  assertProtectedAccessDenied(await adapter.inspectProtected(target));

  if (mode === "check") return safeReport(mode, identity);
  if (!target.approved) throw new Error("database_bootstrap_approval_required");

  const migration = validateMigration(migrationSql);
  await adapter.prepareDatabase({ target });
  await adapter.migrateDatabase({ target, migration });

  const finalIdentity = await adapter.inspectTarget(target);
  assertSafeIdentity(finalIdentity, { requireSchemaOwnership: true });
  assertProtectedAccessDenied(await adapter.inspectProtected(target));
  return safeReport(mode, finalIdentity);
}

function protectedDatabaseUrl(target) {
  const url = new URL(target.applicationUrl);
  url.pathname = `/${target.protectedDatabase}`;
  return url;
}

async function inspectTargetWithClient(client) {
  const result = await client.query(
    `SELECT
       current_user AS "user",
       current_database() AS database,
       COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false) AS tls,
       current_setting('server_version_num')::integer AS "serverVersionNumber",
       database_owner.rolname AS "databaseOwner",
       active_role.rolsuper AS "roleIsSuperuser",
       active_role.rolreplication AS "roleCanReplicate",
       active_role.rolbypassrls AS "roleCanBypassRls",
       COALESCE((
         SELECT array_agg(granted_role.rolname ORDER BY granted_role.rolname)
           FROM pg_auth_members membership
           JOIN pg_roles member_role ON member_role.oid = membership.member
           JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
          WHERE member_role.rolname = current_user
       ), ARRAY[]::name[]) AS "roleMemberships",
       schema_owner.rolname AS "publicSchemaOwner"
     FROM pg_database database
     JOIN pg_roles database_owner ON database_owner.oid = database.datdba
     JOIN pg_roles active_role ON active_role.rolname = current_user
     LEFT JOIN pg_namespace namespace ON namespace.nspname = 'public'
     LEFT JOIN pg_roles schema_owner ON schema_owner.oid = namespace.nspowner
    WHERE database.datname = current_database()`,
  );
  return result.rows[0];
}

async function inspectProtected(openClient, target) {
  let client;
  try {
    client = await openClient(protectedDatabaseUrl(target), target.caFile);
  } catch (error) {
    if (error?.code === "42501") return { connected: false };
    throw error;
  }
  try {
    return { connected: true };
  } finally {
    await client.end();
  }
}

export function createPostgresBootstrapAdapter({
  withClient = withPostgresClient,
  openClient = openPostgresClient,
} = {}) {
  return Object.freeze({
    inspectTarget: (target) =>
      withClient(target.applicationUrl, target.caFile, inspectTargetWithClient),
    inspectProtected: (target) => inspectProtected(openClient, target),
    prepareDatabase: ({ target }) =>
      withClient(target.applicationUrl, target.caFile, async (client) => {
        const ownership = await client.query(
          `SELECT owner.rolname AS "publicSchemaOwner"
             FROM pg_namespace namespace
             JOIN pg_roles owner ON owner.oid = namespace.nspowner
            WHERE namespace.nspname = 'public'`,
        );
        if (ownership.rows[0]?.publicSchemaOwner !== CONTACT_ROLE) {
          await client.query(`ALTER SCHEMA public OWNER TO "${CONTACT_ROLE}"`);
        }
        const verified = await client.query(
          `SELECT owner.rolname AS "publicSchemaOwner"
             FROM pg_namespace namespace
             JOIN pg_roles owner ON owner.oid = namespace.nspowner
            WHERE namespace.nspname = 'public'`,
        );
        if (verified.rows[0]?.publicSchemaOwner !== CONTACT_ROLE) {
          throw new Error("vbtech_public_schema_owner_mismatch");
        }
      }),
    migrateDatabase: ({ target, migration }) =>
      withClient(target.applicationUrl, target.caFile, async (client) => {
        await client.query("BEGIN");
        try {
          await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
          await client.query(migration);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }),
  });
}

async function offlineCheck() {
  validateMigration(await readFile(migrationUrl, "utf8"));
  return {
    mode: "offline-check",
    database: CONTACT_DATABASE,
    role: CONTACT_ROLE,
    migration: MIGRATION_NAME,
    managedProvisioningRequired: true,
    mutation: false,
  };
}

function hasTargetEnvironment(environment) {
  return TARGET_VARIABLES.some(
    (name) => typeof environment[name] === "string" && environment[name].length > 0,
  );
}

function parseMode(arguments_) {
  if (arguments_.length !== 1 || !["--check", "--apply"].includes(arguments_[0])) {
    throw new Error("usage_bootstrap_database_check_or_apply");
  }
  return arguments_[0] === "--check" ? "check" : "apply";
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  if (mode === "check" && !hasTargetEnvironment(process.env)) {
    process.stdout.write(`${JSON.stringify(await offlineCheck())}\n`);
    return;
  }

  const target = parseBootstrapTarget(process.env);
  const report = await runBootstrap({
    mode,
    target,
    adapter: createPostgresBootstrapAdapter(),
    migrationSql: await readFile(migrationUrl, "utf8"),
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    const code = typeof error?.message === "string" && /^[a-z0-9_]+$/.test(error.message)
      ? error.message
      : "database_bootstrap_failed";
    process.stderr.write(`${JSON.stringify({ error: code })}\n`);
    process.exitCode = 1;
  });
}

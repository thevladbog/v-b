import { fileURLToPath } from "node:url";

import { CONTACT_DATABASE, CONTACT_ROLE } from "./bootstrap-database.mjs";
import { openPostgresClient, validatePostgresCaFile } from "./postgres-client.mjs";

const MANAGED_POSTGRES_HOST = /^[a-z0-9-]+\.mdb\.yandexcloud\.net$/;
const DATABASE_NAME = /^[a-z][a-z0-9_]{0,62}$/;

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

export function parsePermissionTarget(environment) {
  const expectedHost = required(environment, "VBTECH_EXPECTED_POSTGRES_HOST", 253);
  if (!MANAGED_POSTGRES_HOST.test(expectedHost)) {
    throw new Error("invalid_vbtech_postgres_host");
  }

  let applicationUrl;
  try {
    applicationUrl = new URL(required(environment, "VBTECH_CONTACT_DATABASE_URL"));
  } catch {
    throw new Error("invalid_vbtech_contact_database_url");
  }
  if (decodeURIComponent(applicationUrl.username) !== CONTACT_ROLE) {
    throw new Error("invalid_vbtech_database_role");
  }
  if (
    applicationUrl.protocol !== "postgresql:" ||
    applicationUrl.hostname !== expectedHost ||
    !MANAGED_POSTGRES_HOST.test(applicationUrl.hostname) ||
    applicationUrl.port !== "6432" ||
    !applicationUrl.password ||
    decodeURIComponent(applicationUrl.pathname.slice(1)) !== CONTACT_DATABASE ||
    applicationUrl.hash ||
    applicationUrl.searchParams.size !== 1 ||
    applicationUrl.searchParams.get("sslmode") !== "verify-full"
  ) {
    throw new Error("invalid_vbtech_contact_database_url");
  }

  const protectedDatabase = required(environment, "VBTECH_PROTECTED_DATABASE_NAME", 63);
  if (!DATABASE_NAME.test(protectedDatabase) || protectedDatabase === CONTACT_DATABASE) {
    throw new Error("invalid_vbtech_protected_database_name");
  }
  const caFile = validatePostgresCaFile(
    required(environment, "VBTECH_POSTGRES_CA_FILE", 4_096),
  );

  return Object.freeze({ applicationUrl, protectedDatabase, caFile });
}

export async function verifyPermissions({ target, adapter }) {
  const application = await adapter.inspectApplication(target);
  if (
    application.user !== CONTACT_ROLE ||
    application.database !== CONTACT_DATABASE ||
    application.publicSchemaOwner !== CONTACT_ROLE ||
    application.roleIsSuperuser === true ||
    application.roleCanReplicate === true ||
    application.roleCanBypassRls === true ||
    !Array.isArray(application.roleMemberships) ||
    application.roleMemberships.length > 0
  ) {
    throw new Error("vbtech_application_permissions_mismatch");
  }

  const protectedAccess = await adapter.inspectProtected(target);
  if (
    protectedAccess.connected !== false ||
    !Array.isArray(protectedAccess.readableRelations) ||
    !Array.isArray(protectedAccess.inheritedRoles) ||
    protectedAccess.readableRelations.length > 0 ||
    protectedAccess.inheritedRoles.length > 0
  ) {
    throw new Error("vbtech_protected_database_access_detected");
  }

  return Object.freeze({
    database: CONTACT_DATABASE,
    role: CONTACT_ROLE,
    protectedDatabase: target.protectedDatabase,
    protectedDatabaseConnected: false,
    readableProtectedRelations: 0,
    inheritedProtectedRoles: 0,
    mutation: false,
  });
}

async function withClient(openClient, connectionString, caFile, operation) {
  const client = await openClient(connectionString, caFile);
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

export function createPostgresPermissionAdapter({ openClient = openPostgresClient } = {}) {
  return Object.freeze({
    inspectApplication: (target) =>
      withClient(openClient, target.applicationUrl, target.caFile, async (client) => {
        const result = await client.query(
          `SELECT
             current_user AS "user",
             current_database() AS database,
             schema_owner.rolname AS "publicSchemaOwner",
             active_role.rolsuper AS "roleIsSuperuser",
             active_role.rolreplication AS "roleCanReplicate",
             active_role.rolbypassrls AS "roleCanBypassRls",
             COALESCE((
               SELECT array_agg(granted_role.rolname ORDER BY granted_role.rolname)
                 FROM pg_auth_members membership
                 JOIN pg_roles member_role ON member_role.oid = membership.member
                 JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
                WHERE member_role.rolname = current_user
             ), ARRAY[]::name[]) AS "roleMemberships"
           FROM pg_namespace namespace
           JOIN pg_roles schema_owner ON schema_owner.oid = namespace.nspowner
           JOIN pg_roles active_role ON active_role.rolname = current_user
          WHERE namespace.nspname = 'public'`,
        );
        return result.rows[0];
      }),
    inspectProtected: async (target) => {
      const protectedUrl = new URL(target.applicationUrl);
      protectedUrl.pathname = `/${target.protectedDatabase}`;
      let client;
      try {
        client = await openClient(protectedUrl, target.caFile);
      } catch (error) {
        if (error?.code === "42501") {
          return { connected: false, readableRelations: [], inheritedRoles: [] };
        }
        throw error;
      }
      try {
        const readable = await client.query(
          `SELECT namespace.nspname AS schema, relation.relname AS relation
             FROM pg_class relation
             JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
              AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
              AND has_table_privilege(
                current_user,
                format('%I.%I', namespace.nspname, relation.relname),
                'SELECT'
              )
            LIMIT 16`,
        );
        const memberships = await client.query(
          `SELECT role.rolname
             FROM pg_roles role
            WHERE role.rolname <> current_user
              AND pg_has_role(current_user, role.oid, 'MEMBER')
            LIMIT 16`,
        );
        return {
          connected: true,
          readableRelations: readable.rows,
          inheritedRoles: memberships.rows,
        };
      } finally {
        await client.end();
      }
    },
  });
}

function offlineCheck() {
  return {
    mode: "offline-check",
    database: CONTACT_DATABASE,
    role: CONTACT_ROLE,
    protectedDatabaseRequired: true,
    mutation: false,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--check", "--verify"].includes(args[0])) {
    throw new Error("usage_verify_permissions_check_or_verify");
  }
  if (args[0] === "--check") {
    process.stdout.write(`${JSON.stringify(offlineCheck())}\n`);
    return;
  }

  const target = parsePermissionTarget(process.env);
  const report = await verifyPermissions({
    target,
    adapter: createPostgresPermissionAdapter(),
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    const code = typeof error?.message === "string" && /^[a-z0-9_]+$/.test(error.message)
      ? error.message
      : "permission_verification_failed";
    process.stderr.write(`${JSON.stringify({ error: code })}\n`);
    process.exitCode = 1;
  });
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../../../", import.meta.url);
const FIXTURE_HOST = "rc1a-vbtech.mdb.yandexcloud.net";
const FIXTURE_SECRET = ["never", "print", "this"].join("-");
const FIXTURE_CA_FILE = "/etc/ssl/certs/yandex-cloud-ca.pem";

function postgresUrl({
  role,
  database,
  password = FIXTURE_SECRET,
  sslmode = "verify-full",
  host = FIXTURE_HOST,
}) {
  const url = new URL(`postgresql://${host}:6432/${database}`);
  url.username = role;
  url.password = password;
  url.searchParams.set("sslmode", sslmode);
  return url.toString();
}

async function source(path) {
  try {
    return await readFile(new URL(path, root), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

async function requiredSource(path) {
  return await readFile(new URL(path, root), "utf8");
}

async function terraformSources() {
  const names = [
    "function.tf",
    "iam.tf",
    "lockbox.tf",
    "network.tf",
    "outputs.tf",
    "scheduler.tf",
    "variables.tf",
    "versions.tf",
  ];
  return Object.fromEntries(
    await Promise.all(names.map(async (name) => [name, await source(`deploy/yandex/${name}`)])),
  );
}

function runScript(path, args = [], environment = {}) {
  return spawnSync(process.execPath, [fileURLToPath(new URL(path, root)), ...args], {
    cwd: fileURLToPath(root),
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", ...environment },
  });
}

test("pins the existing Markiro Terraform toolchain without defining a VM or PostgreSQL cluster", async () => {
  const sources = await terraformSources();
  const all = Object.values(sources).join("\n");

  assert.match(sources["versions.tf"], /required_version\s*=\s*"= 1\.15\.8"/);
  assert.match(sources["versions.tf"], /version\s*=\s*"= 0\.215\.0"/);
  assert.doesNotMatch(all, /resource\s+"yandex_compute_instance"/);
  assert.doesNotMatch(all, /resource\s+"yandex_mdb_postgresql_(?:cluster|database|user)"/);
  assert.doesNotMatch(all, /resource\s+"yandex_lockbox_secret_version/);
  assert.doesNotMatch(all, /text_value|password_payload_specification/);
});

test("keeps downloaded Terraform provider state out of the repository", async () => {
  const ignore = await source("deploy/yandex/.gitignore");
  const lock = await source("deploy/yandex/.terraform.lock.hcl");

  assert.match(ignore, /^\.terraform\/$/m);
  assert.match(ignore, /^\.terraform\.tfstate\.lock\.info$/m);
  assert.match(ignore, /^\*\.tfstate$/m);
  assert.match(ignore, /^\*\.tfstate\.\*$/m);
  assert.match(ignore, /^\*\.tfvars$/m);
  assert.match(ignore, /^\*\.tfvars\.json$/m);
  assert.match(ignore, /^crash\.\*\.log$/m);
  assert.doesNotMatch(ignore, /\.terraform\.lock\.hcl/);
  for (const hash of [
    "zh:c4a26ca9bc0e4eaa66cddffff4c53071686c7283d31e86eba7d960f5ea5f234e",
    "zh:214ac0a04a4f31ee0e3eb04ab1db9213c3ecaee9d4ebfd3d05b57399081c9d25",
    "zh:2160af8b81b6afff0b517d58a8b41179b81f6f69b19d4c2e5111162001d9d3b1",
  ]) {
    assert.match(lock, new RegExp(hash));
  }
});

test("defines isolated HTTP and worker functions from one immutable package", async () => {
  const sources = await terraformSources();
  const functions = sources["function.tf"];

  assert.match(functions, /resource\s+"yandex_function"\s+"contact_http"/);
  assert.match(functions, /resource\s+"yandex_function"\s+"contact_worker"/);
  assert.equal((functions.match(/runtime\s*=\s*"nodejs22"/g) ?? []).length, 2);
  assert.match(functions, /entrypoint\s*=\s*"index\.httpHandler"/);
  assert.match(functions, /entrypoint\s*=\s*"index\.timerHandler"/);
  assert.equal((functions.match(/network_id\s*=\s*var\.network_id/g) ?? []).length, 2);
  assert.equal((functions.match(/sha_256\s*=\s*var\.function_package_sha256/g) ?? []).length, 2);
  assert.match(functions, /CONTACT_SUBMISSION_ENABLED\s*=\s*tostring\(var\.contact_submission_enabled\)/);
  assert.match(functions, /environment_variable\s*=\s*"CONTACT_DATABASE_URL"/);
  assert.match(functions, /environment_variable\s*=\s*"CONTACT_OUTBOX_ENCRYPTION_KEY"/);
  assert.match(functions, /environment_variable\s*=\s*"CONTACT_RATE_LIMIT_HMAC_KEY"/);
  assert.match(functions, /environment_variable\s*=\s*"SMARTCAPTCHA_SECRET"/);
  assert.doesNotMatch(functions, /check\s+"function_artifact_identity_matches_release"/);
  assert.match(
    sources["variables.tf"],
    /var\.function_package_object\s*==\s*"vbtech-contact\/\$\{var\.function_release_sha\}\/function\.zip"/,
  );
  assert.equal(
    (functions.match(/yandex_lockbox_secret_iam_member\.contact_runtime/g) ?? []).length,
    2,
  );
  assert.match(functions, /yandex_resourcemanager_folder_iam_member\.contact_postbox_sender/);
});

test("grants only invocation, Lockbox payload, and Postbox sender capabilities", async () => {
  const sources = await terraformSources();
  const iam = sources["iam.tf"];
  const lockbox = sources["lockbox.tf"];
  const scheduler = sources["scheduler.tf"];

  assert.match(iam, /resource\s+"yandex_iam_service_account"\s+"contact_runtime"/);
  assert.match(iam, /role\s*=\s*"postbox\.sender"/);
  assert.match(iam, /role\s*=\s*"functions\.functionInvoker"/);
  assert.doesNotMatch(iam, /role\s*=\s*"(?:editor|admin)"/);
  assert.match(iam, /resource\s+"yandex_function_iam_binding"\s+"contact_http_public_invoker"/);
  assert.match(lockbox, /resource\s+"yandex_lockbox_secret_iam_member"\s+"contact_runtime"/);
  assert.match(lockbox, /role\s*=\s*"lockbox\.payloadViewer"/);
  assert.match(scheduler, /resource\s+"yandex_function_trigger"\s+"contact_worker"/);
  assert.match(scheduler, /id\s*=\s*yandex_function\.contact_worker\.id/);
  assert.match(scheduler, /service_account_id\s*=\s*yandex_iam_service_account\.contact_runtime\.id/);
  assert.match(iam, /function_id\s*=\s*yandex_function\.contact_http\.id/);
  assert.match(iam, /members\s*=\s*\["system:allUsers"\]/);
  assert.match(iam, /resource\s+"yandex_function_iam_binding"\s+"contact_worker_invoker"/);
  assert.match(iam, /function_id\s*=\s*yandex_function\.contact_worker\.id/);
  assert.doesNotMatch(iam, /yandex_resourcemanager_folder_iam_member"\s+"contact_timer_invoker"/);
  assert.match(scheduler, /yandex_function_iam_binding\.contact_worker_invoker/);
  assert.match(scheduler, /labels\s*=\s*var\.labels/);
  assert.match(scheduler, /retry_attempts\s*=\s*"3"/);
  assert.match(scheduler, /retry_interval\s*=\s*"30"/);
});

test("keeps submission disabled and outputs free of secret references by default", async () => {
  const sources = await terraformSources();

  assert.match(
    sources["variables.tf"],
    /variable\s+"contact_submission_enabled"\s*\{[\s\S]*?default\s*=\s*false/,
  );
  assert.match(
    sources["variables.tf"],
    /variable\s+"public_endpoint_enabled"\s*\{[\s\S]*?default\s*=\s*false/,
  );
  assert.match(
    sources["variables.tf"],
    /variable\s+"public_endpoint_enabled"\s*\{[\s\S]*?!var\.public_endpoint_enabled\s*\|\|\s*var\.public_endpoint_abuse_controls_approved/,
  );
  assert.match(
    sources["variables.tf"],
    /variable\s+"public_endpoint_abuse_controls_approved"\s*\{[\s\S]*?default\s*=\s*false/,
  );
  assert.match(
    sources["variables.tf"],
    /!var\.contact_submission_enabled\s*\|\|\s*\([\s\S]*var\.public_endpoint_enabled[\s\S]*var\.public_endpoint_abuse_controls_approved/,
  );
  assert.match(
    sources["iam.tf"],
    /resource\s+"yandex_function_iam_binding"\s+"contact_http_public_invoker"\s*\{[\s\S]*?count\s*=\s*var\.public_endpoint_enabled\s*&&\s*var\.public_endpoint_abuse_controls_approved\s*\?\s*1\s*:\s*0/,
  );
  assert.doesNotMatch(sources["outputs.tf"], /secret|password|token/i);
  assert.match(sources["outputs.tf"], /contact_http_function_id/);
  assert.match(sources["outputs.tf"], /contact_worker_function_id/);
});

test("requires read-only evidence that the existing serverless network spans every supported zone", async () => {
  const sources = await terraformSources();
  const network = sources["network.tf"];

  assert.match(sources["variables.tf"], /variable\s+"serverless_subnet_ids"/);
  assert.match(network, /data\s+"yandex_vpc_subnet"\s+"serverless"/);
  assert.doesNotMatch(network, /check\s+"serverless_network_spans_supported_zones"/);
  for (const zone of ["ru-central1-a", "ru-central1-b", "ru-central1-d"]) {
    assert.match(sources["variables.tf"], new RegExp(zone));
  }
  assert.match(
    sources["variables.tf"],
    /toset\(keys\(var\.serverless_subnet_ids\)\)\s*==\s*toset\(\["ru-central1-a", "ru-central1-b", "ru-central1-d"\]\)/,
  );
  assert.match(network, /postcondition\s*\{/);
  assert.match(network, /self\.zone\s*==\s*each\.key/);
  assert.match(network, /self\.network_id\s*==\s*var\.network_id/);
});

test("fails closed unless PostgreSQL admits the exact Yandex serverless VPC range", async () => {
  const sources = await terraformSources();
  const network = sources["network.tf"];

  assert.match(sources["variables.tf"], /variable\s+"postgres_security_group_id"/);
  assert.match(network, /data\s+"yandex_vpc_security_group"\s+"postgres"/);
  assert.match(network, /security_group_id\s*=\s*var\.postgres_security_group_id/);
  assert.match(network, /self\.network_id\s*==\s*var\.network_id/);
  assert.match(network, /rule\.protocol\s*==\s*"TCP"/);
  assert.match(network, /rule\.port\s*==\s*6432/);
  assert.match(network, /rule\.from_port\s*==\s*6432/);
  assert.match(network, /rule\.to_port\s*==\s*6432/);
  assert.match(
    network,
    /toset\(rule\.v4_cidr_blocks\)\s*==\s*toset\(\["198\.19\.0\.0\/16"\]\)/,
  );
});

test("bootstrap offline check validates the fixed database boundary without credentials", () => {
  const result = runScript("deploy/yandex/scripts/bootstrap-database.mjs", ["--check"]);

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report, {
    mode: "offline-check",
    database: "vbtech_contact",
    role: "vbtech_contact",
    migration: "0001_contact_outbox.sql",
    managedProvisioningRequired: true,
    mutation: false,
  });
  assert.equal(result.stderr, "");
  assert.doesNotMatch(result.stdout, /password|postgresql:\/\//i);
});

test("documents supported control-plane provisioning without SQL or Terraform secrets", async () => {
  const runbook = await requiredSource("deploy/yandex/README.md");
  const bootstrap = await requiredSource("deploy/yandex/scripts/bootstrap-database.mjs");

  assert.match(runbook, /Yandex Cloud control-plane operation/);
  assert.match(runbook, /management console/);
  assert.match(runbook, /generated password never appears in shell history/);
  assert.match(runbook, /database-permission list contains only `vbtech_contact`/);
  assert.match(runbook, /PostgreSQL 15 or newer/);
  assert.doesNotMatch(bootstrap, /CREATE\s+(?:ROLE|DATABASE)|ALTER\s+ROLE/i);
  assert.doesNotMatch(bootstrap, /VBTECH_POSTGRES_ADMIN_URL|databaseUrl\([^,]+,\s*["']postgres["']/);
});

test("partial bootstrap configuration fails closed instead of selecting the offline check", () => {
  const result = runScript(
    "deploy/yandex/scripts/bootstrap-database.mjs",
    ["--check"],
    { VBTECH_EXPECTED_POSTGRES_HOST: FIXTURE_HOST },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid_vbtech_/);
  assert.doesNotMatch(result.stdout, /offline-check/);
});

test("operational PostgreSQL clients use an explicit CA and bounded timeouts", async () => {
  const { postgresClientConfig } = await import("../scripts/postgres-client.mjs");
  const sourceUrl = new URL(postgresUrl({ role: "vbtech_contact", database: "vbtech_contact" }));
  const config = postgresClientConfig(sourceUrl, "-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----\n");

  assert.equal(sourceUrl.searchParams.get("sslmode"), "verify-full");
  assert.doesNotMatch(config.connectionString, /sslmode=/);
  assert.deepEqual(config.ssl, {
    ca: "-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----\n",
    rejectUnauthorized: true,
  });
  assert.equal(config.connectionTimeoutMillis, 10_000);
  assert.equal(config.statement_timeout, 15_000);
  assert.equal(config.query_timeout, 20_000);

  const packageJson = JSON.parse(await requiredSource("package.json"));
  assert.equal(packageJson.dependencies?.pg, "8.22.0");
});

test("bootstrap target validation rejects local, unverified, and mismatched clusters", async () => {
  const { parseBootstrapTarget } = await import("../scripts/bootstrap-database.mjs");
  const base = {
    VBTECH_CONTACT_DATABASE_URL: postgresUrl({
      role: "vbtech_contact",
      database: "vbtech_contact",
    }),
    VBTECH_EXPECTED_POSTGRES_HOST: "rc1a-vbtech.mdb.yandexcloud.net",
    VBTECH_EXPECTED_POSTGRES_CLUSTER_ID: "c9q00000000000000000",
    VBTECH_OBSERVED_POSTGRES_CLUSTER_ID: "c9q00000000000000000",
    VBTECH_PROTECTED_DATABASE_NAME: "markiro",
    VBTECH_POSTGRES_CA_FILE: FIXTURE_CA_FILE,
  };

  assert.equal(parseBootstrapTarget(base).database, "vbtech_contact");
  assert.throws(
    () => parseBootstrapTarget({ ...base, VBTECH_POSTGRES_CA_FILE: undefined }),
    /invalid_vbtech_postgres_ca_file/,
  );
  assert.throws(
    () => parseBootstrapTarget({ ...base, VBTECH_CONTACT_DATABASE_URL: undefined }),
    /invalid_vbtech_contact_database_url/,
  );
  assert.throws(
    () =>
      parseBootstrapTarget({
        ...base,
        VBTECH_CONTACT_DATABASE_URL: postgresUrl({
          role: "vbtech_contact",
          database: "vbtech_contact",
          host: "localhost",
        }),
        VBTECH_EXPECTED_POSTGRES_HOST: "localhost",
      }),
    /invalid_vbtech_postgres_host/,
  );
  assert.throws(
    () =>
      parseBootstrapTarget({
        ...base,
        VBTECH_CONTACT_DATABASE_URL: postgresUrl({
          role: "vbtech_contact",
          database: "vbtech_contact",
          sslmode: "require",
        }),
      }),
    /postgres_verify_full_required/,
  );
  assert.throws(
    () =>
      parseBootstrapTarget({
        ...base,
        VBTECH_OBSERVED_POSTGRES_CLUSTER_ID: "c9q11111111111111111",
      }),
    /postgres_cluster_identity_mismatch/,
  );
});

test("read-only bootstrap check proves managed identity and protected-database denial", async () => {
  const { parseBootstrapTarget, runBootstrap } = await import("../scripts/bootstrap-database.mjs");
  const target = parseBootstrapTarget({
    VBTECH_CONTACT_DATABASE_URL: postgresUrl({
      role: "vbtech_contact",
      database: "vbtech_contact",
    }),
    VBTECH_EXPECTED_POSTGRES_HOST: "rc1a-vbtech.mdb.yandexcloud.net",
    VBTECH_EXPECTED_POSTGRES_CLUSTER_ID: "c9q00000000000000000",
    VBTECH_OBSERVED_POSTGRES_CLUSTER_ID: "c9q00000000000000000",
    VBTECH_PROTECTED_DATABASE_NAME: "markiro",
    VBTECH_POSTGRES_CA_FILE: FIXTURE_CA_FILE,
  });
  const operations = [];
  const safeIdentity = {
    user: "vbtech_contact",
    database: "vbtech_contact",
    tls: true,
    serverVersionNumber: 170_000,
    databaseOwner: "vbtech_contact",
    publicSchemaOwner: "pg_database_owner",
    roleIsSuperuser: false,
    roleCanReplicate: false,
    roleCanBypassRls: false,
    roleMemberships: [],
  };
  const adapter = {
    inspectTarget: async () => {
      operations.push("inspect-target");
      return safeIdentity;
    },
    inspectProtected: async () => {
      operations.push("inspect-protected");
      return { connected: false };
    },
    prepareDatabase: async () => operations.push("prepare-database"),
    migrateDatabase: async () => operations.push("migrate-database"),
  };

  const report = await runBootstrap({ mode: "check", target, adapter });

  assert.deepEqual(operations, ["inspect-target", "inspect-protected"]);
  assert.deepEqual(report, {
    mode: "check",
    database: "vbtech_contact",
    role: "vbtech_contact",
    databaseOwner: "vbtech_contact",
    publicSchemaOwned: false,
    protectedDatabaseConnected: false,
    mutation: false,
  });
  assert.equal(JSON.stringify(report).includes(FIXTURE_SECRET), false);

  await assert.rejects(
    runBootstrap({
      mode: "check",
      target,
      adapter: {
        ...adapter,
        inspectTarget: async () => ({ ...safeIdentity, roleCanBypassRls: true }),
      },
    }),
    /vbtech_role_privileges_mismatch/,
  );
  await assert.rejects(
    runBootstrap({
      mode: "check",
      target,
      adapter: {
        ...adapter,
        inspectTarget: async () => ({ ...safeIdentity, roleMemberships: ["markiro"] }),
      },
    }),
    /vbtech_role_privileges_mismatch/,
  );
  await assert.rejects(
    runBootstrap({
      mode: "check",
      target,
      adapter: {
        ...adapter,
        inspectTarget: async () => ({ ...safeIdentity, serverVersionNumber: 140_000 }),
      },
    }),
    /postgres_target_identity_mismatch/,
  );
});

test("managed bootstrap proves isolation before schema changes and migrations", async () => {
  const { parseBootstrapTarget, runBootstrap } = await import("../scripts/bootstrap-database.mjs");
  const target = parseBootstrapTarget({
    VBTECH_CONTACT_DATABASE_URL: postgresUrl({
      role: "vbtech_contact",
      database: "vbtech_contact",
    }),
    VBTECH_EXPECTED_POSTGRES_HOST: FIXTURE_HOST,
    VBTECH_EXPECTED_POSTGRES_CLUSTER_ID: "c9q00000000000000000",
    VBTECH_OBSERVED_POSTGRES_CLUSTER_ID: "c9q00000000000000000",
    VBTECH_PROTECTED_DATABASE_NAME: "markiro",
    VBTECH_POSTGRES_CA_FILE: FIXTURE_CA_FILE,
    VBTECH_DATABASE_BOOTSTRAP_APPROVED: "yes",
  });
  const operations = [];
  let inspection = 0;
  const identity = {
    user: "vbtech_contact",
    database: "vbtech_contact",
    tls: true,
    serverVersionNumber: 170_000,
    databaseOwner: "vbtech_contact",
    publicSchemaOwner: "pg_database_owner",
    roleIsSuperuser: false,
    roleCanReplicate: false,
    roleCanBypassRls: false,
    roleMemberships: [],
  };
  const migrationSql = await requiredSource("apps/contact-function/migrations/0001_contact_outbox.sql");
  const report = await runBootstrap({
    mode: "apply",
    target,
    migrationSql,
    adapter: {
      inspectTarget: async () => {
        operations.push("inspect-target");
        inspection += 1;
        return inspection === 1
          ? identity
          : { ...identity, publicSchemaOwner: "vbtech_contact" };
      },
      inspectProtected: async () => {
        operations.push("inspect-protected");
        return { connected: false };
      },
      prepareDatabase: async () => operations.push("prepare-database"),
      migrateDatabase: async () => operations.push("migrate-database"),
    },
  });

  assert.deepEqual(operations, [
    "inspect-target",
    "inspect-protected",
    "prepare-database",
    "migrate-database",
    "inspect-target",
    "inspect-protected",
  ]);
  assert.equal(report.publicSchemaOwned, true);
  assert.equal(report.protectedDatabaseConnected, false);
  assert.equal(report.mutation, true);

  await assert.rejects(
    runBootstrap({
      mode: "apply",
      target,
      migrationSql,
      adapter: {
        inspectTarget: async () => identity,
        inspectProtected: async () => ({ connected: true }),
        prepareDatabase: async () => assert.fail("must not prepare before isolation proof"),
        migrateDatabase: async () => assert.fail("must not migrate before isolation proof"),
      },
    }),
    /vbtech_protected_database_access_detected/,
  );
});

test("database adapter uses only the pre-provisioned contact database and exact ownership", async () => {
  const { createPostgresBootstrapAdapter, parseBootstrapTarget } = await import(
    "../scripts/bootstrap-database.mjs"
  );
  const target = parseBootstrapTarget({
    VBTECH_CONTACT_DATABASE_URL: postgresUrl({
      role: "vbtech_contact",
      database: "vbtech_contact",
    }),
    VBTECH_EXPECTED_POSTGRES_HOST: FIXTURE_HOST,
    VBTECH_EXPECTED_POSTGRES_CLUSTER_ID: "c9q00000000000000000",
    VBTECH_OBSERVED_POSTGRES_CLUSTER_ID: "c9q00000000000000000",
    VBTECH_PROTECTED_DATABASE_NAME: "markiro",
    VBTECH_POSTGRES_CA_FILE: FIXTURE_CA_FILE,
    VBTECH_DATABASE_BOOTSTRAP_APPROVED: "yes",
  });
  const connections = [];
  const queries = [];
  let ownershipInspection = 0;
  const adapter = createPostgresBootstrapAdapter({
    withClient: async (connectionUrl, caFile, operation) => {
      connections.push({ database: new URL(connectionUrl).pathname, caFile });
      return await operation({
        connection: { stream: { encrypted: true, authorized: true } },
        query: async (sql) => {
          queries.push(sql);
          if (/server_version_num/.test(sql)) {
            return {
              rows: [{
                user: "vbtech_contact",
                database: "vbtech_contact",
                tls: false,
                serverVersionNumber: 170_000,
                databaseOwner: "vbtech_contact",
                publicSchemaOwner: "vbtech_contact",
                roleIsSuperuser: false,
                roleCanReplicate: false,
                roleCanBypassRls: false,
                roleMemberships: [],
              }],
            };
          }
          if (/schema_owner|publicSchemaOwner/.test(sql)) {
            ownershipInspection += 1;
            return {
              rows: [{
                publicSchemaOwner: ownershipInspection === 1
                  ? "pg_database_owner"
                  : "vbtech_contact",
              }],
            };
          }
          return { rows: [] };
        },
      });
    },
    openClient: async (connectionUrl) => {
      connections.push({ database: new URL(connectionUrl).pathname, caFile: FIXTURE_CA_FILE });
      throw Object.assign(new Error("permission denied"), { code: "42501" });
    },
  });

  assert.equal((await adapter.inspectTarget(target)).tls, true);
  assert.deepEqual(await adapter.inspectProtected(target), { connected: false });
  await adapter.prepareDatabase({ target });

  const joined = queries.join("\n");
  assert.doesNotMatch(joined, /CREATE\s+(?:ROLE|DATABASE)|ALTER\s+ROLE/i);
  assert.doesNotMatch(joined, /pg_has_role/);
  assert.match(joined, /ARRAY\[\]::text\[\]/);
  assert.match(joined, /owner\.rolname AS "publicSchemaOwner"/);
  assert.match(joined, /ALTER SCHEMA public OWNER TO "vbtech_contact"/);
  assert.deepEqual(connections.map(({ database }) => database), [
    "/vbtech_contact",
    "/markiro",
    "/vbtech_contact",
  ]);
  assert.equal(connections.some(({ database }) => database === "/postgres"), false);

  const odysseyDenial = Object.assign(
    new Error("odyssey: c4c9ec260edb0: user blocked: markiro vbtech_contact"),
    { code: "28000" },
  );
  const odysseyAdapter = createPostgresBootstrapAdapter({
    openClient: async () => { throw odysseyDenial; },
  });
  assert.deepEqual(await odysseyAdapter.inspectProtected(target), { connected: false });

  const unrelatedAuthFailure = Object.assign(
    new Error("odyssey: c4c9ec260edb0: user blocked: markiro markiro"),
    { code: "28000" },
  );
  const unsafeOdysseyAdapter = createPostgresBootstrapAdapter({
    openClient: async () => { throw unrelatedAuthFailure; },
  });
  await assert.rejects(
    unsafeOdysseyAdapter.inspectProtected(target),
    (error) => error === unrelatedAuthFailure,
  );
});

test("permission verifier has a secret-free offline contract check", () => {
  const result = runScript("deploy/yandex/scripts/verify-permissions.mjs", ["--check"]);

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report, {
    mode: "offline-check",
    database: "vbtech_contact",
    role: "vbtech_contact",
    protectedDatabaseRequired: true,
    mutation: false,
  });
  assert.equal(result.stderr, "");
});

test("permission verification proves the app boundary without mutating either database", async () => {
  const { parsePermissionTarget, verifyPermissions } = await import(
    "../scripts/verify-permissions.mjs"
  );
  const environment = {
    VBTECH_CONTACT_DATABASE_URL: postgresUrl({
      role: "vbtech_contact",
      database: "vbtech_contact",
    }),
    VBTECH_EXPECTED_POSTGRES_HOST: "rc1a-vbtech.mdb.yandexcloud.net",
    VBTECH_PROTECTED_DATABASE_NAME: "markiro",
    VBTECH_POSTGRES_CA_FILE: FIXTURE_CA_FILE,
  };
  const target = parsePermissionTarget(environment);
  assert.throws(
    () => parsePermissionTarget({ ...environment, VBTECH_POSTGRES_CA_FILE: undefined }),
    /invalid_vbtech_postgres_ca_file/,
  );
  const operations = [];
  const report = await verifyPermissions({
    target,
    adapter: {
      inspectApplication: async () => {
        operations.push("inspect-application");
        return {
          user: "vbtech_contact",
          database: "vbtech_contact",
          publicSchemaOwner: "vbtech_contact",
          roleIsSuperuser: false,
          roleCanReplicate: false,
          roleCanBypassRls: false,
          roleMemberships: [],
        };
      },
      inspectProtected: async () => {
        operations.push("inspect-protected");
        return { connected: false, readableRelations: [], inheritedRoles: [] };
      },
    },
  });

  assert.deepEqual(operations, ["inspect-application", "inspect-protected"]);
  assert.deepEqual(report, {
    database: "vbtech_contact",
    role: "vbtech_contact",
    protectedDatabase: "markiro",
    protectedDatabaseConnected: false,
    readableProtectedRelations: 0,
    inheritedProtectedRoles: 0,
    mutation: false,
  });
  assert.equal(JSON.stringify(report).includes(FIXTURE_SECRET), false);
  await assert.rejects(
    verifyPermissions({
      target,
      adapter: {
        inspectApplication: async () => ({
          user: "vbtech_contact",
          database: "vbtech_contact",
          publicSchemaOwner: "vbtech_contact",
          roleIsSuperuser: false,
          roleCanReplicate: false,
          roleCanBypassRls: false,
          roleMemberships: [],
        }),
        inspectProtected: async () => ({
          connected: true,
          readableRelations: [],
          inheritedRoles: [],
        }),
      },
    }),
    /vbtech_protected_database_access_detected/,
  );
  assert.throws(
    () =>
      parsePermissionTarget({
        ...environment,
        VBTECH_CONTACT_DATABASE_URL: postgresUrl({ role: "markiro", database: "vbtech_contact" }),
      }),
    /invalid_vbtech_database_role/,
  );
});

test("permission adapter proves schema ownership and cannot swallow inspection errors", async () => {
  const { createPostgresPermissionAdapter, parsePermissionTarget } = await import(
    "../scripts/verify-permissions.mjs"
  );
  const target = parsePermissionTarget({
    VBTECH_CONTACT_DATABASE_URL: postgresUrl({
      role: "vbtech_contact",
      database: "vbtech_contact",
    }),
    VBTECH_EXPECTED_POSTGRES_HOST: FIXTURE_HOST,
    VBTECH_PROTECTED_DATABASE_NAME: "markiro",
    VBTECH_POSTGRES_CA_FILE: FIXTURE_CA_FILE,
  });
  const applicationQueries = [];
  let applicationClosed = false;
  const denied = Object.assign(new Error("permission denied"), { code: "42501" });
  const adapter = createPostgresPermissionAdapter({
    openClient: async (connectionUrl, caFile) => {
      assert.equal(caFile, FIXTURE_CA_FILE);
      if (new URL(connectionUrl).pathname === "/markiro") throw denied;
      return {
        query: async (sql) => {
          applicationQueries.push(sql);
          return {
            rows: [{
              user: "vbtech_contact",
              database: "vbtech_contact",
              publicSchemaOwner: "vbtech_contact",
              roleIsSuperuser: false,
              roleCanReplicate: false,
              roleCanBypassRls: false,
              roleMemberships: [],
            }],
          };
        },
        end: async () => {
          applicationClosed = true;
        },
      };
    },
  });

  assert.equal((await adapter.inspectApplication(target)).publicSchemaOwner, "vbtech_contact");
  assert.match(applicationQueries[0], /pg_namespace/);
  assert.match(applicationQueries[0], /nspowner/);
  assert.doesNotMatch(applicationQueries[0], /pg_has_role/);
  assert.match(applicationQueries[0], /schema_owner\.rolname AS "publicSchemaOwner"/);
  assert.match(applicationQueries[0], /rolbypassrls/);
  assert.match(applicationQueries[0], /pg_auth_members/);
  assert.match(applicationQueries[0], /ARRAY\[\]::text\[\]/);
  assert.equal(applicationClosed, true);
  assert.deepEqual(await adapter.inspectProtected(target), {
    connected: false,
    readableRelations: [],
    inheritedRoles: [],
  });

  const odysseyDenial = Object.assign(
    new Error("odyssey: c4c9ec260edb0: user blocked: markiro vbtech_contact"),
    { code: "28000" },
  );
  const odysseyAdapter = createPostgresPermissionAdapter({
    openClient: async () => { throw odysseyDenial; },
  });
  assert.deepEqual(await odysseyAdapter.inspectProtected(target), {
    connected: false,
    readableRelations: [],
    inheritedRoles: [],
  });

  const queryFailure = Object.assign(new Error("inspection failed"), { code: "42501" });
  let protectedClosed = false;
  const unsafeAdapter = createPostgresPermissionAdapter({
    openClient: async () => ({
      query: async () => {
        throw queryFailure;
      },
      end: async () => {
        protectedClosed = true;
      },
    }),
  });

  await assert.rejects(unsafeAdapter.inspectProtected(target), (error) => error === queryFailure);
  assert.equal(protectedClosed, true);
});

test("infra fixtures contain no credential-shaped PostgreSQL literals", async () => {
  const contract = await requiredSource("deploy/yandex/test/infra-contract.test.mjs");

  assert.doesNotMatch(contract, /postgres(?:ql)?:\/\/[^\s/@]+:[^\s/@]+@/);
});

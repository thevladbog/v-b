import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const migrationUrl = new URL("../migrations/0001_contact_outbox.sql", import.meta.url);
const EXPECTED_DATABASE_NAME = "vbtech_contact_test";
const EXPECTED_DATABASE_ROLE = "vbtech_test";
const INVALID_DATABASE_URL =
  "VBTECH_TEST_DATABASE_URL must target vbtech_test@vbtech_contact_test";

export const assertDisposableDatabaseIdentity = (
  databaseName: string,
  roleName: string,
): void => {
  if (
    databaseName !== EXPECTED_DATABASE_NAME ||
    roleName !== EXPECTED_DATABASE_ROLE
  ) {
    throw new Error("database reset requires vbtech_test@vbtech_contact_test");
  }
};

export const requireTestDatabaseUrl = (): string => {
  const value = process.env.VBTECH_TEST_DATABASE_URL;
  if (!value) {
    throw new Error(
      "VBTECH_TEST_DATABASE_URL is required for contact-function database tests",
    );
  }

  let parsed: URL;
  let databaseName: string;
  let roleName: string;
  try {
    parsed = new URL(value);
    databaseName = decodeURIComponent(parsed.pathname.slice(1));
    roleName = decodeURIComponent(parsed.username);
  } catch {
    throw new Error(INVALID_DATABASE_URL);
  }
  if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) {
    throw new Error("VBTECH_TEST_DATABASE_URL must target a loopback-only PostgreSQL instance");
  }
  if (
    parsed.protocol !== "postgresql:" ||
    databaseName !== EXPECTED_DATABASE_NAME ||
    roleName !== EXPECTED_DATABASE_ROLE
  ) {
    throw new Error(INVALID_DATABASE_URL);
  }

  return value;
};

export const createTestPool = () =>
  new Pool({
    connectionString: requireTestDatabaseUrl(),
    max: 8,
  });

export const resetContactSchema = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    const identity = await client.query<{
      database_name: string;
      role_name: string;
    }>(
      "SELECT current_database() AS database_name, current_user AS role_name",
    );
    const current = identity.rows[0];
    assertDisposableDatabaseIdentity(
      current?.database_name ?? "",
      current?.role_name ?? "",
    );
    await client.query(
      "DROP TABLE IF EXISTS email_outbox, contact_requests, contact_rate_limits",
    );
    await client.query("DROP FUNCTION IF EXISTS contact_test_reject_outbox()");
  } finally {
    client.release();
  }
};

export const migrate = async (pool: Pool): Promise<void> => {
  const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
  await pool.query(sql);
};

export const resetContactTables = async (pool: Pool): Promise<void> => {
  await pool.query(
    "TRUNCATE TABLE email_outbox, contact_requests, contact_rate_limits RESTART IDENTITY",
  );
};

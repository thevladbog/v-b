import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const migrationUrl = new URL("../migrations/0001_contact_outbox.sql", import.meta.url);

export const requireTestDatabaseUrl = (): string => {
  const value = process.env.VBTECH_TEST_DATABASE_URL;
  if (!value) {
    throw new Error(
      "VBTECH_TEST_DATABASE_URL is required for contact-function database tests",
    );
  }

  const parsed = new URL(value);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) {
    throw new Error("VBTECH_TEST_DATABASE_URL must target a loopback-only PostgreSQL instance");
  }
  if (["/postgres", "/template0", "/template1", "/"].includes(parsed.pathname)) {
    throw new Error("VBTECH_TEST_DATABASE_URL must target a disposable named test database");
  }

  return value;
};

export const createTestPool = () =>
  new Pool({
    connectionString: requireTestDatabaseUrl(),
    max: 8,
  });

export const resetContactSchema = async (pool: Pool): Promise<void> => {
  await pool.query("DROP TABLE IF EXISTS email_outbox, contact_requests, contact_rate_limits");
  await pool.query("DROP FUNCTION IF EXISTS contact_test_reject_outbox()");
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

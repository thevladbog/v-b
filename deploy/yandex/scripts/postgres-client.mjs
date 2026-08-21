import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";

const CONNECTION_TIMEOUT_MS = 10_000;
const STATEMENT_TIMEOUT_MS = 15_000;
const QUERY_TIMEOUT_MS = 20_000;
const MAXIMUM_CA_BYTES = 64 * 1_024;

/** Validate a reviewed absolute CA path without reading it during offline checks. */
export function validatePostgresCaFile(caFile) {
  if (
    typeof caFile !== "string" ||
    caFile.length === 0 ||
    caFile.length > 4_096 ||
    !isAbsolute(caFile) ||
    /\p{Cc}/u.test(caFile)
  ) {
    throw new Error("invalid_vbtech_postgres_ca_file");
  }
  return caFile;
}

/** Build a node-postgres configuration without allowing URL SSL options to override the reviewed CA. */
export function postgresClientConfig(connectionUrl, ca) {
  const url = new URL(connectionUrl);
  if (url.searchParams.get("sslmode") !== "verify-full") {
    throw new Error("postgres_verify_full_required");
  }
  if (
    typeof ca !== "string" ||
    ca.length === 0 ||
    ca.length > MAXIMUM_CA_BYTES ||
    !ca.includes("-----BEGIN CERTIFICATE-----") ||
    !ca.includes("-----END CERTIFICATE-----")
  ) {
    throw new Error("invalid_vbtech_postgres_ca");
  }

  url.searchParams.delete("sslmode");
  return Object.freeze({
    connectionString: url.href,
    ssl: Object.freeze({ ca, rejectUnauthorized: true }),
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
  });
}

/** Open one strict TLS PostgreSQL client using the pinned root dependency. */
export async function openPostgresClient(connectionUrl, caFile) {
  const reviewedCaFile = validatePostgresCaFile(caFile);
  const ca = await readFile(reviewedCaFile, "utf8");
  const { Client } = await import("pg");
  const client = new Client(postgresClientConfig(connectionUrl, ca));
  await client.connect();
  return client;
}

/** Run an operation and always close the strict TLS PostgreSQL client. */
export async function withPostgresClient(connectionUrl, caFile, operation) {
  const client = await openPostgresClient(connectionUrl, caFile);
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

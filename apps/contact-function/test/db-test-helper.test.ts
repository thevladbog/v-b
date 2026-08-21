import { afterEach, describe, expect, it } from "vitest";
import {
  assertDisposableDatabaseIdentity,
  requireTestDatabaseUrl,
} from "./db-test-helper.js";

const previousDatabaseUrl = process.env.VBTECH_TEST_DATABASE_URL;

afterEach(() => {
  if (previousDatabaseUrl === undefined) {
    delete process.env.VBTECH_TEST_DATABASE_URL;
  } else {
    process.env.VBTECH_TEST_DATABASE_URL = previousDatabaseUrl;
  }
});

describe("disposable database boundary", () => {
  // Catches a test-safety break that blocks the one explicitly approved disposable identity.
  it("accepts only the exact decoded test role and database", () => {
    process.env.VBTECH_TEST_DATABASE_URL =
      "postgresql://vbtech_test:test-only@127.0.0.1:55432/vbtech_contact_test";

    expect(requireTestDatabaseUrl()).toBe(
      "postgresql://vbtech_test:test-only@127.0.0.1:55432/vbtech_contact_test",
    );
    expect(() =>
      assertDisposableDatabaseIdentity("vbtech_contact_test", "vbtech_test"),
    ).not.toThrow();
  });

  // Catches a test-safety break that permits the reset helper to target another loopback database.
  it("rejects a wrong loopback database before creating a pool", () => {
    process.env.VBTECH_TEST_DATABASE_URL =
      "postgresql://vbtech_test:test-only@127.0.0.1:55432/another_test_database";

    expect(() => requireTestDatabaseUrl()).toThrow(
      "VBTECH_TEST_DATABASE_URL must target vbtech_test@vbtech_contact_test",
    );
  });

  // Catches a test-safety break that accepts an encoded path suffix as the disposable database name.
  it("rejects an encoded database-name bypass before creating a pool", () => {
    process.env.VBTECH_TEST_DATABASE_URL =
      "postgresql://vbtech_test:test-only@127.0.0.1:55432/vbtech_contact_test%2Fignored";

    expect(() => requireTestDatabaseUrl()).toThrow(
      "VBTECH_TEST_DATABASE_URL must target vbtech_test@vbtech_contact_test",
    );
  });

  // Catches a test-safety break that permits a different role to reach destructive reset statements.
  it("rejects a wrong test role before creating a pool", () => {
    process.env.VBTECH_TEST_DATABASE_URL =
      "postgresql://another_role:test-only@127.0.0.1:55432/vbtech_contact_test";

    expect(() => requireTestDatabaseUrl()).toThrow(
      "VBTECH_TEST_DATABASE_URL must target vbtech_test@vbtech_contact_test",
    );
  });

  // Catches a test-safety break that runs reset after the connected server reports another identity.
  it.each([
    ["another_database", "vbtech_test"],
    ["vbtech_contact_test", "another_role"],
  ])("rejects connected identity %s/%s before reset", (databaseName, roleName) => {
    expect(() => assertDisposableDatabaseIdentity(databaseName, roleName)).toThrow(
      "database reset requires vbtech_test@vbtech_contact_test",
    );
  });
});

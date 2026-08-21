import { Buffer } from "node:buffer";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ContactRequest } from "@vbtech/contracts";
import { Pool } from "pg";
import { decryptPayload } from "../src/crypto.js";
import { OutboxRepository } from "../src/outbox-repository.js";
import {
  createTestPool,
  migrate,
  requireTestDatabaseUrl,
  resetContactSchema,
  resetContactTables,
} from "./db-test-helper.js";

const encryptionKey = Buffer.from(
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  "hex",
);
const telegramRequest: ContactRequest = {
  requestId: "11111111-1111-4111-8111-111111111111",
  locale: "en",
  name: "Vlad",
  contact: "@thevladbog",
  message: "A concrete product problem",
  sourcePath: "/en/",
  consentId: "VBT-PD-02/DRAFT",
  captchaToken: "opaque-token-one",
  website: "",
};
const emailRequest: ContactRequest = {
  ...telegramRequest,
  requestId: "22222222-2222-4222-8222-222222222222",
  contact: "hello@example.com",
};

let pool: Pool;
let repository: OutboxRepository;

beforeAll(async () => {
  pool = createTestPool();
  await resetContactSchema(pool);
  await migrate(pool);
  repository = new OutboxRepository(pool, encryptionKey);
});

beforeEach(async () => {
  await resetContactTables(pool);
});

afterAll(async () => {
  await pool?.end();
});

describe("database reset safety", () => {
  // Catches a test-safety break that lets per-test TRUNCATE bypass the connected database identity check.
  it("rejects the loopback maintenance database before truncating", async () => {
    const maintenanceUrl = new URL(requireTestDatabaseUrl());
    maintenanceUrl.pathname = "/postgres";
    const maintenancePool = new Pool({
      connectionString: maintenanceUrl.toString(),
      options: "-c default_transaction_read_only=on",
    });

    try {
      await expect(resetContactTables(maintenancePool)).rejects.toThrow(
        "database reset requires vbtech_test@vbtech_contact_test",
      );
    } finally {
      await maintenancePool.end();
    }
  });
});

describe("transactional contact acceptance", () => {
  // Catches a production break that omits the mandatory operator notification or duplicates an accepted request.
  it("creates one notification and resolves an identical retry as existing", async () => {
    await expect(repository.accept(telegramRequest)).resolves.toBe("created");
    await expect(
      repository.accept({
        ...telegramRequest,
        name: "  Vlad  ",
        captchaToken: "a-new-captcha-token",
        website: "a-honeypot-value-that-is-not-durable",
      }),
    ).resolves.toBe("existing");

    const requests = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM contact_requests",
    );
    const jobs = await pool.query<{ kind: string }>(
      "SELECT kind FROM email_outbox ORDER BY kind",
    );
    expect(requests.rows[0]?.count).toBe("1");
    expect(jobs.rows).toEqual([{ kind: "notification" }]);
  });

  // Catches a production break that treats a reused UUID with different durable content as a safe retry.
  it("rejects request ID reuse when the durable request differs", async () => {
    await expect(repository.accept(telegramRequest)).resolves.toBe("created");

    await expect(
      repository.accept({ ...telegramRequest, message: "Different durable content" }),
    ).rejects.toThrow("request_id_reused");

    const rows = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM email_outbox",
    );
    expect(rows.rows[0]?.count).toBe("1");
  });

  // Catches a production break that races concurrent retries into duplicate request or delivery rows.
  it("serializes concurrent duplicate acceptance by public request ID", async () => {
    const results = await Promise.all([
      repository.accept(emailRequest),
      repository.accept({ ...emailRequest, captchaToken: "second-proof" }),
    ]);

    expect(results.sort()).toEqual(["created", "existing"]);
    const requests = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM contact_requests",
    );
    const jobs = await pool.query<{ kind: string }>(
      "SELECT kind FROM email_outbox ORDER BY kind",
    );
    expect(requests.rows[0]?.count).toBe("1");
    expect(jobs.rows).toEqual([{ kind: "confirmation" }, { kind: "notification" }]);
  });

  // Catches a production break that gives equivalent uppercase/lowercase UUIDs different advisory locks.
  it("serializes concurrent retries across equivalent UUID spellings", async () => {
    const uppercase = {
      ...telegramRequest,
      requestId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
    };
    const lowercase = {
      ...uppercase,
      requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      captchaToken: "second-proof",
    };

    const results = await Promise.all([
      repository.accept(uppercase),
      repository.accept(lowercase),
    ]);

    expect(results.sort()).toEqual(["created", "existing"]);
    const rows = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM contact_requests",
    );
    expect(rows.rows[0]?.count).toBe("1");
  });

  // Catches a production break that encrypts AAD with uppercase input while leases return canonical UUID text.
  it("decrypts an uppercase-ID request with its leased canonical context", async () => {
    await repository.accept({
      ...telegramRequest,
      requestId: "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB",
    });
    const [leased] = await repository.leaseDue(1, "worker-a");

    expect(leased?.publicRequestId).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(
      decryptPayload(leased!.encryptedPayload, encryptionKey, {
        requestId: leased!.publicRequestId,
        kind: leased!.kind,
      }),
    ).toEqual({
      locale: "en",
      name: "Vlad",
      contact: "@thevladbog",
      message: "A concrete product problem",
      sourcePath: "/en/",
      consentId: "VBT-PD-02/DRAFT",
    });
  });

  // Catches a production break that enqueues a request for an obsolete or client-selected consent revision.
  it("rejects a consent revision mismatch without storing rows", async () => {
    await expect(
      repository.accept({ ...telegramRequest, consentId: "VBT-PD-01" }),
    ).rejects.toThrow("consent_revision_changed");

    const requests = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM contact_requests",
    );
    const jobs = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM email_outbox",
    );
    expect(requests.rows[0]?.count).toBe("0");
    expect(jobs.rows[0]?.count).toBe("0");
  });

  // Catches a production break that queues a confirmation for Telegram or omits it for a valid email.
  it("queues confirmation only for a valid lower-case email contact", async () => {
    await expect(repository.accept(telegramRequest)).resolves.toBe("created");
    await expect(repository.accept(emailRequest)).resolves.toBe("created");

    const jobs = await pool.query<{ public_request_id: string; kind: string }>(
      "SELECT public_request_id::text, kind FROM email_outbox ORDER BY public_request_id, kind",
    );
    expect(jobs.rows).toEqual([
      {
        public_request_id: "11111111-1111-4111-8111-111111111111",
        kind: "notification",
      },
      {
        public_request_id: "22222222-2222-4222-8222-222222222222",
        kind: "confirmation",
      },
      {
        public_request_id: "22222222-2222-4222-8222-222222222222",
        kind: "notification",
      },
    ]);
  });

  // Catches a production break that leaves an orphan request when enqueueing fails inside acceptance.
  it("rolls back the request row when outbox insertion fails", async () => {
    await pool.query(`
      CREATE OR REPLACE FUNCTION contact_test_reject_outbox()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'contact_test_forced_failure';
      END;
      $$;
      CREATE TRIGGER contact_test_reject_outbox
      BEFORE INSERT ON email_outbox
      FOR EACH ROW EXECUTE FUNCTION contact_test_reject_outbox();
    `);

    try {
      await expect(repository.accept(telegramRequest)).rejects.toThrow();
    } finally {
      await pool.query("DROP TRIGGER contact_test_reject_outbox ON email_outbox");
      await pool.query("DROP FUNCTION contact_test_reject_outbox() ");
    }

    const requests = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM contact_requests",
    );
    expect(requests.rows[0]?.count).toBe("0");
  });

  // Catches a production break that stores user, captcha, honeypot, or network content outside the encrypted envelope.
  it("stores durable visitor content only inside authenticated ciphertext", async () => {
    await repository.accept(emailRequest);

    const requestRows = await pool.query<Record<string, unknown>>(
      "SELECT * FROM contact_requests",
    );
    const jobRows = await pool.query<{
      public_request_id: string;
      kind: "notification" | "confirmation";
      payload_ciphertext: Buffer;
      payload_iv: Buffer;
      payload_auth_tag: Buffer;
    }>(
      `SELECT public_request_id::text, kind, payload_ciphertext, payload_iv, payload_auth_tag
       FROM email_outbox ORDER BY kind`,
    );

    expect(Object.keys(requestRows.rows[0] ?? {}).sort()).toEqual([
      "content_hash",
      "created_at",
      "public_request_id",
    ]);
    expect(jobRows.rows).toHaveLength(2);
    for (const row of jobRows.rows) {
      const decrypted = decryptPayload(
        {
          ciphertext: row.payload_ciphertext,
          iv: row.payload_iv,
          authTag: row.payload_auth_tag,
        },
        encryptionKey,
        { requestId: row.public_request_id, kind: row.kind },
      );
      expect(decrypted).toEqual({
        locale: "en",
        name: "Vlad",
        contact: "hello@example.com",
        message: "A concrete product problem",
        sourcePath: "/en/",
        consentId: "VBT-PD-02/DRAFT",
      });
    }

    const storedText = JSON.stringify([...requestRows.rows, ...jobRows.rows]);
    expect(storedText).not.toContain("opaque-token-one");
    expect(storedText).not.toContain("a-honeypot-value");
  });
});

describe("outbox leasing and terminal ownership", () => {
  beforeEach(async () => {
    await repository.accept(emailRequest);
  });

  // Catches a production break that leases one due job to multiple workers under concurrency.
  it("leases due jobs once with explicit ownership", async () => {
    const [first, second] = await Promise.all([
      repository.leaseDue(1, "worker-a"),
      repository.leaseDue(1, "worker-b"),
    ]);
    const leased = [...first, ...second];

    expect(leased).toHaveLength(2);
    expect(new Set(leased.map((job) => job.id)).size).toBe(2);
    expect(new Set(leased.map((job) => job.leaseOwner))).toEqual(
      new Set(["worker-a", "worker-b"]),
    );
    expect(leased.map((job) => job.attemptCount).sort()).toEqual([1, 1]);
  });

  // Catches a production break that allows unbounded batches or nonsensical lease limits.
  it.each([0, -1, 1.5, 101])("rejects lease limit %s", async (limit) => {
    await expect(repository.leaseDue(limit, "worker-a")).rejects.toThrow(
      "invalid_lease_limit",
    );
  });

  // Catches a production break that makes an active lease visible before its expiry.
  it("leases a job to another worker only after lease expiry", async () => {
    const [leased] = await repository.leaseDue(1, "worker-a");

    await expect(repository.leaseDue(1, "worker-b")).resolves.toHaveLength(1);
    await pool.query(
      "UPDATE email_outbox SET lease_expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
      [leased?.id],
    );
    const recovered = await repository.leaseDue(1, "worker-b");

    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.id).toBe(leased?.id);
    expect(recovered[0]?.leaseOwner).toBe("worker-b");
    expect(recovered[0]?.attemptCount).toBe(2);
  });

  // Catches a production break that lets a worker finalize a job after losing its lease.
  it("rejects terminal updates from a lost lease owner", async () => {
    const [leased] = await repository.leaseDue(1, "worker-a");
    await pool.query(
      "UPDATE email_outbox SET lease_expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
      [leased?.id],
    );
    const [recovered] = await repository.leaseDue(1, "worker-b");

    await expect(
      repository.markDelivered(recovered!.id, "worker-a", recovered!.attemptCount, "stale-message"),
    ).resolves.toBe("lease_lost");
    await expect(
      repository.markDelivered(recovered!.id, "worker-b", recovered!.attemptCount, "provider-message"),
    ).resolves.toBe("updated");
    const row = await pool.query<{ delivered: boolean }>(
      "SELECT delivered_at IS NOT NULL AS delivered FROM email_outbox WHERE id = $1",
      [recovered!.id],
    );
    expect(row.rows[0]?.delivered).toBe(true);
  });

  // Catches a production break that lets a stale same-owner attempt complete a newer lease generation.
  it("fences stale same-owner delivery after expiry and re-lease", async () => {
    await resetContactTables(pool);
    await repository.accept(telegramRequest);
    const [stale] = await repository.leaseDue(1, "worker-a");
    await pool.query(
      "UPDATE email_outbox SET lease_expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
      [stale?.id],
    );
    const [current] = await repository.leaseDue(1, "worker-a");

    await expect(
      repository.markDelivered(stale!.id, "worker-a", stale!.attemptCount, "stale-message"),
    ).resolves.toBe("lease_lost");
    await expect(
      repository.markDelivered(current!.id, "worker-a", current!.attemptCount, "provider-message"),
    ).resolves.toBe("updated");
  });

  // Catches a production break that lets a stale same-owner attempt reschedule a newer lease generation.
  it("fences stale same-owner reschedule after expiry and re-lease", async () => {
    await resetContactTables(pool);
    await repository.accept(telegramRequest);
    const [stale] = await repository.leaseDue(1, "worker-a");
    await pool.query(
      "UPDATE email_outbox SET lease_expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
      [stale?.id],
    );
    const [current] = await repository.leaseDue(1, "worker-a");
    const nextAttemptAt = new Date(Date.now() + 60_000);

    await expect(
      repository.reschedule(
        stale!.id,
        "worker-a",
        stale!.attemptCount,
        nextAttemptAt,
      ),
    ).resolves.toBe("lease_lost");
    await expect(
      repository.reschedule(
        current!.id,
        "worker-a",
        current!.attemptCount,
        nextAttemptAt,
      ),
    ).resolves.toBe("updated");
  });

  // Catches a production break that makes retryable jobs immediately due or leaves their old lease attached.
  it("reschedules a leased job for an explicit future attempt", async () => {
    const [leased] = await repository.leaseDue(1, "worker-a");
    const nextAttemptAt = new Date(Date.now() + 60_000);

    await expect(
      repository.reschedule(
        leased!.id,
        "worker-a",
        leased!.attemptCount,
        nextAttemptAt,
      ),
    ).resolves.toBe("updated");
    const row = await pool.query<{
      next_attempt_at: Date;
      lease_owner: string | null;
      lease_expires_at: Date | null;
    }>(
      "SELECT next_attempt_at, lease_owner, lease_expires_at FROM email_outbox WHERE id = $1",
      [leased!.id],
    );
    expect(row.rows[0]?.next_attempt_at.toISOString()).toBe(nextAttemptAt.toISOString());
    expect(row.rows[0]?.lease_owner).toBeNull();
    expect(row.rows[0]?.lease_expires_at).toBeNull();
  });

  // Catches a production break that returns permanently failed jobs to the due queue.
  it("marks a leased job permanently failed only for its owner", async () => {
    const [leased] = await repository.leaseDue(1, "worker-a");

    await expect(
      repository.markFailed(leased!.id, "worker-b", leased!.attemptCount),
    ).resolves.toBe("lease_lost");
    await expect(
      repository.markFailed(leased!.id, "worker-a", leased!.attemptCount),
    ).resolves.toBe("updated");
    const row = await pool.query<{ failed: boolean }>(
      "SELECT failed_at IS NOT NULL AS failed FROM email_outbox WHERE id = $1",
      [leased!.id],
    );
    expect(row.rows[0]?.failed).toBe(true);
  });
});

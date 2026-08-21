import { Buffer } from "node:buffer";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ContactRequest } from "@vbtech/contracts";
import { Pool } from "pg";
import { OutboxRepository } from "../src/outbox-repository.js";
import { PostgresOutboxRetention, runContactRetention } from "../src/retention.js";
import {
  createTestPool,
  migrate,
  resetContactSchema,
  resetContactTables,
} from "./db-test-helper.js";

const encryptionKey = Buffer.from(
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  "hex",
);
const request: ContactRequest = {
  requestId: "11111111-1111-4111-8111-111111111111",
  locale: "en",
  name: "Vlad",
  contact: "@thevladbog",
  message: "A concrete product problem",
  sourcePath: "/en/",
  consentId: "VBT-PD-02/DRAFT",
  captchaToken: "opaque-token",
  website: "",
};

let pool: Pool;
let repository: OutboxRepository;
let retention: PostgresOutboxRetention;

beforeAll(async () => {
  pool = createTestPool();
  await resetContactSchema(pool);
  await migrate(pool);
  repository = new OutboxRepository(pool, encryptionKey);
  retention = new PostgresOutboxRetention(pool);
});

beforeEach(async () => {
  await resetContactTables(pool);
});

afterAll(async () => {
  await pool?.end();
});

describe("terminal payload lifecycle", () => {
  // Catches a privacy break that leaves visitor ciphertext after successful provider delivery.
  it("stores only the bounded provider MessageId and atomically erases payload on delivery", async () => {
    await repository.accept(request);
    const [leased] = await repository.leaseDue(1, "worker-a");

    await expect(repository.markDelivered(
      leased!.id,
      "worker-a",
      leased!.attemptCount,
      "provider-message-123",
    )).resolves.toBe("updated");

    const result = await pool.query<{
      delivered_at: Date | null;
      provider_message_id: string | null;
      payload_ciphertext: Buffer | null;
      payload_iv: Buffer | null;
      payload_auth_tag: Buffer | null;
    }>(
      `SELECT delivered_at, provider_message_id, payload_ciphertext, payload_iv, payload_auth_tag
       FROM email_outbox WHERE id = $1`,
      [leased!.id],
    );
    expect(result.rows[0]).toMatchObject({
      provider_message_id: "provider-message-123",
      payload_ciphertext: null,
      payload_iv: null,
      payload_auth_tag: null,
    });
    expect(result.rows[0]?.delivered_at).toBeInstanceOf(Date);
  });

  // Catches a privacy break that leaves visitor ciphertext after terminal failure.
  it("atomically erases payload on terminal failure", async () => {
    await repository.accept(request);
    const [leased] = await repository.leaseDue(1, "worker-a");

    await expect(repository.markFailed(
      leased!.id,
      "worker-a",
      leased!.attemptCount,
    )).resolves.toBe("updated");

    const result = await pool.query<{
      failed_at: Date | null;
      provider_message_id: string | null;
      payload_ciphertext: Buffer | null;
      payload_iv: Buffer | null;
      payload_auth_tag: Buffer | null;
    }>(
      `SELECT failed_at, provider_message_id, payload_ciphertext, payload_iv, payload_auth_tag
       FROM email_outbox WHERE id = $1`,
      [leased!.id],
    );
    expect(result.rows[0]).toMatchObject({
      provider_message_id: null,
      payload_ciphertext: null,
      payload_iv: null,
      payload_auth_tag: null,
    });
    expect(result.rows[0]?.failed_at).toBeInstanceOf(Date);
  });

  // Catches incomplete lifecycle repair that misses legacy terminal ciphertext or erases pending work.
  it("repairs only terminal payloads older than 24 hours in a bounded pass", async () => {
    await repository.accept({ ...request, contact: "visitor@example.com" });
    const jobs = await pool.query<{ id: string; kind: string }>(
      "SELECT id::text, kind FROM email_outbox ORDER BY kind",
    );
    const terminalId = jobs.rows.find(({ kind }) => kind === "notification")!.id;
    const pendingId = jobs.rows.find(({ kind }) => kind === "confirmation")!.id;
    await pool.query(
      `UPDATE email_outbox
       SET delivered_at = $2
       WHERE id = $1`,
      [terminalId, new Date("2026-08-18T12:00:00.000Z")],
    );

    await expect(retention.eraseTerminalPayloads(
      new Date("2026-08-19T14:00:00.000Z"),
    )).resolves.toBe(1);

    const payloads = await pool.query<{ id: string; payload_ciphertext: Buffer | null }>(
      "SELECT id::text, payload_ciphertext FROM email_outbox WHERE id = ANY($1::uuid[]) ORDER BY id",
      [[terminalId, pendingId]],
    );
    expect(payloads.rows.find(({ id }) => id === terminalId)?.payload_ciphertext).toBeNull();
    expect(payloads.rows.find(({ id }) => id === pendingId)?.payload_ciphertext).toBeInstanceOf(Buffer);
  });
});

describe("bounded terminal metadata cleanup", () => {
  // Catches an unbounded cleanup query and orphan request-hash accumulation.
  it("deletes at most 100 old terminal rows and their orphan request hashes per pass", async () => {
    await pool.query(`
      INSERT INTO contact_requests (public_request_id, content_hash, created_at)
      SELECT gen_random_uuid(), decode(repeat('01', 32), 'hex'), '2026-07-01T00:00:00Z'
      FROM generate_series(1, 101);

      INSERT INTO email_outbox (
        public_request_id, kind, payload_ciphertext, payload_iv, payload_auth_tag,
        delivered_at, created_at
      )
      SELECT public_request_id, 'notification', NULL, NULL, NULL,
             '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z'
      FROM contact_requests;
    `);

    await expect(runContactRetention({
      repository: retention,
      referenceTime: new Date("2026-08-20T14:00:00.000Z"),
    })).resolves.toEqual({ payloadsErased: 0, outboxDeleted: 100, requestsDeleted: 100 });

    const jobs = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM email_outbox");
    const requests = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM contact_requests");
    expect(jobs.rows[0]?.count).toBe("1");
    expect(requests.rows[0]?.count).toBe("1");
  });

  // Catches a cutoff bug that removes recent terminal metadata.
  it("keeps terminal metadata newer than 30 days", async () => {
    await repository.accept(request);
    const [leased] = await repository.leaseDue(1, "worker-a");
    await repository.markDelivered(
      leased!.id,
      "worker-a",
      leased!.attemptCount,
      "provider-message-123",
    );

    const summary = await runContactRetention({
      repository: retention,
      referenceTime: new Date(),
    });

    expect(summary.outboxDeleted).toBe(0);
    const rows = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM email_outbox");
    expect(rows.rows[0]?.count).toBe("1");
  });
});

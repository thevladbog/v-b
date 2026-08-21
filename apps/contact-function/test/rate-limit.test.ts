import { Buffer } from "node:buffer";
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { PostgresRateLimitRepository, RateLimiter } from "../src/rate-limit.js";
import { createTestPool, migrate, resetContactSchema, resetContactTables } from "./db-test-helper.js";

const hmacKey = Buffer.from(
  "f0e0d0c0b0a09080706050403020100000102030405060708090a0b0c0d0e0f0",
  "hex",
);

let pool: Pool;
let limiter: RateLimiter;

beforeAll(async () => {
  pool = createTestPool();
  await resetContactSchema(pool);
  await migrate(pool);
  limiter = new RateLimiter(new PostgresRateLimitRepository(pool), hmacKey);
});

beforeEach(async () => resetContactTables(pool));
afterAll(async () => pool?.end());

describe("PostgreSQL fixed-window contact rate limit", () => {
  it("allows exactly five attempts and rejects the sixth", async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expect(limiter.assertAllowed("192.0.2.1")).resolves.toBeUndefined();
    }
    await expect(limiter.assertAllowed("192.0.2.1")).rejects.toMatchObject({
      code: "rate_limited",
      status: 429,
    });
  });

  it("atomically permits only five of twenty concurrent attempts", async () => {
    const outcomes = await Promise.allSettled(
      Array.from({ length: 20 }, () => limiter.assertAllowed("2001:db8::1")),
    );

    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(5);
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(15);
    const stored = await pool.query<{ request_count: number; bytes: number; seconds: string }>(
      `SELECT request_count,
              octet_length(network_source_hmac) AS bytes,
              extract(epoch FROM (window_expires_at - window_start))::text AS seconds
       FROM contact_rate_limits`,
    );
    expect(stored.rows).toEqual([{ request_count: 20, bytes: 32, seconds: "600.000000" }]);
  });

  it("stores neither the raw source nor its readable encoding", async () => {
    await limiter.assertAllowed("192.0.2.123");
    const stored = await pool.query<{ hex: string }>(
      "SELECT encode(network_source_hmac, 'hex') AS hex FROM contact_rate_limits",
    );

    expect(stored.rows[0]?.hex).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.rows[0]?.hex).not.toContain(Buffer.from("192.0.2.123").toString("hex"));
  });

  it("removes at most 100 oldest globally expired rows while preserving other live sources", async () => {
    const sourceA = createHmac("sha256", hmacKey).update("192.0.2.10").digest();
    const liveSource = createHmac("sha256", hmacKey).update("192.0.2.20").digest();
    await pool.query(
      `INSERT INTO contact_rate_limits (
         network_source_hmac, window_start, window_expires_at, request_count
       ) VALUES
         ($1, clock_timestamp() - interval '3 hours', clock_timestamp() - interval '2 hours', 1),
         ($2, clock_timestamp(), clock_timestamp() + interval '1 hour', 1)`,
      [sourceA, liveSource],
    );
    await pool.query(
      `INSERT INTO contact_rate_limits (
         network_source_hmac, window_start, window_expires_at, request_count
       )
       SELECT decode(md5(value::text) || md5('expired-' || value::text), 'hex'),
              clock_timestamp() - interval '2 hours',
              clock_timestamp() - interval '1 hour',
              1
       FROM generate_series(1, 100) AS value`,
    );

    await limiter.assertAllowed("192.0.2.30");

    const state = await pool.query<{
      expired_count: string;
      source_a_count: string;
      live_source_count: string;
      total_count: string;
    }>(
      `SELECT
         count(*) FILTER (WHERE window_expires_at <= clock_timestamp())::text AS expired_count,
         count(*) FILTER (WHERE network_source_hmac = $1)::text AS source_a_count,
         count(*) FILTER (WHERE network_source_hmac = $2)::text AS live_source_count,
         count(*)::text AS total_count
       FROM contact_rate_limits`,
      [sourceA, liveSource],
    );
    expect(state.rows).toEqual([{
      expired_count: "1",
      source_a_count: "0",
      live_source_count: "1",
      total_count: "3",
    }]);
  });
});

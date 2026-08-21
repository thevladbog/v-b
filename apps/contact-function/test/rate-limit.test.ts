import { Buffer } from "node:buffer";
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
});

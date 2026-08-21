import { Buffer } from "node:buffer";
import { createHmac } from "node:crypto";
import type { ContactDatabasePool } from "./db.js";
import { isPublicContactError, publicError } from "./errors.js";

export interface RateLimitRepository {
  increment(networkSourceHmac: Buffer): Promise<number>;
}

interface CountRow {
  request_count: number;
}

export class PostgresRateLimitRepository implements RateLimitRepository {
  constructor(private readonly pool: ContactDatabasePool) {}

  async increment(networkSourceHmac: Buffer): Promise<number> {
    if (!Buffer.isBuffer(networkSourceHmac) || networkSourceHmac.length !== 32) {
      throw new Error("invalid_network_source_hmac");
    }
    const client = await this.pool.connect();
    try {
      const result = await client.query<CountRow>(
        `WITH instant AS (
           SELECT clock_timestamp() AS now
         ), current_window AS (
           SELECT date_bin(
                    interval '10 minutes',
                    now,
                    timestamptz '1970-01-01 00:00:00+00'
                  ) AS window_start
           FROM instant
         ), expired AS (
           DELETE FROM contact_rate_limits
           WHERE network_source_hmac = $1
             AND window_expires_at <= (SELECT now FROM instant)
         )
         INSERT INTO contact_rate_limits (
           network_source_hmac,
           window_start,
           window_expires_at,
           request_count
         )
         SELECT $1, window_start, window_start + interval '10 minutes', 1
         FROM current_window
         ON CONFLICT (network_source_hmac, window_start)
         DO UPDATE SET request_count = contact_rate_limits.request_count + 1
         RETURNING request_count`,
        [networkSourceHmac],
      );
      const count = result.rows[0]?.request_count;
      if (!Number.isInteger(count) || count < 1) throw new Error("invalid_rate_limit_result");
      return count;
    } finally {
      client.release();
    }
  }
}

const MAX_SOURCE_BYTES = 64;
const MAX_ATTEMPTS = 5;

export class RateLimiter {
  constructor(
    private readonly repository: RateLimitRepository,
    private readonly hmacKey: Buffer,
  ) {
    if (!Buffer.isBuffer(hmacKey) || hmacKey.length !== 32) {
      throw new Error("invalid_rate_limit_hmac_key");
    }
  }

  async assertAllowed(source: string): Promise<void> {
    if (
      typeof source !== "string" ||
      Buffer.byteLength(source, "utf8") < 1 ||
      Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES ||
      /\p{Cc}/u.test(source)
    ) {
      throw publicError("temporarily_unavailable", 503);
    }

    try {
      const digest = createHmac("sha256", this.hmacKey).update(source, "utf8").digest();
      const count = await this.repository.increment(digest);
      if (count > MAX_ATTEMPTS) throw publicError("rate_limited", 429);
    } catch (error) {
      if (isPublicContactError(error)) throw error;
      throw publicError("temporarily_unavailable", 503);
    }
  }
}

import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { RateLimiter } from "../src/rate-limit.js";

const hmacKey = Buffer.alloc(32, 7);

describe("rate limiter failure boundary", () => {
  it("fails closed without exposing storage errors", async () => {
    const limiter = new RateLimiter(
      { increment: async () => { throw new Error("database connection detail"); } },
      hmacKey,
    );

    await expect(limiter.assertAllowed("192.0.2.1")).rejects.toMatchObject({
      code: "temporarily_unavailable",
      status: 503,
      message: "temporarily_unavailable",
    });
  });

  it("passes only a 32-byte irreversible source key to storage", async () => {
    let stored: Buffer | undefined;
    const limiter = new RateLimiter(
      { increment: async (digest) => { stored = digest; return 1; } },
      hmacKey,
    );

    await limiter.assertAllowed("192.0.2.1");

    expect(stored).toHaveLength(32);
    expect(stored?.equals(Buffer.from("192.0.2.1", "utf8"))).toBe(false);
  });
});

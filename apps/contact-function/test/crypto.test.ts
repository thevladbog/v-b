import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { decryptPayload, encryptPayload } from "../src/crypto.js";

const key = Buffer.from(
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  "hex",
);
const otherKey = Buffer.from(
  "101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f",
  "hex",
);
const context = {
  requestId: "11111111-1111-4111-8111-111111111111",
  kind: "notification",
} as const;
const payload = {
  locale: "en",
  name: "Vlad",
  contact: "hello@example.com",
  message: "A concrete product problem",
  sourcePath: "/en/",
  consentId: "VBT-PD-02/DRAFT",
} as const;

describe("AES-256-GCM payload envelope", () => {
  // Catches a production break that cannot recover the durable request from its encrypted envelope.
  it("round-trips a payload with a 32-byte key and authenticated context", () => {
    const encrypted = encryptPayload(payload, key, context);

    expect(decryptPayload(encrypted, key, context)).toEqual({
      locale: "en",
      name: "Vlad",
      contact: "hello@example.com",
      message: "A concrete product problem",
      sourcePath: "/en/",
      consentId: "VBT-PD-02/DRAFT",
    });
    expect(encrypted.iv).toHaveLength(12);
    expect(encrypted.authTag).toHaveLength(16);
  });

  // Catches a production break that reuses a GCM nonce for two encryptions under one key.
  it("generates a fresh 12-byte IV for every envelope", () => {
    const first = encryptPayload(payload, key, context);
    const second = encryptPayload(payload, key, context);

    expect(first.iv.equals(second.iv)).toBe(false);
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
  });

  // Catches a production break that accepts an AES key with a size other than exactly 256 bits.
  it.each([31, 33])("rejects a %i-byte encryption key", (length) => {
    expect(() => encryptPayload(payload, Buffer.alloc(length), context)).toThrow(
      "invalid_encryption_key",
    );
  });

  // Catches a production break that permits an envelope to be replayed for another request or delivery kind.
  it.each([
    {
      requestId: "22222222-2222-4222-8222-222222222222",
      kind: "notification" as const,
    },
    {
      requestId: "11111111-1111-4111-8111-111111111111",
      kind: "confirmation" as const,
    },
  ])("rejects authenticated-context substitution", (wrongContext) => {
    const encrypted = encryptPayload(payload, key, context);

    expect(() => decryptPayload(encrypted, key, wrongContext)).toThrow(
      "invalid_encrypted_payload",
    );
  });

  // Catches a production break that returns plaintext after a ciphertext, tag, or key integrity failure.
  it.each(["ciphertext", "authTag", "key"] as const)(
    "fails closed when %s is altered",
    (altered) => {
      const encrypted = encryptPayload(payload, key, context);
      const tampered = {
        ciphertext: Buffer.from(encrypted.ciphertext),
        iv: Buffer.from(encrypted.iv),
        authTag: Buffer.from(encrypted.authTag),
      };
      const decryptionKey = altered === "key" ? otherKey : key;
      if (altered !== "key") {
        tampered[altered][0] ^= 1;
      }

      expect(() => decryptPayload(tampered, decryptionKey, context)).toThrow(
        "invalid_encrypted_payload",
      );
    },
  );

  // Catches a production break that passes malformed GCM metadata to the crypto primitive.
  it.each([
    ["IV", { iv: Buffer.alloc(11), authTag: Buffer.alloc(16) }],
    ["tag", { iv: Buffer.alloc(12), authTag: Buffer.alloc(15) }],
  ] as const)("rejects a malformed %s without exposing plaintext", (_label, malformed) => {
    const encrypted = encryptPayload(payload, key, context);

    expect(() =>
      decryptPayload(
        {
          ciphertext: encrypted.ciphertext,
          iv: malformed.iv,
          authTag: malformed.authTag,
        },
        key,
        context,
      ),
    ).toThrow("invalid_encrypted_payload");
  });

  // Catches a production break that leaks visitor content through an integrity failure message.
  it("does not expose user content in decryption errors", () => {
    const encrypted = encryptPayload(payload, key, context);
    encrypted.authTag[0] ^= 1;

    try {
      decryptPayload(encrypted, key, context);
      throw new Error("expected decryption to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("invalid_encrypted_payload");
      expect((error as Error).message).not.toContain("product problem");
      expect((error as Error).message).not.toContain("hello@example.com");
    }
  });
});

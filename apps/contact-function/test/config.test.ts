import { describe, expect, it } from "vitest";
import {
  isContactSubmissionEnabled,
  loadContactProductionConfig,
} from "../src/config.js";

const validEnvironment = (): NodeJS.ProcessEnv => ({
  CONTACT_SUBMISSION_ENABLED: "true",
  CONTACT_DATABASE_URL: "postgresql://contact.invalid/contact",
  CONTACT_OUTBOX_ENCRYPTION_KEY:
    "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  CONTACT_RATE_LIMIT_HMAC_KEY:
    "f0e0d0c0b0a09080706050403020100000102030405060708090a0b0c0d0e0f0",
  SMARTCAPTCHA_SECRET: "server-secret",
});

describe("contact production configuration", () => {
  it("defaults submission and secret loading to fail closed", () => {
    expect(isContactSubmissionEnabled({})).toBe(false);
    expect(() => loadContactProductionConfig({})).toThrow(
      "invalid_contact_outbox_encryption_key",
    );
  });

  it("loads exact 32-byte distinct keys without accepting a captcha timeout override", () => {
    const environment = validEnvironment();
    environment.SMARTCAPTCHA_TIMEOUT_MS = "100";
    const config = loadContactProductionConfig(environment);

    expect(config.outboxEncryptionKey).toHaveLength(32);
    expect(config.rateLimitHmacKey).toHaveLength(32);
    expect(config.outboxEncryptionKey.equals(config.rateLimitHmacKey)).toBe(false);
    expect(config).not.toHaveProperty("captchaTimeoutMs");
  });

  it("rejects key reuse", () => {
    const environment = validEnvironment();
    environment.CONTACT_RATE_LIMIT_HMAC_KEY = environment.CONTACT_OUTBOX_ENCRYPTION_KEY;
    expect(() => loadContactProductionConfig(environment)).toThrow(
      "contact_keys_must_be_distinct",
    );
  });
});

import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";

export interface ContactProductionConfig {
  databaseUrl: string;
  outboxEncryptionKey: Buffer;
  rateLimitHmacKey: Buffer;
  captchaSecret: string;
  captchaTimeoutMs: number;
}

const KEY_PATTERN = /^[0-9a-f]{64}$/i;
const DEFAULT_CAPTCHA_TIMEOUT_MS = 1_000;
const MIN_CAPTCHA_TIMEOUT_MS = 100;
const MAX_CAPTCHA_TIMEOUT_MS = 5_000;

const required = (environment: NodeJS.ProcessEnv, name: string): string => {
  const value = environment[name];
  if (!value || value.length > 8_192 || /\p{Cc}/u.test(value)) {
    throw new Error(`invalid_${name.toLowerCase()}`);
  }
  return value;
};

const key = (environment: NodeJS.ProcessEnv, name: string): Buffer => {
  const value = required(environment, name);
  if (!KEY_PATTERN.test(value)) throw new Error(`invalid_${name.toLowerCase()}`);
  return Buffer.from(value, "hex");
};

const timeout = (environment: NodeJS.ProcessEnv): number => {
  const raw = environment.SMARTCAPTCHA_TIMEOUT_MS;
  if (raw === undefined) return DEFAULT_CAPTCHA_TIMEOUT_MS;
  if (!/^\d+$/.test(raw)) throw new Error("invalid_smartcaptcha_timeout_ms");
  const value = Number(raw);
  if (value < MIN_CAPTCHA_TIMEOUT_MS || value > MAX_CAPTCHA_TIMEOUT_MS) {
    throw new Error("invalid_smartcaptcha_timeout_ms");
  }
  return value;
};

export const isContactSubmissionEnabled = (
  environment: NodeJS.ProcessEnv = process.env,
): boolean => environment.CONTACT_SUBMISSION_ENABLED === "true";

export const loadContactProductionConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): ContactProductionConfig => {
  const outboxEncryptionKey = key(environment, "CONTACT_OUTBOX_ENCRYPTION_KEY");
  const rateLimitHmacKey = key(environment, "CONTACT_RATE_LIMIT_HMAC_KEY");
  if (timingSafeEqual(outboxEncryptionKey, rateLimitHmacKey)) {
    throw new Error("contact_keys_must_be_distinct");
  }

  return {
    databaseUrl: required(environment, "CONTACT_DATABASE_URL"),
    outboxEncryptionKey,
    rateLimitHmacKey,
    captchaSecret: required(environment, "SMARTCAPTCHA_SECRET"),
    captchaTimeoutMs: timeout(environment),
  };
};

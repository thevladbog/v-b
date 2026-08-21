import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";

export interface ContactProductionConfig {
  databaseUrl: string;
  outboxEncryptionKey: Buffer;
  rateLimitHmacKey: Buffer;
  captchaSecret: string;
}

export interface ContactWorkerConfig {
  databaseUrl: string;
  outboxEncryptionKey: Buffer;
}

const KEY_PATTERN = /^[0-9a-f]{64}$/i;

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
  };
};

export const loadContactWorkerConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): ContactWorkerConfig => ({
  databaseUrl: required(environment, "CONTACT_DATABASE_URL"),
  outboxEncryptionKey: key(environment, "CONTACT_OUTBOX_ENCRYPTION_KEY"),
});

import { Buffer } from "node:buffer";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

export type DeliveryKind = "notification" | "confirmation";

export interface EncryptionContext {
  requestId: string;
  kind: DeliveryKind;
}

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

const assertKey = (key: Buffer): void => {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
    throw new Error("invalid_encryption_key");
  }
};

const authenticatedContext = (context: EncryptionContext): Buffer =>
  Buffer.from(
    JSON.stringify({
      purpose: "vbtech-contact-outbox",
      version: 1,
      requestId: context.requestId,
      kind: context.kind,
    }),
    "utf8",
  );

export const encryptPayload = (
  payload: unknown,
  key: Buffer,
  context: EncryptionContext,
): EncryptedPayload => {
  assertKey(key);

  try {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    cipher.setAAD(authenticatedContext(context));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final(),
    ]);

    return {
      ciphertext,
      iv,
      authTag: cipher.getAuthTag(),
    };
  } catch {
    throw new Error("invalid_encrypted_payload");
  }
};

export const decryptPayload = <T = unknown>(
  encrypted: EncryptedPayload,
  key: Buffer,
  context: EncryptionContext,
): T => {
  assertKey(key);

  if (
    !Buffer.isBuffer(encrypted.ciphertext) ||
    !Buffer.isBuffer(encrypted.iv) ||
    !Buffer.isBuffer(encrypted.authTag) ||
    encrypted.iv.length !== IV_BYTES ||
    encrypted.authTag.length !== AUTH_TAG_BYTES
  ) {
    throw new Error("invalid_encrypted_payload");
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, encrypted.iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAAD(authenticatedContext(context));
    decipher.setAuthTag(encrypted.authTag);
    const plaintext = Buffer.concat([
      decipher.update(encrypted.ciphertext),
      decipher.final(),
    ]);

    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    throw new Error("invalid_encrypted_payload");
  }
};

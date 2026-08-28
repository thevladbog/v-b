// Формат: "VBDF1"(5) + salt(16) + iv(12) + AES-256-GCM ciphertext.
// PBKDF2-SHA256, 600k итераций. Работает в браузере и Node >= 20.

export const MAGIC = "VBDF1";
const ITERATIONS = 600_000;

const subtle = globalThis.crypto.subtle;

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptPayload(password: string, plaintext: Uint8Array): Promise<Uint8Array> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = new Uint8Array(
    await subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, plaintext as BufferSource),
  );
  const magic = new TextEncoder().encode(MAGIC);
  const out = new Uint8Array(magic.length + 16 + 12 + ct.length);
  out.set(magic, 0);
  out.set(salt, magic.length);
  out.set(iv, magic.length + 16);
  out.set(ct, magic.length + 28);
  return out;
}

export async function decryptPayload(password: string, blob: Uint8Array): Promise<Uint8Array> {
  const magic = new TextDecoder().decode(blob.slice(0, 5));
  if (magic !== MAGIC) throw new Error("bad-payload");
  const salt = blob.slice(5, 21);
  const iv = blob.slice(21, 33);
  const ct = blob.slice(33);
  const key = await deriveKey(password, salt);
  try {
    return new Uint8Array(
      await subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ct as BufferSource),
    );
  } catch {
    throw new Error("bad-password");
  }
}

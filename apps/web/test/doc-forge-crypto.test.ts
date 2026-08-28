import { describe, expect, it } from "vitest";
import { decryptPayload, encryptPayload } from "../src/tools/doc-forge/payload-crypto.js";

const bytes = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe("doc-forge payload crypto", () => {
  it("roundtrip: encrypt -> decrypt возвращает исходные байты", async () => {
    const blob = await encryptPayload("correct horse", bytes("секретный бандл"));
    expect(text(await decryptPayload("correct horse", blob))).toBe("секретный бандл");
  }, 30_000);

  it("блоб начинается с магии VBDF1 и не содержит открытого текста", async () => {
    const blob = await encryptPayload("pw", bytes("MARKER-PLAINTEXT"));
    expect(text(blob.slice(0, 5))).toBe("VBDF1");
    expect(text(blob)).not.toContain("MARKER-PLAINTEXT");
  }, 30_000);

  it("неверный пароль -> Error('bad-password')", async () => {
    const blob = await encryptPayload("right", bytes("data"));
    await expect(decryptPayload("wrong", blob)).rejects.toThrow("bad-password");
  }, 30_000);
});

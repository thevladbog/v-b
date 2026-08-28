import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decryptPayload } from "../src/tools/doc-forge/payload-crypto.js";

const OUT = "public/tools/doc-payload.bin";

describe("doc-forge payload build", () => {
  it("собирает шифроблоб, который расшифровывается паролем и содержит бандл", async () => {
    rmSync(OUT, { force: true });
    execFileSync("node", ["scripts/build-doc-forge.mjs"], {
      env: { ...process.env, VBTECH_DOC_TOOL_PASSWORD: "test-password-123" },
    });
    expect(existsSync(OUT)).toBe(true);
    const blob = new Uint8Array(readFileSync(OUT));
    const json = JSON.parse(new TextDecoder().decode(await decryptPayload("test-password-123", blob)));
    expect(json.js).toContain("vbDocForgeInit");
  }, 120_000);

  it("без пароля пропускает сборку и не падает", () => {
    const env = { ...process.env };
    delete env.VBTECH_DOC_TOOL_PASSWORD;
    const out = execFileSync("node", ["scripts/build-doc-forge.mjs"], { env }).toString();
    expect(out).toContain("skip");
  });
});

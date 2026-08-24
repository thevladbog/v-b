import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const assetPath = fileURLToPath(new URL("../public/assets/vb-wordmark-email.png", import.meta.url));

describe("email brand asset", () => {
  // Catches a stale print mark being substituted for the wordmark used by the live site.
  it("ships the live-site wordmark as a real public PNG", async () => {
    const asset = await readFile(assetPath);

    expect(asset.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(asset.readUInt32BE(16)).toBe(404);
    expect(asset.readUInt32BE(20)).toBe(80);
    expect(asset[25]).toBe(6);
    expect(asset.byteLength).toBeGreaterThan(1_000);
    expect(createHash("sha256").update(asset).digest("hex")).toBe(
      "ede0f83056476da4ead9bb8dfe1dcc09d8d22ac2c942b18d9164ef43380225ad",
    );
  });
});

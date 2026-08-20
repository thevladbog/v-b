import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("package manager contract", () => {
  it("runs this Turbo child through the pinned pnpm executable", async () => {
    const rootPackage = JSON.parse(
      await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as { packageManager?: string };

    expect(rootPackage.packageManager).toBe("pnpm@11.10.0");
    expect(process.env.npm_config_user_agent).toMatch(/^pnpm\/11\.10\.0 /);
    expect(process.env.npm_execpath).toMatch(
      /node_modules[\\/]pnpm[\\/]bin[\\/]pnpm\.mjs$/,
    );
  });
});

import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const contractScript = new URL(
  "../../../scripts/assert-pnpm-runtime.mjs",
  import.meta.url,
);
const workspacePnpmExecutable = new URL(
  "../../../node_modules/pnpm/bin/pnpm.mjs",
  import.meta.url,
).pathname;
const pinnedPnpmEnvironment = {
  npm_config_user_agent: "pnpm/11.10.0 npm/? node/v24.18.0 darwin arm64",
  npm_execpath: workspacePnpmExecutable,
};

async function runContract(overrides: NodeJS.ProcessEnv = {}) {
  return execFile(process.execPath, [contractScript.pathname], {
    env: {
      ...process.env,
      ...pinnedPnpmEnvironment,
      ...overrides,
    },
  });
}

async function expectContractFailure(overrides: NodeJS.ProcessEnv) {
  await expect(runContract(overrides)).rejects.toMatchObject({
    code: expect.any(Number),
  });
}

describe("package manager contract", () => {
  it("accepts the installed pinned pnpm executable", async () => {
    const rootPackage = JSON.parse(
      await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as { packageManager?: string };

    expect(rootPackage.packageManager).toBe("pnpm@11.10.0");
    await expect(runContract()).resolves.toMatchObject({ stdout: expect.any(String) });
  });

  it("rejects a spoofed pnpm version", async () => {
    await expectContractFailure({
      npm_config_user_agent: "pnpm/11.18.0 npm/? node/v24.18.0 darwin arm64",
    });
  });

  it("rejects a nonexistent executable with the expected-looking path", async () => {
    await expectContractFailure({
      npm_config_user_agent: "pnpm/11.10.0 npm/? node/v24.18.0 darwin arm64",
      npm_execpath: "/private/tmp/missing/node_modules/pnpm/bin/pnpm.mjs",
    });
  });

  it("rejects a different installed pnpm package even when its path exists", async () => {
    const fakeRoot = await mkdtemp(join(tmpdir(), "vbtech-pnpm-fake-"));
    const fakePackage = join(fakeRoot, "node_modules", "pnpm");
    const fakeExecutable = join(fakePackage, "bin", "pnpm.mjs");

    await mkdir(dirname(fakeExecutable), { recursive: true });
    await writeFile(
      join(fakePackage, "package.json"),
      JSON.stringify({ name: "pnpm", version: "11.18.0" }),
    );
    await writeFile(fakeExecutable, "process.exit(0);\n");

    try {
      await expectContractFailure({
        npm_config_user_agent: "pnpm/11.10.0 npm/? node/v24.18.0 darwin arm64",
        npm_execpath: fakeExecutable,
      });
    } finally {
      await rm(fakeRoot, { force: true, recursive: true });
    }
  });
});

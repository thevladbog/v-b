import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
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

async function runScript(
  scriptPath: string,
  overrides: NodeJS.ProcessEnv = {},
) {
  return execFile(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      ...pinnedPnpmEnvironment,
      ...overrides,
    },
  });
}

async function runContract(overrides: NodeJS.ProcessEnv = {}) {
  return runScript(contractScript.pathname, overrides);
}

async function expectContractFailure(overrides: NodeJS.ProcessEnv) {
  await expect(runContract(overrides)).rejects.toMatchObject({
    code: expect.any(Number),
  });
}

async function expectScriptFailure(scriptPath: string, overrides: NodeJS.ProcessEnv) {
  await expect(runScript(scriptPath, overrides)).rejects.toMatchObject({
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

  it("rejects an exact-version pnpm installation symlinked from outside the workspace", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "vbtech-pnpm-external-"));
    const workspaceRoot = join(fixtureRoot, "workspace");
    const externalPackage = join(fixtureRoot, "outside", "pnpm");
    const fixtureScript = join(workspaceRoot, "scripts", "assert-pnpm-runtime.mjs");
    const linkedPackage = join(workspaceRoot, "node_modules", "pnpm");
    const linkedExecutable = join(linkedPackage, "bin", "pnpm.mjs");

    await mkdir(dirname(fixtureScript), { recursive: true });
    await mkdir(dirname(linkedPackage), { recursive: true });
    await mkdir(join(externalPackage, "bin"), { recursive: true });
    await writeFile(
      join(workspaceRoot, "package.json"),
      JSON.stringify({ packageManager: "pnpm@11.10.0" }),
    );
    await writeFile(fixtureScript, await readFile(contractScript, "utf8"));
    await writeFile(
      join(externalPackage, "package.json"),
      JSON.stringify({ name: "pnpm", version: "11.10.0" }),
    );
    await writeFile(linkedExecutable.replace(linkedPackage, externalPackage), 'console.log("11.10.0");\n');
    await symlink(externalPackage, linkedPackage, "dir");

    try {
      await expectScriptFailure(fixtureScript, {
        npm_config_user_agent: "pnpm/11.10.0 npm/? node/v24.18.0 darwin arm64",
        npm_execpath: linkedExecutable,
      });
    } finally {
      await rm(fixtureRoot, { force: true, recursive: true });
    }
  });
});

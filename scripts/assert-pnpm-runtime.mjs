import { execFile as execFileCallback } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
function assertContainedInWorkspace(workspaceRoot, candidate, description) {
  const relationship = relative(workspaceRoot, candidate);
  const outsideWorkspace =
    relationship === ".." ||
    relationship.startsWith(`..${sep}`) ||
    isAbsolute(relationship);

  if (outsideWorkspace) {
    throw new Error(`${description} must resolve inside the workspace: ${candidate}`);
  }
}

const rootPackage = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const requiredPackageManager = "pnpm@11.10.0";
const requiredVersion = "11.10.0";
const workspaceRoot = await realpath(new URL("../", import.meta.url));
const packageDirectory = new URL("../node_modules/pnpm/", import.meta.url);
const resolvedPackageDirectory = await realpath(packageDirectory);
assertContainedInWorkspace(
  workspaceRoot,
  resolvedPackageDirectory,
  "workspace pnpm package",
);
const packageManifest = JSON.parse(
  await readFile(new URL("package.json", packageDirectory), "utf8"),
);
const expectedExecutable = await realpath(
  new URL("bin/pnpm.mjs", packageDirectory),
);
assertContainedInWorkspace(
  workspaceRoot,
  expectedExecutable,
  "workspace pnpm executable",
);
const userAgent = process.env.npm_config_user_agent ?? "";
const reportedExecutable = process.env.npm_execpath ?? "";

if (rootPackage.packageManager !== requiredPackageManager) {
  throw new Error(`root packageManager must be ${requiredPackageManager}`);
}

if (packageManifest.version !== requiredVersion) {
  throw new Error(
    `workspace pnpm package must be ${requiredVersion}; received ${packageManifest.version ?? "no version"}`,
  );
}

const { stdout } = await execFile(process.execPath, [expectedExecutable, "--version"]);
if (stdout.trim() !== requiredVersion) {
  throw new Error(
    `workspace pnpm executable must report ${requiredVersion}; received ${stdout.trim() || "no version"}`,
  );
}

if (!userAgent.startsWith(`pnpm/${requiredVersion} `)) {
  throw new Error(
    `Turbo child must use pnpm ${requiredVersion}; received ${userAgent || "no npm_config_user_agent"}`,
  );
}

if (!reportedExecutable) {
  throw new Error("Turbo child did not report npm_execpath");
}

let resolvedReportedExecutable;
try {
  resolvedReportedExecutable = await realpath(reportedExecutable);
} catch {
  throw new Error(
    `Turbo child reported a nonexistent pnpm executable: ${reportedExecutable}`,
  );
}

if (resolvedReportedExecutable !== expectedExecutable) {
  throw new Error(
    `Turbo child must use the repo-local pnpm executable; received ${resolvedReportedExecutable}`,
  );
}

console.log(`pnpm child contract: ${requiredVersion}; ${expectedExecutable}`);

import { readFile } from "node:fs/promises";

const requiredVersion = "11.10.0";
const rootPackage = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const userAgent = process.env.npm_config_user_agent ?? "";
const executable = process.env.npm_execpath ?? "";

if (rootPackage.packageManager !== `pnpm@${requiredVersion}`) {
  throw new Error(`root packageManager must be pnpm@${requiredVersion}`);
}

if (!userAgent.startsWith(`pnpm/${requiredVersion} `)) {
  throw new Error(
    `Turbo child must use pnpm ${requiredVersion}; received ${userAgent || "no npm_config_user_agent"}`,
  );
}

if (!/node_modules[\\/]pnpm[\\/]bin[\\/]pnpm\.mjs$/.test(executable)) {
  throw new Error(
    `Turbo child must resolve a workspace pnpm executable; received ${executable || "no npm_execpath"}`,
  );
}

console.log(`pnpm child contract: ${userAgent}; ${executable}`);

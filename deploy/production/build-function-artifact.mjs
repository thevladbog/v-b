import { execFileSync } from "node:child_process";
import { readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = fileURLToPath(new URL("../../", import.meta.url));
const FIXED_DOS_TIME = 0;
const FIXED_DOS_DATE = 0x2821; // 2000-01-01, independent of local timezone.
const UTF8_FLAG = 0x0800;
const UNIX_FILE_MODE = (0o100644 << 16) >>> 0;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return value >>> 0;
});

function crc32(data) {
  let value = 0xffffffff;
  for (const byte of data) value = (value >>> 8) ^ crcTable[(value ^ byte) & 0xff];
  return (value ^ 0xffffffff) >>> 0;
}

export function createDeterministicZip(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("function_archive_entries_required");
  }
  const names = new Set();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of entries) {
    if (
      !entry ||
      typeof entry.name !== "string" ||
      !/^[A-Za-z0-9._-]{1,128}$/.test(entry.name) ||
      names.has(entry.name) ||
      !Buffer.isBuffer(entry.data)
    ) {
      throw new Error("invalid_function_archive_entry");
    }
    names.add(entry.name);
    const name = Buffer.from(entry.name, "utf8");
    const checksum = crc32(entry.data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(UTF8_FLAG, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(FIXED_DOS_TIME, 10);
    localHeader.writeUInt16LE(FIXED_DOS_DATE, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(entry.data.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, entry.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0x0314, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(UTF8_FLAG, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(FIXED_DOS_TIME, 12);
    centralHeader.writeUInt16LE(FIXED_DOS_DATE, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(entry.data.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(UNIX_FILE_MODE, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + entry.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

export async function buildFunctionArtifact({
  outputRoot = resolve(root, ".artifacts/function"),
} = {}) {
  const bundleDirectory = resolve(outputRoot, "bundle");
  const bundlePath = resolve(bundleDirectory, "index.js");
  const packagePath = resolve(bundleDirectory, "package.json");
  const archivePath = resolve(outputRoot, "vbtech-contact-function.zip");

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(bundleDirectory, { recursive: true, mode: 0o700 });
  await build({
    entryPoints: [resolve(root, "apps/contact-function/src/index.ts")],
    outfile: bundlePath,
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    sourcemap: false,
    minify: false,
    legalComments: "none",
    logLevel: "warning",
  });
  await writeFile(packagePath, '{"type":"commonjs"}\n', { mode: 0o600 });
  execFileSync(
    process.execPath,
    [
      "-e",
      "const value=require(process.argv[1]); if(typeof value.httpHandler!=='function'||typeof value.timerHandler!=='function') process.exit(1)",
      bundlePath,
    ],
    { stdio: "inherit" },
  );
  const archive = createDeterministicZip([
    { name: "index.js", data: await readFile(bundlePath) },
    { name: "package.json", data: await readFile(packagePath) },
  ]);
  await writeFile(archivePath, archive, { mode: 0o600 });
  return archivePath;
}

async function main() {
  process.stdout.write(`${await buildFunctionArtifact()}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ error: "function_artifact_build_failed" })}\n`);
    if (process.env.CI !== "true") process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}

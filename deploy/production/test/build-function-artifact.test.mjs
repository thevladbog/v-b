import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildFunctionArtifact,
  createDeterministicZip,
} from "../build-function-artifact.mjs";

test("function ZIP bytes ignore process timezone and umask", () => {
  const previousTimezone = process.env.TZ;
  const previousUmask = process.umask();
  try {
    process.env.TZ = "Pacific/Honolulu";
    process.umask(0o077);
    const first = createDeterministicZip([
      { name: "index.js", data: Buffer.from("exports.httpHandler = () => null;\n") },
      { name: "package.json", data: Buffer.from('{"type":"commonjs"}\n') },
    ]);

    process.env.TZ = "Asia/Tokyo";
    process.umask(0o002);
    const second = createDeterministicZip([
      { name: "index.js", data: Buffer.from("exports.httpHandler = () => null;\n") },
      { name: "package.json", data: Buffer.from('{"type":"commonjs"}\n') },
    ]);

    assert.deepEqual(second, first);
    assert.equal(first.readUInt32LE(0), 0x04034b50);
    assert.equal(first.readUInt16LE(10), 0);
    assert.equal(first.readUInt16LE(12), 0x2821);
  } finally {
    process.umask(previousUmask);
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test("function ZIP bytes ignore caller entry order", () => {
  const entries = [
    { name: "package.json", data: Buffer.from('{"type":"commonjs"}\n') },
    { name: "index.js", data: Buffer.from("exports.httpHandler = () => null;\n") },
  ];

  assert.deepEqual(createDeterministicZip(entries), createDeterministicZip([...entries].reverse()));
});

test("complete function builds are reproducible across timezone and umask", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "vbtech-function-repro-"));
  const previousTimezone = process.env.TZ;
  const previousUmask = process.umask();
  try {
    process.env.TZ = "Pacific/Honolulu";
    process.umask(0o077);
    const first = await buildFunctionArtifact({ outputRoot: join(temporary, "first") });

    process.env.TZ = "Asia/Tokyo";
    process.umask(0o002);
    const second = await buildFunctionArtifact({ outputRoot: join(temporary, "second") });

    assert.deepEqual(await readFile(second), await readFile(first));
  } finally {
    process.umask(previousUmask);
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
    await rm(temporary, { recursive: true, force: true });
  }
});

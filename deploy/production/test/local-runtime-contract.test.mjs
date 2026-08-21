import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);

test("local Mailpit uses the reviewed multi-platform image index", async () => {
  const compose = await readFile(new URL("deploy/local/compose.yml", root), "utf8");

  assert.match(
    compose,
    /axllent\/mailpit:v1\.30\.7@sha256:d5ecbb067db3705fa953d79e1b7f81ef84038df67aba6c52825d8c02a1ea748a/,
  );
  assert.doesNotMatch(
    compose,
    /sha256:a0ec6df78d03abfa0328c76ccb16ff164eb9e08623ef7ddd6f0fd5a43ab35ed8/,
  );
});


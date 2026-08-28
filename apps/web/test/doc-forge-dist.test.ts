import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("doc-forge built page", () => {
  it("не содержит нессобранный плейсхолдер __VITE_PRELOAD__ и включает df-unlock", () => {
    const html = readFileSync(join(process.cwd(), "dist/tools/doc/index.html"), "utf-8");
    expect(html).not.toContain("__VITE_PRELOAD__");
    expect(html).toContain("df-unlock");
  });
});

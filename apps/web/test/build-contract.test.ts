import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import config from "../astro.config.mjs";

describe("Astro build contract", () => {
  it("uses static output and the production site URL", async () => {
    const source = await readFile(new URL("../astro.config.mjs", import.meta.url), "utf8");
    expect(source).toContain('site: "https://v-b.tech"');
    expect(source).toContain('output: "static"');
  });

  it("defines a public client boolean contact flag that defaults false", () => {
    const field = config.env?.schema?.PUBLIC_CONTACT_SUBMISSION_ENABLED;

    expect(field).toMatchObject({
      type: "boolean",
      context: "client",
      access: "public",
      default: false,
    });
  });
});

import { describe, expect, it } from "vitest";
import { LOCALES, SITE_CONTENT } from "../src/index.js";

describe("site content", () => {
  it.each(LOCALES)("has complete %s content", (locale) => {
    const page = SITE_CONTENT[locale];
    expect(page.meta.title).toBeTruthy();
    expect(page.hero.title).toBeTruthy();
    expect(page.cases).toHaveLength(3);
    expect(new Set(page.cases.map((item) => item.id))).toEqual(
      new Set(["markiro", "idento", "quokkaq"]),
    );
  });
});

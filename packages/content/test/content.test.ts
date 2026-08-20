import { describe, expect, it } from "vitest";
import {
  assertCompleteLocalizedStrings,
  LOCALES,
  SITE_CONTENT,
} from "../src/index.js";

describe("site content", () => {
  it.each(LOCALES)("has complete %s content", (locale) => {
    const page = SITE_CONTENT[locale];
    expect(() => assertCompleteLocalizedStrings(page)).not.toThrow();
    expect(page.meta.title).toBeTruthy();
    expect(page.hero.title).toBeTruthy();
    expect(page.cases).toHaveLength(3);
    expect(new Set(page.cases.map((item) => item.id))).toEqual(
      new Set(["markiro", "idento", "quokkaq"]),
    );
    expect(Object.keys(page.contact.errors)).toEqual([
      "name",
      "contact",
      "message",
      "consent",
    ]);
    expect(page.contact.directContactContext).toBeTruthy();
    expect(page.contact.consentDraftContext).toBeTruthy();
  });

  it("keeps canonical legal identities out of localized copy", () => {
    expect(JSON.stringify(SITE_CONTENT)).not.toMatch(/VBT-PD-\d+/);
  });

  it("rejects a blank nested translation", () => {
    const page = structuredClone(SITE_CONTENT.en);
    page.contact.formSubmit = " ";

    expect(() => assertCompleteLocalizedStrings(page)).toThrow(
      "content.contact.formSubmit",
    );
  });

  it("ignores non-string facts while checking nested translations", () => {
    expect(() =>
      assertCompleteLocalizedStrings({
        translation: "Present",
        facts: { enabled: false, revision: 0 },
      }),
    ).not.toThrow();
  });
});

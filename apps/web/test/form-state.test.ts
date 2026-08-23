import { describe, expect, it } from "vitest";
import {
  normalizeContact,
  resolveContactSubmissionReadiness,
  validateDraft,
} from "../src/lib/form-state.js";

describe("contact form state", () => {
  it("normalizes surrounding whitespace, lower-cases email, and preserves Telegram casing", () => {
    expect(normalizeContact("  @TheVlad_Bog  ")).toBe("@TheVlad_Bog");
    expect(normalizeContact("  Person@Example.COM  ")).toBe("person@example.com");
  });

  it.each(["ru", "en"] as const)(
    "reports every missing %s field in stable DOM order",
    (locale) => {
      expect(
        validateDraft(
          { name: " \t", contact: "\n", message: "  ", consent: false },
          locale,
        ),
      ).toEqual({
        valid: false,
        fields: ["name", "contact", "message", "consent"],
      });
    },
  );

  it.each(["ru", "en"] as const)(
    "accepts the same valid email draft in %s",
    (locale) => {
      expect(
        validateDraft(
          {
            name: "Vlad",
            contact: " hello@example.com ",
            message: "A bounded project enquiry.",
            consent: true,
          },
          locale,
        ),
      ).toEqual({ valid: true, fields: [] });
    },
  );

  it("accepts a Telegram username with five allowed characters", () => {
    expect(
      validateDraft(
        { name: "V", contact: "@abc_1", message: "M", consent: true },
        "en",
      ),
    ).toEqual({ valid: true, fields: [] });
  });

  it.each(["@abcd", "@abc-d", "person@example", "two@@example.com"])(
    "rejects invalid contact %s",
    (contact) => {
      expect(
        validateDraft(
          { name: "V", contact, message: "M", consent: true },
          "en",
        ),
      ).toEqual({ valid: false, fields: ["contact"] });
    },
  );

  it("accepts exact text maximums", () => {
    expect(
      validateDraft(
        {
          name: "n".repeat(100),
          contact: `${"a".repeat(242)}@example.com`,
          message: "m".repeat(4_000),
          consent: true,
        },
        "ru",
      ),
    ).toEqual({ valid: true, fields: [] });
  });

  it("rejects text values one character over their maximums in DOM order", () => {
    expect(
      validateDraft(
        {
          name: "n".repeat(101),
          contact: `${"a".repeat(243)}@example.com`,
          message: "m".repeat(4_001),
          consent: true,
        },
        "en",
      ),
    ).toEqual({ valid: false, fields: ["name", "contact", "message"] });
  });

  it("keeps the disabled shell bounded to the current ACTIVE consent", () => {
    expect(resolveContactSubmissionReadiness(false)).toEqual({
      submissionEnabled: false,
      consentIdentity: "VBT-PD-02/2026.08/01",
    });
  });

  it("allows submission with the current ACTIVE consent", () => {
    expect(resolveContactSubmissionReadiness(true)).toEqual({
      submissionEnabled: true,
      consentIdentity: "VBT-PD-02/2026.08/01",
    });
  });
});

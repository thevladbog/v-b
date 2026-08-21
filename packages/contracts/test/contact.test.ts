import { describe, expect, it } from "vitest";
import { CURRENT_CONTACT_CONSENT_ID } from "@vbtech/legal-documents";
import {
  CONTACT_ERROR_CODES,
  CONTACT_FIELD_LIMITS,
  contactRequestSchema,
  isEmailContact,
  type ContactAcceptedResponse,
  type ContactErrorCode,
} from "../src/index.js";

const validRequest = {
  requestId: "11111111-1111-4111-8111-111111111111",
  locale: "en",
  name: "Vlad",
  contact: "@thevladbog",
  message: "A concrete product problem",
  sourcePath: "/en/",
  consentId: CURRENT_CONTACT_CONSENT_ID,
  captchaToken: "opaque-token",
  website: "",
} as const;

describe("contact request contract", () => {
  it("exports one immutable set of field limits used by the request schema", () => {
    expect(Object.isFrozen(CONTACT_FIELD_LIMITS)).toBe(true);
    expect(CONTACT_FIELD_LIMITS).toEqual({
      name: 100,
      contact: 254,
      message: 4_000,
      consentId: 64,
      captchaToken: 4_096,
      website: 200,
    });

    for (const field of ["name", "message", "consentId", "captchaToken"] as const) {
      const maximum = CONTACT_FIELD_LIMITS[field];
      expect(() => contactRequestSchema.parse({ ...validRequest, [field]: "x".repeat(maximum) })).not.toThrow();
      expect(() => contactRequestSchema.parse({ ...validRequest, [field]: "x".repeat(maximum + 1) })).toThrow();
    }
    const emailSuffix = "@example.com";
    const maximumEmail = `${"a".repeat(CONTACT_FIELD_LIMITS.contact - emailSuffix.length)}${emailSuffix}`;
    expect(() => contactRequestSchema.parse({ ...validRequest, contact: maximumEmail })).not.toThrow();
    expect(() => contactRequestSchema.parse({ ...validRequest, contact: `a${maximumEmail}` })).toThrow();
    expect(() => contactRequestSchema.parse({ ...validRequest, website: "x".repeat(CONTACT_FIELD_LIMITS.website) })).not.toThrow();
    expect(() => contactRequestSchema.parse({ ...validRequest, website: "x".repeat(CONTACT_FIELD_LIMITS.website + 1) })).toThrow();
  });

  // Catches a production break that stops the handler from receiving normalized valid requests.
  it("accepts a valid Telegram request and trims bounded user fields", () => {
    const parsed = contactRequestSchema.parse({
      ...validRequest,
      name: "  Vlad  ",
      message: "  A concrete product problem  ",
      captchaToken: "  opaque-token  ",
    });

    expect(parsed).toMatchObject({
      contact: "@thevladbog",
      name: "Vlad",
      message: "A concrete product problem",
      captchaToken: "opaque-token",
    });
  });

  // Catches a production break that lets unreviewed request fields cross the public boundary.
  it("rejects an unexpected request property", () => {
    expect(() => contactRequestSchema.parse({ ...validRequest, unexpected: true })).toThrow();
  });

  // Catches a production break that accepts a route outside the two reviewed public pages.
  it.each(["/contact/", "/en", "/ru/"])("rejects unsupported source path %s", (sourcePath) => {
    expect(() => contactRequestSchema.parse({ ...validRequest, sourcePath })).toThrow();
  });

  // Catches a production break that accepts a malformed request ID for an idempotent submission.
  it("rejects a malformed request ID", () => {
    expect(() =>
      contactRequestSchema.parse({ ...validRequest, requestId: "not-a-uuid" }),
    ).toThrow();
  });

  // Catches a production break that lets equivalent UUID spellings select different locks or AAD.
  it("canonicalizes an uppercase request ID to lowercase", () => {
    const parsed = contactRequestSchema.parse({
      ...validRequest,
      requestId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
    });

    expect(parsed.requestId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  // Catches a production break that permits mixed-case email input to produce inconsistent delivery addresses.
  it("accepts a lower-case email contact and rejects mixed case", () => {
    expect(contactRequestSchema.parse({ ...validRequest, contact: "hello@example.com" }).contact).toBe(
      "hello@example.com",
    );
    expect(() => contactRequestSchema.parse({ ...validRequest, contact: "Hello@example.com" })).toThrow();
  });

  // Catches a production break that accepts malformed email or Telegram contact values.
  it.each(["hello@example", "@tiny", "@invalid-handle"])(
    "rejects malformed contact %s",
    (contact) => {
      expect(() => contactRequestSchema.parse({ ...validRequest, contact })).toThrow();
    },
  );

  // Catches a production break that permits header injection or Unicode controls in a public request.
  it.each([
    ["CRLF", "hello@example.com\r\nBcc: attacker@example.com"],
    ["NUL", "hello@example.com\u0000"],
    ["C1 control", "hello@example.com\u0085"],
  ])("rejects contact containing %s", (_label, contact) => {
    expect(() => contactRequestSchema.parse({ ...validRequest, contact })).toThrow();
  });

  // Catches a production break that allows controls through non-contact fields into storage or email rendering.
  it.each([
    ["name", "Vlad\u0000"],
    ["message", "A concrete\r\nproduct problem"],
    ["consentId", "VBT-PD-02/DRAFT\u0085"],
    ["captchaToken", "opaque-token\u0000"],
    ["website", "trap\u0000"],
  ] as const)("rejects a control character in %s", (field, value) => {
    expect(() => contactRequestSchema.parse({ ...validRequest, [field]: value })).toThrow();
  });

  // Catches a production break that trims boundary CR/LF away before rejecting it.
  it.each([
    ["leading name", "name", "\r\nVlad"],
    ["trailing name", "name", "Vlad\r\n"],
    ["leading contact", "contact", "\r\nhello@example.com"],
    ["trailing contact", "contact", "hello@example.com\r\n"],
    ["leading message", "message", "\r\nA concrete product problem"],
    ["trailing message", "message", "A concrete product problem\r\n"],
    ["leading consent ID", "consentId", "\r\nVBT-PD-02/DRAFT"],
    ["trailing consent ID", "consentId", "VBT-PD-02/DRAFT\r\n"],
    ["leading captcha token", "captchaToken", "\r\nopaque-token"],
    ["trailing captcha token", "captchaToken", "opaque-token\r\n"],
  ] as const)("rejects %s CR/LF before normalization", (_label, field, value) => {
    expect(() => contactRequestSchema.parse({ ...validRequest, [field]: value })).toThrow();
  });
});

describe("email contact guard", () => {
  // Catches a production break that queues visitor confirmations for a Telegram handle.
  it("identifies only valid lower-case email contacts", () => {
    expect(isEmailContact("hello@example.com")).toBe(true);
    expect(isEmailContact("@thevladbog")).toBe(false);
    expect(isEmailContact("Hello@example.com")).toBe(false);
  });
});

describe("public contact responses", () => {
  // Catches a production break that exposes the obsolete consent error spelling to browser clients.
  it("exposes consent_revision_changed and excludes the obsolete consent spelling", () => {
    expect(CONTACT_ERROR_CODES).toContain("consent_revision_changed");
    expect(CONTACT_ERROR_CODES).not.toContain("consent_changed");
    expect(CONTACT_ERROR_CODES).toEqual([
      "invalid_request",
      "consent_revision_changed",
      "captcha_required",
      "captcha_rejected",
      "captcha_unavailable",
      "rate_limited",
      "submission_disabled",
      "temporarily_unavailable",
    ]);
  });

  // Catches a production break that makes the accepted response unusable by downstream request handling.
  it("keeps the accepted response and error code public types consumable", () => {
    const response = {
      accepted: true,
      requestId: "11111111-1111-4111-8111-111111111111",
    } satisfies ContactAcceptedResponse;
    const code: ContactErrorCode = "captcha_rejected";

    expect(response).toEqual({
      accepted: true,
      requestId: "11111111-1111-4111-8111-111111111111",
    });
    expect(code).toBe("captcha_rejected");
  });
});

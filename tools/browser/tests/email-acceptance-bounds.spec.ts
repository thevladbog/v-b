import { Buffer } from "node:buffer";
import { stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import * as captureModule from "../email-acceptance/capture.js";

const expectedLimits = {
  mailpitJsonBytes: 1_048_576,
  htmlCharacters: 32_768,
  htmlUtf8Bytes: 65_536,
  textCharacters: 8_192,
  textUtf8Bytes: 16_384,
  documentWidth: 1_440,
  documentHeight: 2_048,
  capturePngBytes: 524_288,
  totalEvidenceBytes: 8_388_608,
  contactSheetWidth: 1_280,
  contactSheetHeight: 4_096,
  contactSheetBytes: 4_194_304,
} as const;

type EvidenceModule = {
  EMAIL_EVIDENCE_LIMITS: typeof expectedLimits;
  EMAIL_EVIDENCE_DIRECTORY: string;
  readBoundedJsonResponse(response: Response): Promise<unknown>;
  assertEmailBodyBounds(html: string, text: string): void;
  measureRenderedDocument(page: Page): Promise<{
    width: number;
    height: number;
  }>;
  inspectEvidencePng(bytes: Uint8Array, kind: "capture" | "contact-sheet"): {
    width: number;
    height: number;
    fileBytes: number;
  };
  assertTotalGeneratedEvidenceBytes(bytes: number): void;
  withCleanEvidenceDirectory<T>(operation: (directory: string) => Promise<T>): Promise<T>;
};

const subject = captureModule as unknown as EvidenceModule;

const syntheticPng = (width: number, height: number, fileBytes = 24): Buffer => {
  const bytes = Buffer.alloc(fileBytes);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
};

test("exports the exact evidence ceilings consumed by acceptance", () => {
  // Break caught: documented/tested maxima drift from the limits actually used by the generator.
  expect(subject.EMAIL_EVIDENCE_LIMITS).toEqual(expectedLimits);
});

test("fails closed before parsing an oversized or malformed Mailpit JSON response", async () => {
  // Break caught: response.json() buffers an arbitrary Mailpit body before a limit can be enforced.
  const oversized = new Response(`{"value":"${"x".repeat(expectedLimits.mailpitJsonBytes)}"}`);
  await expect(subject.readBoundedJsonResponse(oversized)).rejects.toThrow(
    "mailpit_json_response_too_large",
  );
  await expect(subject.readBoundedJsonResponse(new Response('{"broken":'))).rejects.toThrow(
    "mailpit_json_invalid",
  );
});

test("fails closed on oversized HTML or text by characters and UTF-8 bytes", () => {
  // Break caught: an exact-subject tagged fixture can inject an arbitrarily large body into Chromium.
  expect(() => subject.assertEmailBodyBounds(
    "x".repeat(expectedLimits.htmlCharacters + 1),
    "safe",
  )).toThrow("email_html_characters_exceeded");
  expect(() => subject.assertEmailBodyBounds(
    "界".repeat(25_000),
    "safe",
  )).toThrow("email_html_utf8_bytes_exceeded");
  expect(() => subject.assertEmailBodyBounds(
    "safe",
    "x".repeat(expectedLimits.textCharacters + 1),
  )).toThrow("email_text_characters_exceeded");
  expect(() => subject.assertEmailBodyBounds(
    "safe",
    "界".repeat(6_000),
  )).toThrow("email_text_utf8_bytes_exceeded");
});

test("rejects rendered width and height before any screenshot", async ({ page }) => {
  // Break caught: fullPage expands to attacker-controlled scroll dimensions.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(`<style>html,body{margin:0;width:${expectedLimits.documentWidth + 1}px;height:1px}</style>`);
  await expect(subject.measureRenderedDocument(page)).rejects.toThrow(
    "email_document_width_exceeded",
  );

  await page.setContent(`<style>html,body{margin:0;width:390px;height:${expectedLimits.documentHeight + 1}px}</style>`);
  await expect(subject.measureRenderedDocument(page)).rejects.toThrow(
    "email_document_height_exceeded",
  );
});

test("rejects oversized capture PNG dimensions and bytes", () => {
  // Break caught: a screenshot is written without validating the returned PNG dimensions or file size.
  expect(() => subject.inspectEvidencePng(
    syntheticPng(expectedLimits.documentWidth + 1, 900),
    "capture",
  )).toThrow("email_capture_png_width_exceeded");
  expect(() => subject.inspectEvidencePng(
    syntheticPng(390, expectedLimits.documentHeight + 1),
    "capture",
  )).toThrow("email_capture_png_height_exceeded");
  expect(() => subject.inspectEvidencePng(
    syntheticPng(390, 844, expectedLimits.capturePngBytes + 1),
    "capture",
  )).toThrow("email_capture_png_bytes_exceeded");
});

test("rejects aggregate evidence beyond its byte ceiling without allocation", () => {
  // Break caught: individually acceptable PNGs can cumulatively exhaust disk or memory.
  expect(() => subject.assertTotalGeneratedEvidenceBytes(
    expectedLimits.totalEvidenceBytes + 1,
  )).toThrow("email_total_evidence_bytes_exceeded");
});

test("rejects oversized contact-sheet dimensions and bytes", () => {
  // Break caught: the second full-page screenshot can grow independently of individual captures.
  expect(() => subject.inspectEvidencePng(
    syntheticPng(expectedLimits.contactSheetWidth + 1, 3_026),
    "contact-sheet",
  )).toThrow("email_contact_sheet_width_exceeded");
  expect(() => subject.inspectEvidencePng(
    syntheticPng(1_120, expectedLimits.contactSheetHeight + 1),
    "contact-sheet",
  )).toThrow("email_contact_sheet_height_exceeded");
  expect(() => subject.inspectEvidencePng(
    syntheticPng(1_120, 3_026, expectedLimits.contactSheetBytes + 1),
    "contact-sheet",
  )).toThrow("email_contact_sheet_bytes_exceeded");
});

test("removes the bounded evidence directory after any partial generation failure", async () => {
  // Break caught: a failed run leaves incomplete screenshots that can be mistaken for acceptance evidence.
  await expect(subject.withCleanEvidenceDirectory(async (directory) => {
    await writeFile(path.join(directory, "partial.png"), "partial", "utf8");
    throw new Error("synthetic_generation_failure");
  })).rejects.toThrow("synthetic_generation_failure");
  await expect(stat(subject.EMAIL_EVIDENCE_DIRECTORY)).rejects.toMatchObject({ code: "ENOENT" });
});

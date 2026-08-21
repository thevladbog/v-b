import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  captureContactEmailAcceptance,
  EMAIL_EVIDENCE_DIRECTORY,
  EMAIL_EVIDENCE_LIMITS,
} from "../email-acceptance/capture.js";

test("rebuilds the bounded four-message local email acceptance matrix", async ({ browser }) => {
  // Break caught: clean checkouts cannot regenerate complete, mode-distinct visual evidence from actual Mailpit messages.
  const result = await captureContactEmailAcceptance(browser);

  expect(result.generatorVersion).toBe("1.0.0");
  expect(result.kinds.sort()).toEqual([
    "en-confirmation",
    "en-notification",
    "ru-confirmation",
    "ru-notification",
  ]);
  expect(result.captures).toHaveLength(32);
  expect(result.externalRequests).toEqual([]);
  expect(result.captures.every(({ modeApplied }) => modeApplied)).toBe(true);
  expect(result.captures.every(({ minimumContrast }) => minimumContrast >= 4.5)).toBe(true);
  expect(result.limits).toEqual(EMAIL_EVIDENCE_LIMITS);

  for (const capture of result.captures) {
    expect(capture.contentCharacters).toBeLessThanOrEqual(
      capture.part === "html"
        ? EMAIL_EVIDENCE_LIMITS.htmlCharacters
        : EMAIL_EVIDENCE_LIMITS.textCharacters,
    );
    expect(capture.contentUtf8Bytes).toBeLessThanOrEqual(
      capture.part === "html"
        ? EMAIL_EVIDENCE_LIMITS.htmlUtf8Bytes
        : EMAIL_EVIDENCE_LIMITS.textUtf8Bytes,
    );
    expect(capture.documentWidth).toBeLessThanOrEqual(EMAIL_EVIDENCE_LIMITS.documentWidth);
    expect(capture.documentHeight).toBeLessThanOrEqual(EMAIL_EVIDENCE_LIMITS.documentHeight);
    expect(capture.imageWidth).toBe(capture.documentWidth);
    expect(capture.imageHeight).toBe(capture.documentHeight);
    expect(capture.fileBytes).toBeLessThanOrEqual(EMAIL_EVIDENCE_LIMITS.capturePngBytes);
  }

  expect(result.contactSheet.documentWidth).toBeLessThanOrEqual(
    EMAIL_EVIDENCE_LIMITS.contactSheetWidth,
  );
  expect(result.contactSheet.documentHeight).toBeLessThanOrEqual(
    EMAIL_EVIDENCE_LIMITS.contactSheetHeight,
  );
  expect(result.contactSheet.imageWidth).toBe(result.contactSheet.documentWidth);
  expect(result.contactSheet.imageHeight).toBe(result.contactSheet.documentHeight);
  expect(result.contactSheet.fileBytes).toBeLessThanOrEqual(
    EMAIL_EVIDENCE_LIMITS.contactSheetBytes,
  );

  const manifestBytes = await readFile(path.join(EMAIL_EVIDENCE_DIRECTORY, "manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  expect(manifest).toEqual(result);
  expect(
    result.captures.reduce((total, capture) => total + capture.fileBytes, 0) +
      result.contactSheet.fileBytes + Buffer.byteLength(manifestBytes),
  ).toBe(result.totalEvidenceBytes);
  expect(result.totalEvidenceBytes).toBeLessThanOrEqual(
    EMAIL_EVIDENCE_LIMITS.totalEvidenceBytes,
  );

  const variants = new Map<string, Map<string, string>>();
  for (const capture of result.captures) {
    const key = `${capture.kind}:${capture.part}:${capture.size}`;
    const modes = variants.get(key) ?? new Map<string, string>();
    modes.set(capture.mode, capture.pixelSha256);
    variants.set(key, modes);
  }
  expect(variants.size).toBe(16);
  for (const modes of variants.values()) {
    expect(modes.get("light")).toBeTruthy();
    expect(modes.get("dark")).toBeTruthy();
    expect(modes.get("light")).not.toBe(modes.get("dark"));
  }
});

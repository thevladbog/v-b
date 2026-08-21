import { expect, test } from "@playwright/test";
import { captureContactEmailAcceptance } from "../email-acceptance/capture.js";

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

import { execFile } from "node:child_process";
import { rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const webRoot = new URL("../", import.meta.url);
const publicSiteKey = "vbtech-reviewed-active-public-site-key";

type MixedDirection = "policy-active" | "consent-active";

const buildMixed = (direction: MixedDirection, submissionRequested: boolean) =>
  execFileAsync("node_modules/.bin/astro", [
    "build",
    "--config",
    "test-mixed/astro.config.mjs",
  ], {
    cwd: webRoot,
    env: {
      ...process.env,
      VBTECH_PRIVATE_MIXED_LEGAL_CONTOUR: direction,
      PUBLIC_CONTACT_SUBMISSION_ENABLED: String(submissionRequested),
      PUBLIC_SMARTCAPTCHA_SITE_KEY: publicSiteKey,
    },
  });

describe("mixed personal-data legal contours", () => {
  it.each([
    ["policy-active", "active", "draft"],
    ["consent-active", "draft", "active"],
  ] as const)(
    "%s fails before emitting normal or public-enabled artifacts",
    async (direction, policyStatus, consentStatus) => {
      const outDir = join(tmpdir(), `vbtech-contact-mixed-${direction}-dist`);
      for (const submissionRequested of [false, true]) {
        await rm(outDir, { recursive: true, force: true });
        await expect(buildMixed(direction, submissionRequested)).rejects.toMatchObject({
          stderr: expect.stringMatching(new RegExp(
            `incoherent personal data legal contour.*VBT-PD-01=${policyStatus}.*VBT-PD-02=${consentStatus}`,
            "i",
          )),
        });
        await expect(stat(outDir)).rejects.toMatchObject({ code: "ENOENT" });
      }
    },
  );
});

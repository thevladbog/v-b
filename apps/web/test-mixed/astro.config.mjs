import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { defineConfig, envField } from "astro/config";
import { createContactRuntimeIntegration } from "../src/integrations/contact-runtime.ts";
import { CURRENT_PERSONAL_DATA_LEGAL_CONTOUR } from "./legal-documents.ts";

const direction = process.env.VBTECH_PRIVATE_MIXED_LEGAL_CONTOUR;
if (direction !== "policy-active" && direction !== "consent-active") {
  throw new Error("The mixed legal contour requires an explicit private direction guard");
}

const origin = "http://127.0.0.1:43239";
const outDir = join(tmpdir(), `vbtech-contact-mixed-${direction}-dist`);
const submissionRequested = process.env.PUBLIC_CONTACT_SUBMISSION_ENABLED === "true";
const publicSiteKey = process.env.PUBLIC_SMARTCAPTCHA_SITE_KEY ?? "";

const exactPrivateContour = {
  name: "vbtech-private-mixed-legal-contour",
  hooks: {
    "astro:config:done": ({ config }) => {
      if (String(config.site).replace(/\/$/, "") !== origin) {
        throw new Error("The mixed legal contour is restricted to its exact loopback origin");
      }
      if (fileURLToPath(config.outDir).replace(/\/$/, "") !== outDir) {
        throw new Error("The mixed legal contour is restricted to its OS-temporary output");
      }
    },
  },
};

export default defineConfig({
  root: fileURLToPath(new URL("../", import.meta.url)),
  outDir,
  site: origin,
  output: "static",
  trailingSlash: "always",
  integrations: [
    exactPrivateContour,
    createContactRuntimeIntegration({
      submissionRequested,
      legalReady: CURRENT_PERSONAL_DATA_LEGAL_CONTOUR.status === "active",
      publicSiteKey,
    }),
  ],
  env: {
    schema: {
      PUBLIC_CONTACT_SUBMISSION_ENABLED: envField.boolean({
        context: "client",
        access: "public",
        default: submissionRequested,
      }),
      PUBLIC_SMARTCAPTCHA_SITE_KEY: envField.string({
        context: "client",
        access: "public",
        default: publicSiteKey,
      }),
    },
  },
  vite: {
    resolve: {
      alias: {
        "@vbtech/legal-documents": fileURLToPath(new URL("./legal-documents.ts", import.meta.url)),
      },
    },
  },
  build: { inlineStylesheets: "never" },
});

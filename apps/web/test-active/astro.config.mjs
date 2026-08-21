import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { defineConfig, envField } from "astro/config";
import { createContactRuntimeIntegration } from "../src/integrations/contact-runtime.ts";
import { CURRENT_PERSONAL_DATA_LEGAL_CONTOUR } from "./legal-documents.ts";

const activeOrigin = "http://127.0.0.1:43229";
const activeOutDir = join(tmpdir(), "vbtech-contact-active-dist");
const publicSiteKey = process.env.VBTECH_PRIVATE_ACTIVE_PUBLIC_SITE_KEY ??
  "vbtech-reviewed-active-public-site-key";

if (process.env.VBTECH_PRIVATE_ACTIVE_LEGAL_ARTIFACT !== "1") {
  throw new Error("The production-shaped contact contour requires its explicit private ACTIVE legal-artifact guard");
}

const exactPrivateContour = {
  name: "vbtech-private-active-contact-contour",
  hooks: {
    "astro:config:done": ({ config }) => {
      if (String(config.site).replace(/\/$/, "") !== activeOrigin) {
        throw new Error("The private ACTIVE contact artifact is restricted to its exact loopback origin");
      }
      if (fileURLToPath(config.outDir).replace(/\/$/, "") !== activeOutDir) {
        throw new Error("The private ACTIVE contact artifact is restricted to its OS-temporary output");
      }
    },
  },
};

export default defineConfig({
  root: fileURLToPath(new URL("../", import.meta.url)),
  outDir: activeOutDir,
  site: activeOrigin,
  output: "static",
  trailingSlash: "always",
  integrations: [
    exactPrivateContour,
    createContactRuntimeIntegration({
      submissionRequested: true,
      legalReady: CURRENT_PERSONAL_DATA_LEGAL_CONTOUR.status === "active",
      publicSiteKey,
    }),
  ],
  env: {
    schema: {
      PUBLIC_CONTACT_SUBMISSION_ENABLED: envField.boolean({
        context: "client",
        access: "public",
        default: true,
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

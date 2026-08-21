import { defineConfig, envField } from "astro/config";
import { CURRENT_PERSONAL_DATA_LEGAL_CONTOUR } from "@vbtech/legal-documents";
import { createContactRuntimeIntegration } from "./src/integrations/contact-runtime.ts";

const submissionRequested = process.env.PUBLIC_CONTACT_SUBMISSION_ENABLED === "true";
const publicSiteKey = process.env.PUBLIC_SMARTCAPTCHA_SITE_KEY ?? "";
const legalReady = CURRENT_PERSONAL_DATA_LEGAL_CONTOUR.status === "active";

export default defineConfig({
  site: "https://v-b.tech",
  output: "static",
  trailingSlash: "always",
  integrations: [
    createContactRuntimeIntegration({ submissionRequested, legalReady, publicSiteKey }),
  ],
  env: {
    schema: {
      PUBLIC_CONTACT_SUBMISSION_ENABLED: envField.boolean({
        context: "client",
        access: "public",
        default: false,
      }),
      PUBLIC_SMARTCAPTCHA_SITE_KEY: envField.string({
        context: "client",
        access: "public",
        default: "",
      }),
    },
  },
  build: {
    inlineStylesheets: "never",
  },
});

import type { AstroIntegration } from "astro";
import { assertReviewedPublicSmartCaptchaSiteKey } from "../lib/contact-runtime-config.js";

export interface ContactRuntimeIntegrationOptions {
  submissionRequested: boolean;
  legalReady: boolean;
  publicSiteKey: string;
}

const contactClientEntrypoint = new URL("../scripts/contact-form.ts", import.meta.url).href;

export function createContactRuntimeIntegration(
  options: ContactRuntimeIntegrationOptions,
): AstroIntegration {
  return {
    name: "vbtech-production-contact-runtime",
    hooks: {
      "astro:config:setup": ({ injectScript }) => {
        if (!options.submissionRequested || !options.legalReady) return;
        assertReviewedPublicSmartCaptchaSiteKey(options.publicSiteKey);
        injectScript(
          "page",
          `import { initializeContactForms } from ${JSON.stringify(contactClientEntrypoint)};\ninitializeContactForms();`,
        );
      },
    },
  };
}

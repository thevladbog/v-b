import { defineConfig, envField } from "astro/config";

export default defineConfig({
  site: "https://v-b.tech",
  output: "static",
  trailingSlash: "always",
  env: {
    schema: {
      PUBLIC_CONTACT_SUBMISSION_ENABLED: envField.boolean({
        context: "client",
        access: "public",
        default: false,
      }),
    },
  },
  build: {
    inlineStylesheets: "never",
  },
});

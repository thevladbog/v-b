import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://v-b.tech",
  output: "static",
  trailingSlash: "always",
  build: {
    inlineStylesheets: "never",
  },
});

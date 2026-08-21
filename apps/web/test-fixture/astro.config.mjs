import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { defineConfig, envField } from "astro/config";

if (process.env.VBTECH_INTERNAL_CONTACT_FIXTURE !== "1") {
  throw new Error("The non-deployable contact fixture requires its explicit private build guard");
}

export default defineConfig({
  root: fileURLToPath(new URL("../", import.meta.url)),
  srcDir: fileURLToPath(new URL("./src/", import.meta.url)),
  publicDir: fileURLToPath(new URL("../public/", import.meta.url)),
  outDir: join(tmpdir(), "vbtech-contact-fixture-dist"),
  site: "http://127.0.0.1:43219",
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
  build: { inlineStylesheets: "never" },
});

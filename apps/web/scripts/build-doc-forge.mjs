import { build } from "esbuild";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");
const OUT = join(appRoot, "public/tools/doc-payload.bin");

const password = process.env.VBTECH_DOC_TOOL_PASSWORD;
if (!password) {
  console.log("[doc-forge] VBTECH_DOC_TOOL_PASSWORD не задан — skip (страница будет без payload)");
  process.exit(0);
}

// esbuild не умеет импортнуть TS напрямую в node — собираем крипто-модуль на лету
async function loadCrypto() {
  const res = await build({
    entryPoints: [join(appRoot, "src/tools/doc-forge/payload-crypto.ts")],
    bundle: true, format: "esm", write: false, platform: "neutral",
  });
  const url = "data:text/javascript;base64," + Buffer.from(res.outputFiles[0].text).toString("base64");
  return import(url);
}
const { encryptPayload } = await loadCrypto();

const bundle = await build({
  entryPoints: [join(appRoot, "src/tools/doc-forge/main.ts")],
  bundle: true, format: "iife", minify: true, write: false, platform: "browser",
});
const js = bundle.outputFiles[0].text;

const privDir = join(appRoot, "private-assets/doc-forge");
const readB64 = (name) => {
  const p = join(privDir, name);
  return existsSync(p) ? readFileSync(p).toString("base64") : undefined;
};
const payload = {
  js,
  sealPng: readB64("seal.png"),
  signaturePng: readB64("signature.png"),
};
if (!payload.sealPng) console.log("[doc-forge] приватные ассеты не найдены — соберётся без печати/подписи");

const blob = await encryptPayload(password, new TextEncoder().encode(JSON.stringify(payload)));
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, blob);
console.log(`[doc-forge] payload: ${OUT} (${blob.length} bytes)`);

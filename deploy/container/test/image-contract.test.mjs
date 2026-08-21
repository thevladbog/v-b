import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("the image builds the pinned workspace and copies only static output into Caddy", async () => {
  const dockerfile = await source("deploy/container/web.Dockerfile");

  assert.match(dockerfile, /^FROM node:24\.18\.0-alpine AS web-build$/m);
  assert.match(dockerfile, /corepack pnpm install --frozen-lockfile/);
  assert.match(dockerfile, /ARG VBTECH_RELEASE_SHA/);
  assert.match(dockerfile, /corepack pnpm --filter @vbtech\/web build/);
  assert.match(dockerfile, /^FROM caddy:2\.11\.4-alpine AS runtime$/m);
  assert.match(dockerfile, /COPY --from=web-build .*\/dist \/srv\/vbtech\//);

  const runtimeStage = dockerfile.slice(dockerfile.indexOf("FROM caddy:"));
  assert.doesNotMatch(
    runtimeStage,
    /COPY(?![^\n]*--from=web-build)[^\n]*(apps|packages|node_modules)/,
  );
  assert.doesNotMatch(runtimeStage, /USER root\s*$/m);
});

test("the runtime is unprivileged, health checked, and bound to port 8080", async () => {
  const dockerfile = await source("deploy/container/web.Dockerfile");
  const entrypoint = await source("deploy/container/entrypoint.sh");

  assert.match(dockerfile, /^USER 65532:65532$/m);
  assert.match(dockerfile, /RUN setcap -r \/usr\/bin\/caddy/);
  assert.match(dockerfile, /^EXPOSE 8080$/m);
  assert.match(dockerfile, /^HEALTHCHECK /m);
  assert.match(dockerfile, /ENTRYPOINT \["\/usr\/local\/bin\/vbtech-entrypoint"\]/);
  assert.match(entrypoint, /VBTECH_RELEASE_SHA/);
  assert.match(entrypoint, /\[!0-9a-f\]/);
  assert.match(entrypoint, /exec caddy run/);
});

test("Caddy serves generated routes with release and security identity", async () => {
  const caddyfile = await source("deploy/container/Caddyfile");

  assert.match(caddyfile, /:8080/);
  assert.match(caddyfile, /root \* \/srv\/vbtech/);
  assert.match(caddyfile, /X-Vbtech-Release-Sha "\{\$VBTECH_RELEASE_SHA\}"/i);
  assert.match(caddyfile, /Content-Security-Policy/);
  assert.match(caddyfile, /X-Content-Type-Options "nosniff"/);
  assert.match(caddyfile, /header \{[\s\S]*?\bdefer\b/);
  assert.match(caddyfile, /:8080 \{[\s\S]*?import security_headers/);
  assert.match(caddyfile, /handle_errors/);
  assert.match(caddyfile, /handle_errors \{[\s\S]*?import security_headers/);
  assert.match(caddyfile, /rewrite \* \/404\.html/);
});

test("the external health probe verifies both status and release SHA", async () => {
  const healthcheck = await source("deploy/container/healthcheck.mjs");

  assert.match(healthcheck, /AbortSignal\.timeout/);
  assert.match(healthcheck, /x-vbtech-release-sha/i);
  assert.match(healthcheck, /VBTECH_RELEASE_SHA/);
  assert.match(healthcheck, /process\.exitCode = 1/);
});

test("the build context excludes local state and secrets", async () => {
  const dockerignore = await source(".dockerignore");

  for (const required of [".git", ".worktrees", "node_modules", ".env", "test-results"]) {
    assert.match(dockerignore, new RegExp(`^${required.replace(".", "\\.")}\\/?$`, "m"));
  }
});

test("the generated page can bind its build identity to the runtime header", async () => {
  const layout = await source("apps/web/src/layouts/BaseLayout.astro");

  assert.match(layout, /import\.meta\.env\.VBTECH_RELEASE_SHA/);
  assert.match(layout, /name="vbtech-release-sha"/);
});

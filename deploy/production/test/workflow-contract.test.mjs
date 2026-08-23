import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);

async function workflow(name) {
  return readFile(new URL(`.github/workflows/${name}.yml`, root), "utf8");
}

function actionReferences(source) {
  return [...source.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)].map(
    (match) => match[1],
  );
}

function assertPinnedActions(source) {
  const references = actionReferences(source);
  assert.ok(references.length > 0, "workflow must use reviewed actions");
  for (const reference of references) {
    assert.match(reference, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `${reference} must be SHA-pinned`);
  }
}

test("CI covers repository, browser, database, and runtime-image gates without PR secrets", async () => {
  const source = await workflow("ci");

  assertPinnedActions(source);
  assert.match(source, /^\s*pull_request:\s*$/m);
  assert.doesNotMatch(source, /pull_request_target/);
  assert.match(source, /^permissions:\s*\n\s+contents:\s+read\s*$/m);
  assert.doesNotMatch(source, /secrets\./);
  assert.match(source, /corepack pnpm install --frozen-lockfile/);
  assert.match(source, /corepack pnpm run lint/);
  assert.match(source, /corepack pnpm run typecheck/);
  assert.match(source, /corepack pnpm run test:contracts/);
  assert.match(source, /playwright install --with-deps chromium/);
  assert.match(source, /corepack pnpm run test$/m);
  assert.match(source, /corepack pnpm run test:db/);
  assert.match(source, /corepack pnpm run test:e2e/);
  assert.match(source, /docker build[\s\S]*deploy\/container\/web\.Dockerfile/);
  assert.match(
    source,
    /curl[^\n]*\/__health[\s\S]*test "\$health_ready" = true[\s\S]*x-vbtech-release-sha/,
  );
  assert.match(source, /^concurrency:/m);
});

test("publish is a protected manual exact-SHA build that attests but never deploys", async () => {
  const source = await workflow("publish");

  assertPinnedActions(source);
  assert.match(source, /^\s*workflow_dispatch:\s*$/m);
  assert.doesNotMatch(source, /^\s+(push|pull_request|schedule):\s*$/m);
  assert.match(source, /release_sha:[\s\S]*required:\s*true/);
  assert.match(source, /submission_state:[\s\S]*options:\s*\[disabled, enabled\][\s\S]*default:\s*disabled/);
  assert.match(source, /confirm_publish:[\s\S]*type:\s*boolean[\s\S]*default:\s*false/);
  assert.match(source, /confirm_enable:[\s\S]*type:\s*boolean[\s\S]*default:\s*false/);
  assert.match(source, /if:\s*github\.event\.inputs\.confirm_publish\s*==\s*'true'/);
  assert.match(source, /environment:\s*release-publish/);
  assert.match(source, /permissions:[\s\S]*contents:\s*read[\s\S]*packages:\s*write/);
  assert.match(source, /id-token:\s*write/);
  assert.match(source, /attestations:\s*write/);
  assert.match(source, /git merge-base --is-ancestor/);
  assert.match(source, /\[0-9a-f\]\{40\}/);
  assert.match(source, /IMAGE_TAG="\$IMAGE_REPOSITORY:\$RELEASE_SHA-\$VBTECH_SUBMISSION_STATE"/);
  assert.match(source, /docker manifest inspect "\$IMAGE_TAG"[\s\S]*Refusing to replace/);
  assert.match(source, /docker image inspect[\s\S]*range \.RepoDigests/);
  assert.match(source, /awk -v repository="\$IMAGE_REPOSITORY"/);
  assert.doesNotMatch(source, /index \.RepoDigests 0/);
  assert.match(source, /corepack pnpm run build:function-artifact/);
  assert.match(source, /--build-arg VBTECH_SUBMISSION_STATE="\$VBTECH_SUBMISSION_STATE"/);
  assert.match(source, /--build-arg PUBLIC_SMARTCAPTCHA_SITE_KEY="\$PUBLIC_SMARTCAPTCHA_SITE_KEY"/);
  assert.match(
    source,
    /docker create[\s\S]*docker cp[\s\S]*release-artifact\.mjs create[\s\S]*"\$web_dir"/,
  );
  assert.match(source, /sha256sum[\s\S]*vbtech-contact-function\.zip/);
  assert.match(source, /actions\/attest@/);
  assert.match(source, /release-manifest\.json/);
  assert.match(source, /name:\s*vbtech-release-\$\{\{ github\.event\.inputs\.release_sha \}\}-\$\{\{ github\.event\.inputs\.submission_state \}\}/);
  assert.doesNotMatch(source, /terraform\s+apply|yc\s+|ssh\s+|repository_dispatch|workflow_dispatches/);
  assert.match(source, /^concurrency:/m);
});

test("deploy verifies one published run and creates a state-bound protected handoff", async () => {
  const source = await workflow("deploy");

  assertPinnedActions(source);
  assert.match(source, /^\s*workflow_dispatch:\s*$/m);
  assert.doesNotMatch(source, /^\s+(push|pull_request|schedule):\s*$/m);
  assert.match(source, /publish_run_id:[\s\S]*required:\s*true/);
  assert.match(source, /release_sha:[\s\S]*required:\s*true/);
  assert.match(source, /submission_state:[\s\S]*options:\s*\[disabled, enabled\][\s\S]*default:\s*disabled/);
  assert.match(source, /confirm_enable:[\s\S]*type:\s*boolean[\s\S]*default:\s*false/);
  assert.match(source, /environment:\s*production-deploy/);
  assert.match(source, /^permissions:\s*\n\s+actions:\s+read\s+attestations:\s+read\s+contents:\s+read\s+packages:\s+read\s*$/m);
  assert.match(source, /github\.event\.inputs\.publish_run_id/);
  assert.match(source, /name:\s*vbtech-release-\$\{\{ github\.event\.inputs\.release_sha \}\}-\$\{\{ github\.event\.inputs\.submission_state \}\}/);
  assert.match(source, /actions\/runs\/\$PUBLISH_RUN_ID/);
  assert.match(source, /\.github\/workflows\/publish\.yml/);
  assert.match(source, /conclusion[^\n]*success/);
  assert.match(source, /head_sha/);
  assert.match(source, /gh attestation verify/);
  assert.match(source, /sha256sum --check/);
  assert.match(source, /release-manifest\.json "\$RELEASE_SHA" "\$PUBLISH_RUN_ID"[\s\\]*vbtech-contact-function\.zip/);
  assert.match(source, /docker\/login-action@/);
  assert.match(source, /--signer-workflow "\$GITHUB_REPOSITORY\/\.github\/workflows\/publish\.yml"/);
  assert.match(source, /--source-digest "\$RELEASE_SHA"/);
  assert.match(source, /--source-ref refs\/heads\/main/);
  assert.match(source, /docker manifest inspect/);
  assert.match(source, /VBTECH_SUBMISSION_STATE:\s*\$\{\{ github\.event\.inputs\.submission_state \}\}/);
  assert.match(source, /VBT-PD-02\/2026\.08\/01/);
  assert.match(source, /deployment-handoff\.json/);
  assert.match(source, /deploy\/production\/activate\.mjs/);
  assert.doesNotMatch(source, /terraform\s+apply|yc\s+|ssh\s+|repository_dispatch|workflow_dispatches/);
  assert.match(source, /^concurrency:/m);
});

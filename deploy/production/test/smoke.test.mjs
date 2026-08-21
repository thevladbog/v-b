import assert from "node:assert/strict";
import test from "node:test";

import { runSmoke } from "../smoke.mjs";

const SHA = "80202fad19521feb5b3ad291a4eb843ee030fb0f";
const CONSENT = "VBT-PD-02/DRAFT";

function html({ enabled = false, consent = CONSENT, includeForm = true } = {}) {
  const form = includeForm
    ? `<form data-contact-form data-submission-enabled="${String(enabled)}" data-consent-id="${consent}"></form>`
    : "";
  return `<!doctype html><html><head><meta name="vbtech-release-sha" content="${SHA}"><script>vbtech-theme-v1 data-theme</script></head><body>${form}</body></html>`;
}

function response(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "content-type": body.startsWith("<!doctype") ? "text/html; charset=utf-8" : "text/plain",
      "content-security-policy": "default-src 'self'",
      "x-vbtech-release-sha": SHA,
      ...headers,
    },
  });
}

function fakeSite({
  enabled = false,
  consent = CONSENT,
  missingReleasePath,
  exactPostStatus = 400,
} = {}) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    calls.push(`${method} ${url.pathname}`);
    const headers = url.pathname === missingReleasePath ? { "x-vbtech-release-sha": "" } : {};

    if (url.pathname === "/not-a-route") {
      return response(html({ enabled, consent, includeForm: false }), 404, headers);
    }
    if (url.pathname.startsWith("/api/")) {
      if (enabled && method === "POST" && url.pathname === "/api/contact") {
        return response("invalid request", exactPostStatus, headers);
      }
      return response("not found", 404, headers);
    }
    if (["/sitemap.xml", "/robots.txt", "/llms.txt"].includes(url.pathname)) {
      return response("v-b.tech", 200, headers);
    }
    const includeForm = url.pathname === "/" || url.pathname === "/en/";
    return response(html({ enabled, consent, includeForm }), 200, headers);
  };
  return { calls, fetchImpl };
}

test("private disabled smoke covers every route and the rejected API surface", async () => {
  const site = fakeSite();
  const result = await runSmoke({
    baseUrl: "http://127.0.0.1:18080",
    mode: "private",
    expected: { releaseSha: SHA, submissionState: "disabled", consentId: CONSENT },
    fetchImpl: site.fetchImpl,
  });

  assert.equal(result.failures.length, 0);
  for (const call of [
    "GET /",
    "GET /en/",
    "GET /privacy/",
    "GET /en/personal-data-consent/",
    "GET /404.html",
    "GET /sitemap.xml",
    "GET /not-a-route",
    "GET /api/contact",
    "POST /api/contact",
    "POST /api/contact/",
    "POST /api/other",
  ]) {
    assert.ok(site.calls.includes(call), `missing smoke call: ${call}`);
  }
});

test("enabled smoke requires the exact POST path while rejecting alternates", async () => {
  const consent = "VBT-PD-02/2026.08/01";
  const site = fakeSite({ enabled: true, consent });
  const result = await runSmoke({
    baseUrl: "https://v-b.tech",
    mode: "public",
    expected: { releaseSha: SHA, submissionState: "enabled", consentId: consent },
    fetchImpl: site.fetchImpl,
  });

  assert.equal(result.failures.length, 0);
  assert.ok(site.calls.includes("POST /api/contact"));
  assert.ok(site.calls.includes("POST /api/contact/"));
});

test("fails closed when a route loses release identity", async () => {
  const site = fakeSite({ missingReleasePath: "/privacy/" });

  await assert.rejects(
    runSmoke({
      baseUrl: "http://127.0.0.1:18080",
      mode: "private",
      expected: { releaseSha: SHA, submissionState: "disabled", consentId: CONSENT },
      fetchImpl: site.fetchImpl,
    }),
    /smoke_failed.*release header/,
  );
});

test("enabled smoke rejects a redirect instead of treating it as exact API routing", async () => {
  const consent = "VBT-PD-02/2026.08/01";
  const site = fakeSite({ enabled: true, consent, exactPostStatus: 302 });

  await assert.rejects(
    runSmoke({
      baseUrl: "https://v-b.tech",
      mode: "public",
      expected: { releaseSha: SHA, submissionState: "enabled", consentId: consent },
      fetchImpl: site.fetchImpl,
    }),
    /POST \/api\/contact is not routed/,
  );
});

test("public smoke refuses a non-TLS target", async () => {
  await assert.rejects(
    runSmoke({
      baseUrl: "http://v-b.tech",
      mode: "public",
      expected: { releaseSha: SHA, submissionState: "disabled", consentId: CONSENT },
      fetchImpl: fakeSite().fetchImpl,
    }),
    /public_smoke_requires_https/,
  );
});

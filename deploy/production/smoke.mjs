const HTML_ROUTES = [
  "/",
  "/en/",
  "/legal/",
  "/en/legal/",
  "/privacy/",
  "/en/privacy/",
  "/personal-data-consent/",
  "/en/personal-data-consent/",
  "/404.html",
];
const TEXT_ROUTES = ["/sitemap.xml", "/robots.txt", "/llms.txt"];

function validateTarget(baseUrl, mode) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("invalid_smoke_target");
  }
  if (url.username || url.password || url.search || url.hash) throw new Error("invalid_smoke_target");
  if (mode === "public" && url.protocol !== "https:") {
    throw new Error("public_smoke_requires_https");
  }
  if (mode !== "public" && mode !== "private") throw new Error("invalid_smoke_mode");
  return url;
}

function request(fetchImpl, target, path, method = "GET") {
  return fetchImpl(new URL(path, target), {
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(5_000),
    headers: method === "POST" ? { "content-type": "application/json" } : undefined,
    body: method === "POST" ? "{}" : undefined,
  });
}

function checkRelease(response, expected, path, failures) {
  if (response.headers.get("x-vbtech-release-sha") !== expected.releaseSha) {
    failures.push(`${path} release header mismatch`);
  }
}

function checkHtml(body, response, path, expected, failures) {
  if (!response.headers.get("content-security-policy")) {
    failures.push(`${path} CSP missing`);
  }
  if (!body.includes(`meta name="vbtech-release-sha" content="${expected.releaseSha}"`)) {
    failures.push(`${path} artifact release mismatch`);
  }
  if (!body.includes("vbtech-theme-v1") || !body.includes("data-theme")) {
    failures.push(`${path} theme bootstrap missing`);
  }
}

function checkLandingForm(body, path, expected, failures) {
  const enabled = expected.submissionState === "enabled";
  if (!body.includes(`data-submission-enabled="${String(enabled)}"`)) {
    failures.push(`${path} submission signature mismatch`);
  }
  if (!body.includes(`data-consent-id="${expected.consentId}"`)) {
    failures.push(`${path} consent release mismatch`);
  }
}

export async function runSmoke({ baseUrl, mode, expected, fetchImpl = fetch }) {
  const target = validateTarget(baseUrl, mode);
  const failures = [];
  let checks = 0;

  for (const path of HTML_ROUTES) {
    const response = await request(fetchImpl, target, path);
    checks += 1;
    if (response.status !== 200) failures.push(`${path} expected 200, received ${response.status}`);
    checkRelease(response, expected, path, failures);
    const body = await response.text();
    checkHtml(body, response, path, expected, failures);
    if (path === "/" || path === "/en/") {
      checkLandingForm(body, path, expected, failures);
    }
  }

  for (const path of TEXT_ROUTES) {
    const response = await request(fetchImpl, target, path);
    checks += 1;
    if (response.status !== 200) failures.push(`${path} expected 200, received ${response.status}`);
    checkRelease(response, expected, path, failures);
    await response.arrayBuffer();
  }

  const missing = await request(fetchImpl, target, "/not-a-route");
  checks += 1;
  if (missing.status !== 404) failures.push(`/not-a-route expected 404, received ${missing.status}`);
  checkRelease(missing, expected, "/not-a-route", failures);
  checkHtml(await missing.text(), missing, "/not-a-route", expected, failures);

  for (const [method, path] of [
    ["GET", "/api/contact"],
    ["POST", "/api/contact/"],
    ["POST", "/api/other"],
  ]) {
    const response = await request(fetchImpl, target, path, method);
    checks += 1;
    if (response.status !== 404 && response.status !== 405) {
      failures.push(`${method} ${path} must be rejected, received ${response.status}`);
    }
    checkRelease(response, expected, `${method} ${path}`, failures);
    await response.arrayBuffer();
  }

  const exactPost = await request(fetchImpl, target, "/api/contact", "POST");
  checks += 1;
  const enabled = expected.submissionState === "enabled";
  if (enabled && exactPost.status !== 400) {
    failures.push(`POST /api/contact is not routed in enabled mode (${exactPost.status})`);
  }
  if (!enabled && exactPost.status !== 404 && exactPost.status !== 405) {
    failures.push(`POST /api/contact must be rejected in disabled mode (${exactPost.status})`);
  }
  checkRelease(exactPost, expected, "POST /api/contact", failures);
  await exactPost.arrayBuffer();

  if (failures.length > 0) {
    const error = new Error(`smoke_failed: ${failures.join("; ")}`);
    error.failures = failures;
    throw error;
  }
  return Object.freeze({ checks, failures: Object.freeze([]) });
}

import { describe, expect, it, vi } from "vitest";
import { PublicContactError } from "../src/errors.js";
import { createHttpHandler, httpHandler, type YandexHttpEvent } from "../src/http-handler.js";

const request = {
  requestId: "11111111-1111-4111-8111-111111111111",
  locale: "en",
  name: "Vlad",
  contact: "hello@example.com",
  message: "A concrete product problem",
  sourcePath: "/en/",
  consentId: "VBT-PD-02/DRAFT",
  captchaToken: "one-time-token",
  website: "",
};

const event = (overrides: Partial<YandexHttpEvent> = {}): YandexHttpEvent => ({
  httpMethod: "POST",
  path: "/api/contact",
  headers: {
    host: "v-b.tech",
    origin: "https://v-b.tech",
    "content-type": "application/json; charset=utf-8",
  },
  multiValueHeaders: {},
  queryStringParameters: {},
  multiValueQueryStringParameters: {},
  requestContext: { identity: { sourceIp: "192.0.2.1" } },
  body: JSON.stringify(request),
  isBase64Encoded: false,
  ...overrides,
});

const enabledHandler = () => {
  const submit = vi.fn(async () => ({ accepted: true as const, requestId: request.requestId }));
  return { submit, handler: createHttpHandler({ enabled: true, submitContact: submit }) };
};

describe("Yandex HTTP contact boundary", () => {
  it.each([
    ["wrong method", { httpMethod: "GET" }],
    ["trailing slash", { path: "/api/contact/" }],
    ["deeper path", { path: "/api/contact/extra" }],
    ["query map", { queryStringParameters: { debug: "1" } }],
    ["multi query map", { multiValueQueryStringParameters: { debug: ["1"] } }],
  ])("returns the same neutral 404 for %s", async (_label, override) => {
    const { handler, submit } = enabledHandler();
    const response = await handler(event(override));

    expect(response).toEqual({
      statusCode: 404,
      headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
      body: "Not Found",
      isBase64Encoded: false,
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("keeps the exported production handler disabled under the current draft consent without secrets", async () => {
    const previous = process.env.CONTACT_SUBMISSION_ENABLED;
    delete process.env.CONTACT_SUBMISSION_ENABLED;
    try {
      await expect(httpHandler(event())).resolves.toMatchObject({ statusCode: 404, body: "Not Found" });
    } finally {
      if (previous === undefined) delete process.env.CONTACT_SUBMISSION_ENABLED;
      else process.env.CONTACT_SUBMISSION_ENABLED = previous;
    }
  });

  it.each([
    ["wrong host", { headers: { host: "www.v-b.tech", origin: "https://v-b.tech", "content-type": "application/json" } }],
    ["wrong origin", { headers: { host: "v-b.tech", origin: "https://evil.invalid", "content-type": "application/json" } }],
    ["wrong content type", { headers: { host: "v-b.tech", origin: "https://v-b.tech", "content-type": "text/plain" } }],
    ["extra content-type parameter", { headers: { host: "v-b.tech", origin: "https://v-b.tech", "content-type": "application/json; charset=utf-8; profile=x" } }],
    ["duplicate host", { multiValueHeaders: { Host: ["v-b.tech"] } }],
    ["spoofed source only", { requestContext: { identity: { sourceIp: "invalid" } }, headers: { host: "v-b.tech", origin: "https://v-b.tech", "content-type": "application/json", "x-forwarded-for": "192.0.2.1" } }],
  ])("rejects %s before submitting", async (_label, override) => {
    const { handler, submit } = enabledHandler();
    const response = await handler(event(override as Partial<YandexHttpEvent>));

    expect(response.statusCode).toBe(400);
    expect(response.body).toBe('{"error":"invalid_request"}');
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects decoded bodies over 8 KiB with 413", async () => {
    const { handler, submit } = enabledHandler();
    const response = await handler(event({ body: JSON.stringify({ ...request, message: "x".repeat(8_192) }) }));

    expect(response.statusCode).toBe(413);
    expect(response.body).toBe('{"error":"invalid_request"}');
    expect(submit).not.toHaveBeenCalled();
  });

  it("enforces the decoded body limit before origin and host checks", async () => {
    const { handler, submit } = enabledHandler();
    const response = await handler(event({
      headers: { host: "evil.invalid", origin: "https://evil.invalid", "content-type": "application/json" },
      body: "x".repeat(8_193),
    }));

    expect(response.statusCode).toBe(413);
    expect(submit).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid UTF-8", Buffer.from([0xc3, 0x28]).toString("base64")],
    ["non-canonical base64", "eyJ9===junk"],
  ])("strictly rejects %s base64 bodies", async (_label, body) => {
    const { handler, submit } = enabledHandler();
    const response = await handler(event({ body, isBase64Encoded: true }));

    expect(response.statusCode).toBe(400);
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects unknown request fields before submitting", async () => {
    const { handler, submit } = enabledHandler();
    const response = await handler(event({ body: JSON.stringify({ ...request, admin: true }) }));

    expect(response.statusCode).toBe(400);
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects an unpaired surrogate in a non-base64 event body", async () => {
    const { handler, submit } = enabledHandler();
    const response = await handler(event({ body: JSON.stringify(request).replace("Vlad", "\ud800") }));

    expect(response.statusCode).toBe(400);
    expect(submit).not.toHaveBeenCalled();
  });

  it("uses the stable captcha-required response for an absent captcha token", async () => {
    const { handler, submit } = enabledHandler();
    const { captchaToken: _captchaToken, ...withoutCaptcha } = request;
    const response = await handler(event({ body: JSON.stringify(withoutCaptcha) }));

    expect(response.statusCode).toBe(400);
    expect(response.body).toBe('{"error":"captcha_required"}');
    expect(submit).not.toHaveBeenCalled();
  });

  it.each([
    ["consent_revision_changed", 409],
    ["rate_limited", 429],
    ["captcha_rejected", 400],
    ["captcha_unavailable", 503],
    ["temporarily_unavailable", 503],
  ] as const)("returns stable public %s errors without details", async (code, status) => {
    const submit = vi.fn(async () => {
      throw new PublicContactError(code, status);
    });
    const handler = createHttpHandler({ enabled: true, submitContact: submit });

    const response = await handler(event());

    expect(response.statusCode).toBe(status);
    expect(response.body).toBe(`{"error":"${code}"}`);
    expect(response.body).not.toContain("detail");
  });

  it("decodes valid base64 JSON and returns 202 only after submission", async () => {
    const { handler, submit } = enabledHandler();
    const body = Buffer.from(JSON.stringify(request), "utf8").toString("base64");
    const response = await handler(event({ body, isBase64Encoded: true }));

    expect(response).toEqual({
      statusCode: 202,
      headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" },
      body: '{"accepted":true,"requestId":"11111111-1111-4111-8111-111111111111"}',
      isBase64Encoded: false,
    });
    expect(submit).toHaveBeenCalledWith(request, "192.0.2.1");
  });
});

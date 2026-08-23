import { describe, expect, it, vi } from "vitest";
import { CURRENT_CONTACT_CONSENT_ID } from "@vbtech/legal-documents";
import { PublicContactError } from "../src/errors.js";
import {
  createHttpHandler,
  createProductionSubmitLoader,
  httpHandler,
  type YandexHttpEvent,
} from "../src/http-handler.js";

const request = {
  requestId: "11111111-1111-4111-8111-111111111111",
  locale: "en",
  name: "Vlad",
  contact: "hello@example.com",
  message: "A concrete product problem",
  sourcePath: "/en/",
  consentId: CURRENT_CONTACT_CONSENT_ID,
  captchaToken: "one-time-token",
  website: "",
};

const event = (overrides: Partial<YandexHttpEvent> = {}): YandexHttpEvent => ({
  httpMethod: "POST",
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
  it("also accepts the documented empty path when the HTTPS event includes it", async () => {
    const { handler, submit } = enabledHandler();
    const response = await handler(event({ path: "" }));

    expect(response.statusCode).toBe(202);
    expect(submit).toHaveBeenCalledWith(request, "192.0.2.1");
  });

  it("accepts Yandex HTTPS events that mirror each single header in multiValueHeaders", async () => {
    const { handler, submit } = enabledHandler();
    const response = await handler(event({
      multiValueHeaders: {
        Host: ["v-b.tech"],
        Origin: ["https://v-b.tech"],
        "Content-Type": ["application/json; charset=utf-8"],
      },
    }));

    expect(response.statusCode).toBe(202);
    expect(submit).toHaveBeenCalledWith(request, "192.0.2.1");
  });

  it.each([
    ["wrong method", { httpMethod: "GET" }],
    ["null path", { path: null as unknown as string }],
    ["slash path", { path: "/" }],
    ["unstripped public path", { path: "/api/contact" }],
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

  it("keeps the exported production handler disabled when the enable flag is absent", async () => {
    const previous = process.env.CONTACT_SUBMISSION_ENABLED;
    delete process.env.CONTACT_SUBMISSION_ENABLED;
    try {
      await expect(httpHandler(event())).resolves.toMatchObject({ statusCode: 404, body: "Not Found" });
    } finally {
      if (previous === undefined) delete process.env.CONTACT_SUBMISSION_ENABLED;
      else process.env.CONTACT_SUBMISSION_ENABLED = previous;
    }
  });

  it("opens only the exact production route when the flag is true and fails closed without runtime secrets", async () => {
    const previous = process.env.CONTACT_SUBMISSION_ENABLED;
    process.env.CONTACT_SUBMISSION_ENABLED = "true";
    try {
      const responses = await Promise.all([
        httpHandler(event()),
        httpHandler(event({ path: "/not-contact" })),
        httpHandler(event({ httpMethod: "GET" })),
      ]);

      expect(responses).toEqual([
        {
          statusCode: 503,
          headers: {
            "cache-control": "no-store",
            "content-type": "application/json; charset=utf-8",
          },
          body: '{"error":"temporarily_unavailable"}',
          isBase64Encoded: false,
        },
        {
          statusCode: 404,
          headers: {
            "cache-control": "no-store",
            "content-type": "text/plain; charset=utf-8",
          },
          body: "Not Found",
          isBase64Encoded: false,
        },
        {
          statusCode: 404,
          headers: {
            "cache-control": "no-store",
            "content-type": "text/plain; charset=utf-8",
          },
          body: "Not Found",
          isBase64Encoded: false,
        },
      ]);
    } finally {
      if (previous === undefined) delete process.env.CONTACT_SUBMISSION_ENABLED;
      else process.env.CONTACT_SUBMISSION_ENABLED = previous;
    }
  });

  it("asserts legal readiness before composing production with exactly a 1000 ms captcha timeout", async () => {
    const order: string[] = [];
    let receivedTimeout: number | undefined;
    const submit = vi.fn(async () => ({ accepted: true as const, requestId: request.requestId }));
    const load = createProductionSubmitLoader({
      assertPublishable: () => { order.push("legal"); },
      loadConfig: () => {
        order.push("config");
        return {
          databaseUrl: "postgresql://contact.invalid/contact",
          outboxEncryptionKey: Buffer.alloc(32, 1),
          rateLimitHmacKey: Buffer.alloc(32, 2),
          captchaSecret: "server-secret",
        };
      },
      compose: async (_config, timeoutMs) => {
        order.push("compose");
        receivedTimeout = timeoutMs;
        return submit;
      },
    });

    await expect(load()).resolves.toBe(submit);
    expect(order).toEqual(["legal", "config", "compose"]);
    expect(receivedTimeout).toBe(1_000);
  });

  it("does not read secrets or construct adapters when production legal readiness fails", async () => {
    const loadConfig = vi.fn(() => { throw new Error("secrets_were_read"); });
    const compose = vi.fn(async () => { throw new Error("adapters_were_constructed"); });
    const load = createProductionSubmitLoader({
      assertPublishable: () => { throw new Error("draft_consent"); },
      loadConfig,
      compose,
    });

    await expect(load()).rejects.toThrow("draft_consent");
    expect(loadConfig).not.toHaveBeenCalled();
    expect(compose).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong host", { headers: { host: "www.v-b.tech", origin: "https://v-b.tech", "content-type": "application/json" } }],
    ["wrong origin", { headers: { host: "v-b.tech", origin: "https://evil.invalid", "content-type": "application/json" } }],
    ["wrong content type", { headers: { host: "v-b.tech", origin: "https://v-b.tech", "content-type": "text/plain" } }],
    ["extra content-type parameter", { headers: { host: "v-b.tech", origin: "https://v-b.tech", "content-type": "application/json; charset=utf-8; profile=x" } }],
    ["conflicting mirrored host", { multiValueHeaders: { Host: ["evil.invalid"] } }],
    ["repeated host", { multiValueHeaders: { Host: ["v-b.tech", "v-b.tech"] } }],
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

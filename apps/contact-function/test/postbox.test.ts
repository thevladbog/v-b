import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PostboxDeliveryError,
  YandexPostbox,
  type PostboxSendInput,
} from "../src/postbox.js";

const renderedEmail = {
  subject: "Новое обращение с v-b.tech",
  html: "<p>Привет, мир</p>",
  text: "Привет, мир",
};

const sendInput = (overrides: Partial<PostboxSendInput> = {}): PostboxSendInput => ({
  outboxId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  recipient: "hello@v-b.tech",
  replyTo: "visitor@example.com",
  createdAt: new Date("2026-08-20T12:00:00.000Z"),
  email: renderedEmail,
  ...overrides,
});

describe("Yandex Postbox adapter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Catches a provider-boundary break that sends Simple content, omits Reply-To, or loses the stable outbox Message-ID.
  it("sends a bounded standards-compliant Raw MIME message with exact routing", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    let tokenReads = 0;
    const postbox = new YandexPostbox({
      getIamToken: async () => {
        tokenReads += 1;
        return "short-lived-iam-token";
      },
      fetchImpl: async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} });
        return new Response(JSON.stringify({ MessageId: "provider-message-123" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    await expect(postbox.send(sendInput())).resolves.toEqual({
      providerMessageId: "provider-message-123",
    });

    expect(tokenReads).toBe(1);
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.url).toBe("https://postbox.cloud.yandex.net/v2/email/outbound-emails");
    expect(request.init.method).toBe("POST");
    const headers = new Headers(request.init.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-yacloud-subjecttoken")).toBe("short-lived-iam-token");

    const body = JSON.parse(String(request.init.body)) as {
      FromEmailAddress: string;
      Destination: { ToAddresses: string[] };
      Content: { Raw: { Data: string } };
    };
    expect(body.FromEmailAddress).toBe("hello@v-b.tech");
    expect(body.Destination).toEqual({ ToAddresses: ["hello@v-b.tech"] });
    expect(body.Content).toEqual({ Raw: { Data: expect.any(String) } });
    expect(body.Content).not.toHaveProperty("Simple");

    const mime = Buffer.from(body.Content.Raw.Data, "base64").toString("utf8");
    expect(mime).toContain('From: "v-b.tech" <hello@v-b.tech>\r\n');
    expect(mime).toContain("To: hello@v-b.tech\r\n");
    expect(mime).toContain("Reply-To: visitor@example.com\r\n");
    expect(mime).toContain(
      "Message-ID: <outbox-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@v-b.tech>\r\n",
    );
    expect(mime).toContain("Date: Thu, 20 Aug 2026 12:00:00 GMT\r\n");
    expect(mime).toContain("Subject: =?UTF-8?B?");
    expect(mime).toContain("Content-Type: multipart/alternative;");
    expect(mime).not.toMatch(/(^|[^\r])\n/);
    expect(Buffer.byteLength(mime, "utf8")).toBeLessThanOrEqual(200_000);
  });

  // Catches credential leakage through eager/static token handling and malformed authorization headers.
  it("requires a non-empty bounded IAM token lazily before the provider call", async () => {
    let fetchCalls = 0;
    const postbox = new YandexPostbox({
      getIamToken: async () => "\n",
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response(null, { status: 200 });
      },
    });

    await expect(postbox.send(sendInput())).rejects.toMatchObject({
      name: "PostboxDeliveryError",
      disposition: "transient",
      safeCode: "postbox_auth_unavailable",
    });
    expect(fetchCalls).toBe(0);
  });

  // Catches a prepared credential lingering when the database lease is lost before network delivery.
  it("discards a prepared IAM token when the provider call will not run", async () => {
    let tokenReads = 0;
    let fetchCalls = 0;
    const postbox = new YandexPostbox({
      getIamToken: async () => {
        tokenReads += 1;
        return "short-lived-iam-token";
      },
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response(null, { status: 200 });
      },
    });

    const prepared = await postbox.prepare(sendInput());
    prepared.discard();
    await expect(prepared.send()).rejects.toMatchObject({
      disposition: "transient",
      safeCode: "postbox_auth_unavailable",
    });
    expect(tokenReads).toBe(1);
    expect(fetchCalls).toBe(0);
  });

  // Catches a retry break that permanently drops provider/network outages.
  it.each([
    ["network", async () => Promise.reject(new TypeError("socket failed"))],
    ["rate limit", async () => new Response("do not read", { status: 429 })],
    ["provider error", async () => new Response("do not read", { status: 503 })],
  ])("classifies %s failures as transient", async (_label, fetchImpl) => {
    const postbox = new YandexPostbox({
      getIamToken: async () => "short-lived-iam-token",
      fetchImpl,
    });

    await expect(postbox.send(sendInput())).rejects.toMatchObject({
      name: "PostboxDeliveryError",
      disposition: "transient",
    });
  });

  // Catches a hung provider call outliving the lease and function invocation indefinitely.
  it("turns a provider timeout into a transient failure", async () => {
    vi.useFakeTimers();
    const providerSignals: AbortSignal[] = [];
    const postbox = new YandexPostbox({
      getIamToken: async () => "short-lived-iam-token",
      fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal;
        providerSignals.push(signal);
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
    });

    const sending = expect(postbox.send(sendInput())).rejects.toMatchObject({
      disposition: "transient",
      safeCode: "postbox_unavailable",
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await sending;
    expect(providerSignals[0]?.aborted).toBe(true);
  });

  // Catches a provider that returns 200 headers but stalls forever while streaming the success body.
  it("keeps the timeout active until the bounded success body is consumed", async () => {
    vi.useFakeTimers();
    const postbox = new YandexPostbox({
      getIamToken: async () => "short-lived-iam-token",
      fetchImpl: async (_url, init) => {
        const signal = init?.signal as AbortSignal;
        return new Response(new ReadableStream({
          start(controller) {
            signal.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
          },
        }), { status: 200 });
      },
    });

    const outcome = Promise.race([
      postbox.send(sendInput()).then(
        () => "unexpected-success",
        (error: PostboxDeliveryError) => `${error.disposition}:${error.safeCode}`,
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve("still-hanging"), 11_000)),
    ]);
    await vi.advanceTimersByTimeAsync(11_000);

    await expect(outcome).resolves.toBe("transient:postbox_unavailable");
  });

  // Catches irreversible erasure when provider account/configuration errors share HTTP 400/404 with message rejection.
  it.each([
    [400, "BadRequestException"],
    [400, "AccountSuspendedException"],
    [400, "SendingPausedException"],
    [400, "MailFromDomainNotVerifiedException"],
    [400, "LimitExceededException"],
    [404, "NotFoundException"],
  ])("classifies HTTP %s %s as recoverable without exposing its message", async (status, Code) => {
    const postbox = new YandexPostbox({
      getIamToken: async () => "short-lived-iam-token",
      fetchImpl: async () => new Response(JSON.stringify({
        Code,
        message: "visitor@example.com and rendered provider details must not escape",
      }), { status }),
    });

    const error = await postbox.send(sendInput()).catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      name: "PostboxDeliveryError",
      disposition: "transient",
      safeCode: "postbox_unavailable",
    });
    expect(JSON.stringify(error)).not.toContain("visitor@example.com");
    expect(String(error)).not.toContain("rendered provider details");
  });

  // Catches a poison-message loop while restricting terminal classification to the provider's exact documented code.
  it("classifies exact MessageRejected as terminal without retaining the provider message", async () => {
    const postbox = new YandexPostbox({
      getIamToken: async () => "short-lived-iam-token",
      fetchImpl: async () => new Response(JSON.stringify({
        Code: "MessageRejected",
        message: "visitor@example.com and provider details",
      }), { status: 400 }),
    });

    const error = await postbox.send(sendInput()).catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      name: "PostboxDeliveryError",
      disposition: "terminal",
      safeCode: "postbox_message_rejected",
    });
    expect(JSON.stringify(error)).not.toContain("visitor@example.com");
    expect(String(error)).not.toContain("provider details");
  });

  // Catches malformed/unknown provider errors being mistaken for visitor-content poison.
  it.each([
    ["malformed JSON", "{"],
    ["unknown code", JSON.stringify({ Code: "UnexpectedProviderCode", message: "private" })],
    ["missing code", JSON.stringify({ message: "private" })],
    ["oversized", JSON.stringify({ Code: "MessageRejected", message: "x".repeat(8_192) })],
  ])("keeps a %s error response recoverable", async (_label, body) => {
    const postbox = new YandexPostbox({
      getIamToken: async () => "short-lived-iam-token",
      fetchImpl: async () => new Response(body, { status: 400 }),
    });

    await expect(postbox.send(sendInput())).rejects.toMatchObject({
      disposition: "transient",
    });
  });

  // Catches non-UTF-8 provider bytes bypassing the bounded operational-error path.
  it("keeps a non-UTF-8 error response recoverable", async () => {
    const postbox = new YandexPostbox({
      getIamToken: async () => "short-lived-iam-token",
      fetchImpl: async () => new Response(new Uint8Array([0xff]), { status: 400 }),
    });

    await expect(postbox.send(sendInput())).rejects.toMatchObject({
      disposition: "transient",
      safeCode: "postbox_response_invalid",
    });
  });

  // Catches retained Undici response streams after bounded non-200 inspection.
  it("cancels an oversized non-200 response stream before clearing its deadline", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(8_192));
      },
      cancel() {
        cancelled = true;
      },
    });
    const postbox = new YandexPostbox({
      getIamToken: async () => "short-lived-iam-token",
      fetchImpl: async () => new Response(body, { status: 400 }),
    });

    await expect(postbox.send(sendInput())).rejects.toMatchObject({
      disposition: "transient",
      safeCode: "postbox_response_invalid",
    });
    expect(cancelled).toBe(true);
  });

  // Catches unbounded/malformed success parsing that stores attacker-controlled provider output.
  it.each([
    ["empty", "{}"],
    ["control character", JSON.stringify({ MessageId: "bad\nidentifier" })],
    ["oversized", JSON.stringify({ MessageId: "x".repeat(513) })],
    ["extra-field", JSON.stringify({ MessageId: "provider-message-123", extra: true })],
  ])("rejects a %s success response as transient", async (_label, body) => {
    const postbox = new YandexPostbox({
      getIamToken: async () => "short-lived-iam-token",
      fetchImpl: async () => new Response(body, { status: 200 }),
    });

    await expect(postbox.send(sendInput())).rejects.toMatchObject({
      name: "PostboxDeliveryError",
      disposition: "transient",
      safeCode: "postbox_response_invalid",
    });
  });

  // Catches an accidental error shape that could expose a provider body, MIME, token, or visitor fields to logs.
  it("exposes only a bounded safe classification on delivery errors", () => {
    const error = new PostboxDeliveryError("transient", "postbox_unavailable");
    expect(Object.keys(error).sort()).toEqual(["disposition", "name", "safeCode"]);
    expect(error.message).toBe("postbox_unavailable");
  });
});

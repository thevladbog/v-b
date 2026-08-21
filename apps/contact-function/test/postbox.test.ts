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

  // Catches a poison-message loop that retries documented request/address failures forever.
  it.each([400, 404])("classifies documented HTTP %s rejection as terminal without reading its body", async (status) => {
    const postbox = new YandexPostbox({
      getIamToken: async () => "short-lived-iam-token",
      fetchImpl: async () => ({
        status,
        get body() {
          throw new Error("provider error body must stay unread");
        },
      } as unknown as Response),
    });

    await expect(postbox.send(sendInput())).rejects.toMatchObject({
      name: "PostboxDeliveryError",
      disposition: "terminal",
      safeCode: "postbox_message_rejected",
    });
  });

  // Catches unbounded/malformed success parsing that stores attacker-controlled provider output.
  it.each([
    ["empty", "{}"],
    ["control character", JSON.stringify({ MessageId: "bad\nidentifier" })],
    ["oversized", JSON.stringify({ MessageId: "x".repeat(513) })],
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

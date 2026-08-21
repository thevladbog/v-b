import { describe, expect, it, vi } from "vitest";
import { PublicContactError } from "../src/errors.js";
import { SmartCaptcha } from "../src/captcha.js";

const expectCaptchaError = async (promise: Promise<unknown>, code: string) => {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(PublicContactError);
  expect(error).toMatchObject({ code });
};

describe("SmartCaptcha validation", () => {
  it("posts exactly the official form fields and accepts only the expected host", async () => {
    const fetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ status: "ok", message: "", host: "v-b.tech" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const captcha = new SmartCaptcha({ secret: "server-secret", fetch, timeoutMs: 1_000 });

    await expect(captcha.assertHuman("one-time-token", "2001:db8::1")).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(init).toBeDefined();
    expect(url).toBe("https://smartcaptcha.cloud.yandex.ru/validate");
    expect(init!.method).toBe("POST");
    expect(init!.headers).toEqual({ "content-type": "application/x-www-form-urlencoded" });
    expect(String(init!.body)).toBe("secret=server-secret&token=one-time-token&ip=2001%3Adb8%3A%3A1");
    expect(init!.signal).toBeInstanceOf(AbortSignal);
  });

  it("uses a hard timeout even when fetch ignores abort", async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi.fn(() => new Promise<Response>(() => undefined));
      const captcha = new SmartCaptcha({ secret: "server-secret", fetch, timeoutMs: 1_000 });
      const result = captcha.assertHuman("one-time-token", "192.0.2.1");
      const assertion = expectCaptchaError(result, "captcha_unavailable");

      await vi.advanceTimersByTimeAsync(1_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the hard timeout active while a provider body stalls", async () => {
    vi.useFakeTimers();
    try {
      const observed: { signal?: AbortSignal } = {};
      const fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        observed.signal = init?.signal as AbortSignal;
        return new Response(new ReadableStream({ start() {} }), { status: 200 });
      });
      const captcha = new SmartCaptcha({ secret: "server-secret", fetch, timeoutMs: 1_000 });
      const assertion = expectCaptchaError(
        captcha.assertHuman("one-time-token", "192.0.2.1"),
        "captcha_unavailable",
      );

      await vi.advanceTimersByTimeAsync(1_000);
      await assertion;
      expect(observed.signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["non-200", new Response("{}", { status: 503 })],
    ["malformed JSON", new Response("not-json", { status: 200 })],
    ["empty response", new Response("", { status: 200 })],
    ["wrong host", new Response(JSON.stringify({ status: "ok", message: "", host: "evil.invalid" }), { status: 200 })],
    ["oversized response", new Response("x".repeat(16_385), { status: 200 })],
  ])("fails closed on %s", async (_label, response) => {
    const captcha = new SmartCaptcha({
      secret: "server-secret",
      fetch: async () => response,
      timeoutMs: 1_000,
    });

    await expectCaptchaError(
      captcha.assertHuman("one-time-token", "192.0.2.1"),
      "captcha_unavailable",
    );
  });

  it("treats a well-formed provider rejection as captcha rejection without using message text", async () => {
    const captcha = new SmartCaptcha({
      secret: "server-secret",
      fetch: async () =>
        new Response(
          JSON.stringify({ status: "failed", message: "any future localized text" }),
          { status: 200 },
        ),
      timeoutMs: 1_000,
    });

    await expectCaptchaError(
      captcha.assertHuman("one-time-token", "192.0.2.1"),
      "captcha_rejected",
    );
  });

  it("rejects a missing token without contacting the provider", async () => {
    const fetch = vi.fn();
    const captcha = new SmartCaptcha({ secret: "server-secret", fetch, timeoutMs: 1_000 });

    await expectCaptchaError(captcha.assertHuman("", "192.0.2.1"), "captcha_required");
    expect(fetch).not.toHaveBeenCalled();
  });
});

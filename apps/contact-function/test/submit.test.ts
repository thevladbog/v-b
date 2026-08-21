import { describe, expect, it, vi } from "vitest";
import type { ContactRequest } from "@vbtech/contracts";
import { PublicContactError } from "../src/errors.js";
import { createSubmitContact } from "../src/submit.js";

const validRequest: ContactRequest = {
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

const makeDependencies = (enabled = true) => ({
  enabled,
  limiter: { assertAllowed: vi.fn(async () => undefined) },
  captcha: { assertHuman: vi.fn(async () => undefined) },
  repository: { accept: vi.fn(async () => "created" as const) },
});

const expectPublicError = async (
  promise: Promise<unknown>,
  code: string,
  status: number,
) => {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(PublicContactError);
  expect(error).toMatchObject({ code, status });
};

describe("contact submission service", () => {
  it("fails at the disabled gate before touching request dependencies", async () => {
    const dependencies = makeDependencies(false);
    const submit = createSubmitContact(dependencies);

    await expectPublicError(
      submit(validRequest, "192.0.2.1"),
      "submission_disabled",
      404,
    );
    expect(dependencies.limiter.assertAllowed).not.toHaveBeenCalled();
    expect(dependencies.captcha.assertHuman).not.toHaveBeenCalled();
    expect(dependencies.repository.accept).not.toHaveBeenCalled();
  });

  it("rejects a stale consent before honeypot, rate limit, captcha, or enqueue", async () => {
    const dependencies = makeDependencies();
    const submit = createSubmitContact(dependencies);

    await expectPublicError(
      submit({ ...validRequest, consentId: "VBT-PD-02/obsolete", website: "bot" }, "192.0.2.1"),
      "consent_revision_changed",
      409,
    );
    expect(dependencies.limiter.assertAllowed).not.toHaveBeenCalled();
    expect(dependencies.captcha.assertHuman).not.toHaveBeenCalled();
    expect(dependencies.repository.accept).not.toHaveBeenCalled();
  });

  it("rejects a filled honeypot before rate limit, captcha, or enqueue", async () => {
    const dependencies = makeDependencies();
    const submit = createSubmitContact(dependencies);

    await expectPublicError(
      submit({ ...validRequest, website: "https://spam.invalid" }, "192.0.2.1"),
      "invalid_request",
      400,
    );
    expect(dependencies.limiter.assertAllowed).not.toHaveBeenCalled();
    expect(dependencies.captcha.assertHuman).not.toHaveBeenCalled();
    expect(dependencies.repository.accept).not.toHaveBeenCalled();
  });

  it("stops after a rate-limit rejection", async () => {
    const dependencies = makeDependencies();
    dependencies.limiter.assertAllowed.mockRejectedValue(
      new PublicContactError("rate_limited", 429),
    );
    const submit = createSubmitContact(dependencies);

    await expectPublicError(submit(validRequest, "2001:db8::1"), "rate_limited", 429);
    expect(dependencies.captcha.assertHuman).not.toHaveBeenCalled();
    expect(dependencies.repository.accept).not.toHaveBeenCalled();
  });

  it("stops after a captcha rejection", async () => {
    const dependencies = makeDependencies();
    dependencies.captcha.assertHuman.mockRejectedValue(
      new PublicContactError("captcha_rejected", 400),
    );
    const submit = createSubmitContact(dependencies);

    await expectPublicError(submit(validRequest, "192.0.2.1"), "captcha_rejected", 400);
    expect(dependencies.repository.accept).not.toHaveBeenCalled();
  });

  it("maps repository failures to a content-free public unavailable error", async () => {
    const dependencies = makeDependencies();
    dependencies.repository.accept.mockRejectedValue(new Error("database detail"));
    const submit = createSubmitContact(dependencies);

    await expectPublicError(
      submit(validRequest, "192.0.2.1"),
      "temporarily_unavailable",
      503,
    );
  });

  it("returns 202 response data only after durable acceptance resolves", async () => {
    const dependencies = makeDependencies();
    const submit = createSubmitContact(dependencies);

    await expect(submit(validRequest, "192.0.2.1")).resolves.toEqual({
      accepted: true,
      requestId: "11111111-1111-4111-8111-111111111111",
    });
    expect(dependencies.limiter.assertAllowed).toHaveBeenCalledWith("192.0.2.1");
    expect(dependencies.captcha.assertHuman).toHaveBeenCalledWith(
      "one-time-token",
      "192.0.2.1",
    );
    expect(dependencies.repository.accept).toHaveBeenCalledWith(validRequest);
  });
});

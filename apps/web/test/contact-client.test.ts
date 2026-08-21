import { CURRENT_CONTACT_CONSENT_ID } from "@vbtech/legal-documents";
import { describe, expect, it, vi } from "vitest";
import {
  CONTACT_SUBMISSION_COPY,
  submitContactDraft,
  type ContactClientDraft,
} from "../src/lib/contact-client.js";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

const draft: ContactClientDraft = {
  locale: "en",
  name: "  Vlad  ",
  contact: "  PERSON@Example.COM  ",
  message: "  A concrete product problem.  ",
  sourcePath: "/en/",
  consentAccepted: true,
  website: "",
};

const jsonResponse = (status: number, value: unknown) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

describe("contact client boundary", () => {
  it("posts the exact shared contract with normalized fields and the current consent identity", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];

    const result = await submitContactDraft(draft, {
      requestId: undefined,
      createRequestId: () => firstId,
      captchaToken: "one-time-token",
      fetch: async (input, init) => {
        requests.push({ input, init });
        return jsonResponse(202, { accepted: true, requestId: firstId });
      },
    });

    expect(result).toEqual({ accepted: true, requestId: firstId });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toBe("/api/contact");
    expect(requests[0]?.init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
    });
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      requestId: firstId,
      locale: "en",
      name: "Vlad",
      contact: "person@example.com",
      message: "A concrete product problem.",
      sourcePath: "/en/",
      consentId: CURRENT_CONTACT_CONSENT_ID,
      captchaToken: "one-time-token",
      website: "",
    });
  });

  it("reuses the supplied request identity after a safe server failure", async () => {
    const ids: string[] = [];
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      ids.push((JSON.parse(String(init?.body)) as { requestId: string }).requestId);
      return jsonResponse(503, { error: "temporarily_unavailable" });
    });

    const first = await submitContactDraft(draft, {
      createRequestId: () => firstId,
      captchaToken: "token-1",
      fetch,
    });
    const retry = await submitContactDraft(draft, {
      requestId: first.requestId,
      createRequestId: () => secondId,
      captchaToken: "token-2",
      fetch,
    });

    expect(first).toEqual({ accepted: false, code: "temporarily_unavailable", requestId: firstId });
    expect(retry).toEqual({ accepted: false, code: "temporarily_unavailable", requestId: firstId });
    expect(ids).toEqual([firstId, firstId]);
  });

  it("posts, echoes, and returns the canonical shared-schema UUID after uppercase input", async () => {
    const uppercaseId = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
    const canonicalId = uppercaseId.toLowerCase();
    const bodies: string[] = [];

    const accepted = await submitContactDraft(draft, {
      requestId: uppercaseId,
      createRequestId: () => secondId,
      captchaToken: "token-1",
      fetch: async (_input, init) => {
        bodies.push((JSON.parse(String(init?.body)) as { requestId: string }).requestId);
        return jsonResponse(202, { accepted: true, requestId: canonicalId });
      },
    });
    const recoverable = await submitContactDraft(draft, {
      requestId: uppercaseId,
      createRequestId: () => secondId,
      captchaToken: "token-2",
      fetch: async (_input, init) => {
        bodies.push((JSON.parse(String(init?.body)) as { requestId: string }).requestId);
        return jsonResponse(503, { error: "temporarily_unavailable" });
      },
    });

    expect(bodies).toEqual([canonicalId, canonicalId]);
    expect(accepted).toEqual({ accepted: true, requestId: canonicalId });
    expect(recoverable).toEqual({ accepted: false, code: "temporarily_unavailable", requestId: canonicalId });
  });

  it.each([
    [400, "invalid_request"],
    [400, "captcha_required"],
    [400, "captcha_rejected"],
    [409, "consent_revision_changed"],
    [429, "rate_limited"],
    [404, "submission_disabled"],
    [503, "captcha_unavailable"],
    [503, "temporarily_unavailable"],
  ] as const)("accepts only the shared %i %s public response", async (status, code) => {
    const result = await submitContactDraft(draft, {
      requestId: firstId,
      createRequestId: () => secondId,
      captchaToken: "token",
      fetch: async () => jsonResponse(status, { error: code }),
    });

    expect(result).toEqual({ accepted: false, code, requestId: firstId });
  });

  it.each([
    ["extra accepted field", jsonResponse(202, { accepted: true, requestId: firstId, extra: true })],
    ["wrong accepted request identity", jsonResponse(202, { accepted: true, requestId: secondId })],
    ["extra error field", jsonResponse(429, { error: "rate_limited", retryAfter: 10 })],
    ["wrong status for a stable error", jsonResponse(400, { error: "rate_limited" })],
    ["malformed JSON", new Response("{", { status: 503, headers: { "content-type": "application/json" } })],
    ["wrong content type", new Response("{}", { status: 503, headers: { "content-type": "text/plain" } })],
    ["oversized response", new Response(`{"error":"${"x".repeat(1_100)}"}`, { status: 503, headers: { "content-type": "application/json" } })],
  ])("maps a %s response to a bounded temporary failure", async (_name, response) => {
    const result = await submitContactDraft(draft, {
      requestId: firstId,
      createRequestId: () => secondId,
      captchaToken: "token",
      fetch: async () => response,
    });

    expect(result).toEqual({ accepted: false, code: "temporarily_unavailable", requestId: firstId });
  });

  it("maps an aborted or failed transport to a retry-safe temporary failure", async () => {
    const result = await submitContactDraft(draft, {
      requestId: firstId,
      createRequestId: () => secondId,
      captchaToken: "token",
      fetch: async () => { throw new DOMException("aborted", "AbortError"); },
    });

    expect(result).toEqual({ accepted: false, code: "temporarily_unavailable", requestId: firstId });
  });

  it("rejects an invalid local draft through the shared schema without making a request", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const result = await submitContactDraft({ ...draft, contact: "not-a-contact" }, {
      requestId: firstId,
      createRequestId: () => secondId,
      captchaToken: "token",
      fetch,
    });

    expect(result).toEqual({ accepted: false, code: "invalid_request", requestId: firstId });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("provides complete stable RU and EN copy for every public state", () => {
    expect(CONTACT_SUBMISSION_COPY.ru.accepted).toMatch(/получено/i);
    expect(CONTACT_SUBMISSION_COPY.en.accepted).toMatch(/received/i);
    expect(Object.keys(CONTACT_SUBMISSION_COPY.ru.errors)).toEqual(Object.keys(CONTACT_SUBMISSION_COPY.en.errors));
    expect(CONTACT_SUBMISSION_COPY.ru.errors.consent_revision_changed).toMatch(/обнов/i);
    expect(CONTACT_SUBMISSION_COPY.en.errors.consent_revision_changed).toMatch(/refresh/i);
  });
});

import { readFile } from "node:fs/promises";
import { contactRequestSchema } from "@vbtech/contracts";
import { renderContactConfirmation, renderContactNotification } from "@vbtech/email";
import { CURRENT_CONTACT_CONSENT_ID } from "@vbtech/legal-documents";
import { createSubmitContact } from "@vbtech/contact-function";
import { describe, expect, it, vi } from "vitest";
import { submitContactDraft } from "../src/lib/contact-client.js";

const requestId = "11111111-1111-4111-8111-111111111111";
const request = {
  requestId,
  locale: "en",
  name: "Vlad",
  contact: "person@example.com",
  message: "A project enquiry.",
  sourcePath: "/en/",
  consentId: CURRENT_CONTACT_CONSENT_ID,
  captchaToken: "token",
  website: "",
} as const;

describe("contact consent identity parity", () => {
  it("binds built HTML, browser payload, function validation, and both email renderers to one imported identity", async () => {
    const html = await readFile(new URL("../dist/en/index.html", import.meta.url), "utf8");
    const builtIdentity = html.match(/data-consent-id="([^"]+)"/)?.[1];
    expect(builtIdentity).toBe(CURRENT_CONTACT_CONSENT_ID);

    let clientPayload: unknown;
    await submitContactDraft({
      locale: "en",
      name: request.name,
      contact: request.contact,
      message: request.message,
      sourcePath: request.sourcePath,
      consentAccepted: true,
      website: "",
    }, {
      requestId,
      createRequestId: () => requestId,
      captchaToken: request.captchaToken,
      fetch: async (_input, init) => {
        clientPayload = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ accepted: true, requestId }), {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      },
    });
    expect(contactRequestSchema.parse(clientPayload).consentId).toBe(CURRENT_CONTACT_CONSENT_ID);

    const repository = { accept: vi.fn(async () => undefined) };
    const submit = createSubmitContact({
      enabled: true,
      limiter: { assertAllowed: async () => undefined },
      captcha: { assertHuman: async () => undefined },
      repository,
    });
    await expect(submit(contactRequestSchema.parse(request), "192.0.2.1")).resolves.toEqual({
      accepted: true,
      requestId,
    });
    await expect(submit(contactRequestSchema.parse({ ...request, consentId: "VBT-PD-02/STALE" }), "192.0.2.1"))
      .rejects.toMatchObject({ code: "consent_revision_changed" });

    const emailInput = { ...request, receivedAt: new Date("2026-08-20T12:00:00.000Z") };
    await expect(renderContactNotification(emailInput)).resolves.toMatchObject({ subject: expect.any(String) });
    await expect(renderContactConfirmation(emailInput)).resolves.toMatchObject({ subject: expect.any(String) });
    await expect(renderContactNotification({ ...emailInput, consentId: "VBT-PD-02/STALE" })).rejects.toThrow(/consent/i);
    await expect(renderContactConfirmation({ ...emailInput, consentId: "VBT-PD-02/STALE" })).rejects.toThrow(/consent/i);
  });
});

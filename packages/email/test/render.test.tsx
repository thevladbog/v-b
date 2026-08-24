import { describe, expect, it } from "vitest";
import {
  renderContactConfirmation,
  renderContactNotification,
} from "../src/index.js";
import { CURRENT_CONTACT_CONSENT_ID } from "@vbtech/legal-documents";

const requestId = "11111111-1111-4111-8111-111111111111";
const receivedAt = new Date("2026-08-20T12:00:00Z");
const message = "Build the product safely.";

describe("contact notification rendering", () => {
  // Catches a production break that sends unescaped visitor text or omits an approved operational field from the internal notification.
  it("renders the English notification with escaped user content and all approved fields", async () => {
    const rendered = await renderContactNotification({
      locale: "en",
      requestId,
      receivedAt,
      sourcePath: "/en/",
      consentId: CURRENT_CONTACT_CONSENT_ID,
      name: '<Vlad & "team">',
      contact: "hello@example.com",
      message,
    });

    expect(rendered.subject).toBe("New v-b.tech enquiry — hello@example.com");
    expect(rendered.html).toContain('alt="v-b.tech"');
    expect(rendered.html).toContain('src="https://v-b.tech/assets/vb-wordmark-email.png"');
    expect(rendered.html).toContain("&lt;Vlad &amp; &quot;team&quot;&gt;");
    expect(rendered.html).toContain("Build the product safely.");
    expect(rendered.html).toContain(CURRENT_CONTACT_CONSENT_ID);
    expect(rendered.html).not.toContain("<script");
    expect(
      [...rendered.html.matchAll(/(?:href|src)="(https?:\/\/[^"]+)"/g)].map(
        (match) => match[1],
      ),
    ).toEqual(["https://v-b.tech/assets/vb-wordmark-email.png"]);
    expect(rendered.text).not.toContain("ready to review");
    expect(rendered.text).toContain("11111111-1111-4111-8111-111111111111");
    expect(rendered.text).toContain("2026-08-20T12:00:00.000Z");
    expect(rendered.text).toContain("/en/");
    expect(rendered.text).toContain("hello@example.com");
    expect(rendered).toMatchSnapshot();
  });

  // Catches a production break that routes a Russian request through English subject or body copy.
  it("renders Russian notification copy independently from English", async () => {
    const rendered = await renderContactNotification({
      locale: "ru",
      requestId,
      receivedAt,
      sourcePath: "/",
      consentId: CURRENT_CONTACT_CONSENT_ID,
      name: "Влад",
      contact: "@thevladbog",
      message,
    });

    expect(rendered.subject).toBe("Новое обращение с v-b.tech — @thevladbog");
    expect(rendered.text).toContain("Новое обращение");
    expect(rendered.text).not.toContain("готово к просмотру");
    expect(rendered.text).toContain("@thevladbog");
    expect(rendered.text).toContain(
      "v-b.tech · Продуктовая инженерия для систем, которые должны работать.",
    );
  });

  // Catches a production break that lets visitor values alter mail headers through the render boundary.
  it("rejects control characters before visitor contact reaches the notification subject", async () => {
    await expect(
      renderContactNotification({
        locale: "en",
        requestId,
        receivedAt,
        sourcePath: "/en/",
        consentId: CURRENT_CONTACT_CONSENT_ID,
        name: "Vlad",
        contact: "hello@example.com\r\nBcc: attacker@example.com",
        message: "Hello",
      }),
    ).rejects.toThrow(/contact/i);
  });
});

describe("visitor confirmation rendering", () => {
  // Catches a production break that exposes the private enquiry body or omits the visitor's correlation and reply routes.
  it("renders an email-only English confirmation without the enquiry message", async () => {
    const rendered = await renderContactConfirmation({
      locale: "en",
      requestId,
      receivedAt,
      sourcePath: "/en/",
      consentId: CURRENT_CONTACT_CONSENT_ID,
      name: "Vlad",
      contact: "hello@example.com",
      message,
    });

    expect(rendered.subject).toBe("We received your v-b.tech enquiry");
    expect(rendered.html).toContain('alt="v-b.tech"');
    expect(rendered.html).toContain('src="https://v-b.tech/assets/vb-wordmark-email.png"');
    expect(rendered.html).toContain("mailto:hello@v-b.tech");
    expect(rendered.html).toContain("https://t.me/thevladbog");
    expect(rendered.text).toContain("11111111-1111-4111-8111-111111111111");
    expect(rendered.text).toContain("hello@v-b.tech");
    expect(rendered.html).not.toContain("Build the product safely.");
    expect(rendered.text).not.toContain("Build the product safely.");
    expect(rendered).toMatchSnapshot();
  });

  // Catches a production break that sends a Russian visitor an English receipt subject or next-step copy.
  it("renders Russian confirmation copy independently from English", async () => {
    const rendered = await renderContactConfirmation({
      locale: "ru",
      requestId,
      receivedAt,
      sourcePath: "/",
      consentId: CURRENT_CONTACT_CONSENT_ID,
      name: "Влад",
      contact: "hello@example.com",
      message,
    });

    expect(rendered.subject).toBe("Ваше обращение с v-b.tech получено");
    expect(rendered.html).toContain("Ваше обращение получено");
    expect(rendered.text).toContain("Я просмотрю обращение");
    expect(rendered.text).toContain(
      "v-b.tech · Продуктовая инженерия для систем, которые должны работать.",
    );
  });

  // Catches a production break that turns a Telegram handle into an email confirmation destination.
  it("rejects confirmation rendering for a Telegram contact", async () => {
    await expect(
      renderContactConfirmation({
        locale: "ru",
        requestId,
        receivedAt,
        sourcePath: "/",
        consentId: CURRENT_CONTACT_CONSENT_ID,
        name: "Влад",
        contact: "@thevladbog",
        message,
      }),
    ).rejects.toThrow("Contact confirmation requires a valid email contact");
  });
});

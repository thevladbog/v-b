import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import type { ContactRequest } from "@vbtech/contracts";
import { renderContactConfirmation } from "@vbtech/email";
import { CURRENT_CONTACT_CONSENT_ID } from "@vbtech/legal-documents";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { httpHandler, OutboxRepository, createDrainOutbox, createJsonTelemetry } from "../src/index.js";
import { createTestPool, migrate, resetContactSchema } from "./db-test-helper.js";
import {
  createMailpitSender,
  connectDedicatedMailpit,
  deleteTask7MailpitMessages,
  getMailpitMessage,
  listMailpitMessages,
  requireLocalE2EConfig,
  type DedicatedMailpit,
  type MailpitMessage,
} from "./mailpit-test-client.js";

const E2E_ENABLED = process.env.VBTECH_E2E === "1";
const ENCRYPTION_KEY = Buffer.from(
  "4f226d73e3d9dc040459b68b696fec4b8bf07747832d8ad4487a7da2f96e7927",
  "hex",
);

const request = (
  locale: ContactRequest["locale"],
  contact: string,
  name: string,
  message: string,
): ContactRequest => ({
  requestId: randomUUID(),
  locale,
  name,
  contact,
  message,
  sourcePath: locale === "ru" ? "/" : "/en/",
  consentId: CURRENT_CONTACT_CONSENT_ID,
  captchaToken: "task-7-local-readiness-token",
  website: "",
});

const exactHttpEvent = () => ({
  httpMethod: "POST",
  headers: {
    "content-type": "application/json",
    origin: "https://v-b.tech",
    host: "v-b.tech",
  },
  multiValueHeaders: null,
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  requestContext: { identity: { sourceIp: "203.0.113.10" } },
  body: "{}",
  isBase64Encoded: false as const,
});

const findByRequestId = (
  messages: MailpitMessage[],
  requestId: string,
): MailpitMessage[] => messages.filter(
  ({ HTML, Text }) => HTML.includes(requestId) || Text.includes(requestId),
);

const sendUnrelatedMessage = async (mailpitApiUrl: URL, subject: string): Promise<void> => {
  const response = await fetch(new URL("/api/v1/send", mailpitApiUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      From: { Email: "unrelated@example.test" },
      To: [{ Email: "operator@example.test" }],
      Subject: subject,
      Text: "Unrelated local mailbox fixture",
      Tags: ["unrelated-local-fixture"],
    }),
  });
  expect(response.status).toBe(200);
};

const listAllSubjects = async (mailpitApiUrl: URL): Promise<string[]> => {
  const response = await fetch(new URL("/api/v1/messages?start=0&limit=50", mailpitApiUrl));
  expect(response.status).toBe(200);
  const body = await response.json() as { messages: Array<{ Subject: string }> };
  return body.messages.map(({ Subject }) => Subject);
};

describe.skipIf(!E2E_ENABLED)("local PostgreSQL 17 and Mailpit contact pipeline", () => {
  let pool: Pool;
  let mailpitApiUrl: URL;
  let mailpit: DedicatedMailpit;

  beforeAll(async () => {
    const config = requireLocalE2EConfig();
    mailpitApiUrl = config.mailpitApiUrl;
    mailpit = await connectDedicatedMailpit(mailpitApiUrl);
    pool = createTestPool();
    await resetContactSchema(pool);
    await migrate(pool);
    await deleteTask7MailpitMessages(mailpit);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("fails closed when ACTIVE production routing has no runtime secrets", async () => {
    // Break caught: ACTIVE routing accepts a request before its protected runtime config is available.
    const previous = process.env.CONTACT_SUBMISSION_ENABLED;
    process.env.CONTACT_SUBMISSION_ENABLED = "true";
    try {
      await expect(httpHandler(exactHttpEvent())).resolves.toMatchObject({
        statusCode: 503,
        body: '{"error":"temporarily_unavailable"}',
      });
    } finally {
      if (previous === undefined) delete process.env.CONTACT_SUBMISSION_ENABLED;
      else process.env.CONTACT_SUBMISSION_ENABLED = previous;
    }
  });

  it("removes only Task 7-tagged messages and preserves an unrelated local message", async () => {
    // Break caught: setup or cleanup deletes the complete mailbox instead of only owned Task 7 fixtures.
    const unrelatedSubject = `Unrelated mailbox fixture ${randomUUID()}`;
    await sendUnrelatedMessage(mailpitApiUrl, unrelatedSubject);
    const sender = createMailpitSender(mailpit);
    const prepared = await sender.prepare({
      outboxId: randomUUID(),
      recipient: "hello@v-b.tech",
      replyTo: "hello@v-b.tech",
      createdAt: new Date("2026-08-21T00:00:00.000Z"),
      email: {
        subject: "Owned Task 7 cleanup fixture",
        html: "<p>Owned Task 7 cleanup fixture</p>",
        text: "Owned Task 7 cleanup fixture",
      },
    });
    await prepared.send();

    await deleteTask7MailpitMessages(mailpit);

    const subjects = await listAllSubjects(mailpitApiUrl);
    expect(subjects).toContain(unrelatedSubject);
    expect(subjects).not.toContain("Owned Task 7 cleanup fixture");
  });

  it("delivers RU email and EN Telegram enquiries once through the durable real-service contour", async () => {
    // Break caught: bypassing shared validation/repository/worker rendering or mailbox delivery loses conditional routing, idempotency, or erasure.
    const ru = request(
      "ru",
      "task7.ru@example.test",
      "Тестовый посетитель RU",
      "Синтетическое обращение Task 7 для локальной проверки.",
    );
    const en = request(
      "en",
      "@task7fixture",
      "Synthetic visitor EN",
      "Synthetic Task 7 enquiry for the local acceptance contour.",
    );
    const telemetryLines: string[] = [];
    const repository = new OutboxRepository(pool, ENCRYPTION_KEY);
    const drain = createDrainOutbox({
      repository,
      sender: createMailpitSender(mailpit),
      encryptionKey: ENCRYPTION_KEY,
      telemetry: createJsonTelemetry((line) => telemetryLines.push(line)),
    });

    await expect(repository.accept(ru)).resolves.toBe("created");
    await expect(repository.accept(en)).resolves.toBe("created");
    await expect(repository.accept(ru)).resolves.toBe("existing");

    await expect(drain({ limit: 10, workerId: "task-7-local-worker" })).resolves.toEqual({
      leased: 3,
      delivered: 3,
      rescheduled: 0,
      failed: 0,
      leaseLost: 0,
    });

    const summaries = await listMailpitMessages(mailpit);
    expect(summaries).toHaveLength(3);
    const messages = await Promise.all(
      summaries.map(({ ID }) => getMailpitMessage(mailpit, ID)),
    );

    const ruMessages = findByRequestId(messages, ru.requestId);
    expect(ruMessages).toHaveLength(2);
    expect(ruMessages.map(({ Subject }) => Subject).sort()).toEqual([
      "Ваше обращение с v-b.tech получено",
      `Новое обращение с v-b.tech — ${ru.contact}`,
    ]);
    expect(ruMessages.map(({ To }) => To.map(({ Address }) => Address))).toEqual(
      expect.arrayContaining([["hello@v-b.tech"], [ru.contact]]),
    );
    const ruNotification = ruMessages.find(
      ({ Subject }) => Subject === `Новое обращение с v-b.tech — ${ru.contact}`,
    );
    expect(ruNotification?.HTML).toContain(CURRENT_CONTACT_CONSENT_ID);
    expect(ruNotification?.Text).toContain(CURRENT_CONTACT_CONSENT_ID);

    const enMessages = findByRequestId(messages, en.requestId);
    expect(enMessages).toHaveLength(1);
    expect(enMessages[0]).toMatchObject({ Subject: `New v-b.tech enquiry — ${en.contact}` });
    expect(enMessages[0]?.To.map(({ Address }) => Address)).toEqual(["hello@v-b.tech"]);
    expect(enMessages[0]?.HTML).toContain(CURRENT_CONTACT_CONSENT_ID);
    expect(enMessages[0]?.Text).toContain(CURRENT_CONTACT_CONSENT_ID);

    const terminal = await pool.query<{
      id: string;
      public_request_id: string;
      kind: string;
      delivered_at: Date | null;
      payload_ciphertext: Buffer | null;
      payload_iv: Buffer | null;
      payload_auth_tag: Buffer | null;
    }>(
      `SELECT id::text, public_request_id::text, kind, delivered_at,
              payload_ciphertext, payload_iv, payload_auth_tag
       FROM email_outbox
       ORDER BY public_request_id, kind`,
    );
    expect(terminal.rows).toHaveLength(3);
    for (const row of terminal.rows) {
      expect(row.delivered_at).toBeInstanceOf(Date);
      expect(row.payload_ciphertext).toBeNull();
      expect(row.payload_iv).toBeNull();
      expect(row.payload_auth_tag).toBeNull();
    }

    const terminalByRequestAndKind = new Map(
      terminal.rows.map((row) => [`${row.public_request_id}:${row.kind}`, row]),
    );
    const ruNotificationRow = terminalByRequestAndKind.get(`${ru.requestId}:notification`)!;
    const ruConfirmationRow = terminalByRequestAndKind.get(`${ru.requestId}:confirmation`)!;
    const enNotificationRow = terminalByRequestAndKind.get(`${en.requestId}:notification`)!;
    const messageBySubject = new Map(messages.map((message) => [message.Subject, message]));
    expect(messageBySubject.get(`Новое обращение с v-b.tech — ${ru.contact}`)).toMatchObject({
      From: { Address: "hello@v-b.tech", Name: "v-b.tech" },
      ReplyTo: [{ Address: ru.contact, Name: "" }],
      MessageID: `outbox-${ruNotificationRow.id}@v-b.tech`,
    });
    expect(messageBySubject.get("Ваше обращение с v-b.tech получено")).toMatchObject({
      From: { Address: "hello@v-b.tech", Name: "v-b.tech" },
      ReplyTo: [{ Address: "hello@v-b.tech", Name: "" }],
      MessageID: `outbox-${ruConfirmationRow.id}@v-b.tech`,
    });
    expect(messageBySubject.get(`New v-b.tech enquiry — ${en.contact}`)).toMatchObject({
      From: { Address: "hello@v-b.tech", Name: "v-b.tech" },
      ReplyTo: [{ Address: "hello@v-b.tech", Name: "" }],
      MessageID: `outbox-${enNotificationRow.id}@v-b.tech`,
    });

    await expect(repository.accept(ru)).resolves.toBe("existing");
    await expect(drain({ limit: 10, workerId: "task-7-retry-worker" })).resolves.toMatchObject({
      leased: 0,
      delivered: 0,
    });
    await expect(listMailpitMessages(mailpit)).resolves.toHaveLength(3);

    const logs = telemetryLines.join("\n");
    for (const forbidden of [
      ru.name,
      ru.contact,
      ru.message,
      ru.captchaToken,
      en.name,
      en.contact,
      en.message,
      en.captchaToken,
    ]) {
      expect(logs).not.toContain(forbidden);
    }
    expect(telemetryLines).toHaveLength(3);

    const enAcceptanceRequestId = "77777777-7777-4777-8777-777777777777";
    const enAcceptanceOutboxId = "88888888-8888-4888-8888-888888888888";
    const enAcceptanceRecipient = "task7.en@example.test";
    const enConfirmation = await renderContactConfirmation({
      locale: "en",
      requestId: enAcceptanceRequestId,
      receivedAt: new Date("2026-08-21T00:00:00.000Z"),
      sourcePath: "/en/",
      consentId: CURRENT_CONTACT_CONSENT_ID,
      name: "Synthetic visual acceptance visitor",
      contact: enAcceptanceRecipient,
      message: "Synthetic visual-only confirmation fixture.",
    });
    const enAcceptanceSender = createMailpitSender(mailpit);
    const enAcceptancePrepared = await enAcceptanceSender.prepare({
      outboxId: enAcceptanceOutboxId,
      recipient: enAcceptanceRecipient,
      replyTo: "hello@v-b.tech",
      createdAt: new Date("2026-08-21T00:00:00.000Z"),
      email: enConfirmation,
    });
    await enAcceptancePrepared.send();

    const acceptanceSummaries = await listMailpitMessages(mailpit);
    expect(acceptanceSummaries).toHaveLength(4);
    const enAcceptanceSummary = acceptanceSummaries.find(
      ({ Subject }) => Subject === "We received your v-b.tech enquiry",
    );
    expect(enAcceptanceSummary).toBeDefined();
    const enAcceptanceMessage = await getMailpitMessage(mailpit, enAcceptanceSummary!.ID);
    expect(enAcceptanceMessage).toMatchObject({
      From: { Address: "hello@v-b.tech", Name: "v-b.tech" },
      ReplyTo: [{ Address: "hello@v-b.tech", Name: "" }],
      MessageID: `outbox-${enAcceptanceOutboxId}@v-b.tech`,
    });
    expect(enAcceptanceMessage.HTML).toContain(enAcceptanceRequestId);
    expect(enAcceptanceMessage.Text).toContain(enAcceptanceRequestId);
  });
});

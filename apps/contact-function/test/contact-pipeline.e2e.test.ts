import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import type { ContactRequest } from "@vbtech/contracts";
import { CURRENT_CONTACT_CONSENT_ID } from "@vbtech/legal-documents";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { httpHandler, OutboxRepository, createDrainOutbox, createJsonTelemetry } from "../src/index.js";
import { createTestPool, migrate, resetContactSchema } from "./db-test-helper.js";
import {
  createMailpitSender,
  deleteAllMailpitMessages,
  getMailpitMessage,
  listMailpitMessages,
  requireLocalE2EConfig,
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
  path: "/api/contact",
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

describe.skipIf(!E2E_ENABLED)("local PostgreSQL 17 and Mailpit contact pipeline", () => {
  let pool: Pool;
  let mailpitApiUrl: URL;

  beforeAll(async () => {
    const config = requireLocalE2EConfig();
    mailpitApiUrl = config.mailpitApiUrl;
    pool = createTestPool();
    await resetContactSchema(pool);
    await migrate(pool);
    await deleteAllMailpitMessages(mailpitApiUrl);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("keeps the production public handler neutral while consent is DRAFT", async () => {
    // Break caught: enabling only the environment flag exposes the exact public route under a draft consent.
    const previous = process.env.CONTACT_SUBMISSION_ENABLED;
    process.env.CONTACT_SUBMISSION_ENABLED = "true";
    try {
      await expect(httpHandler(exactHttpEvent())).resolves.toMatchObject({
        statusCode: 404,
        body: "Not Found",
      });
    } finally {
      if (previous === undefined) delete process.env.CONTACT_SUBMISSION_ENABLED;
      else process.env.CONTACT_SUBMISSION_ENABLED = previous;
    }
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
      sender: createMailpitSender(mailpitApiUrl),
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

    const summaries = await listMailpitMessages(mailpitApiUrl);
    expect(summaries).toHaveLength(3);
    const messages = await Promise.all(
      summaries.map(({ ID }) => getMailpitMessage(mailpitApiUrl, ID)),
    );

    const ruMessages = findByRequestId(messages, ru.requestId);
    expect(ruMessages).toHaveLength(2);
    expect(ruMessages.map(({ Subject }) => Subject).sort()).toEqual([
      "Ваше обращение с v-b.tech получено",
      "Новое обращение с v-b.tech",
    ]);
    expect(ruMessages.map(({ To }) => To.map(({ Address }) => Address))).toEqual(
      expect.arrayContaining([["hello@v-b.tech"], [ru.contact]]),
    );
    const ruNotification = ruMessages.find(({ Subject }) => Subject === "Новое обращение с v-b.tech");
    expect(ruNotification?.HTML).toContain(CURRENT_CONTACT_CONSENT_ID);
    expect(ruNotification?.Text).toContain(CURRENT_CONTACT_CONSENT_ID);

    const enMessages = findByRequestId(messages, en.requestId);
    expect(enMessages).toHaveLength(1);
    expect(enMessages[0]).toMatchObject({ Subject: "New v-b.tech enquiry" });
    expect(enMessages[0]?.To.map(({ Address }) => Address)).toEqual(["hello@v-b.tech"]);
    expect(enMessages[0]?.HTML).toContain(CURRENT_CONTACT_CONSENT_ID);
    expect(enMessages[0]?.Text).toContain(CURRENT_CONTACT_CONSENT_ID);

    const terminal = await pool.query<{
      public_request_id: string;
      kind: string;
      delivered_at: Date | null;
      payload_ciphertext: Buffer | null;
      payload_iv: Buffer | null;
      payload_auth_tag: Buffer | null;
    }>(
      `SELECT public_request_id::text, kind, delivered_at,
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

    await expect(repository.accept(ru)).resolves.toBe("existing");
    await expect(drain({ limit: 10, workerId: "task-7-retry-worker" })).resolves.toMatchObject({
      leased: 0,
      delivered: 0,
    });
    await expect(listMailpitMessages(mailpitApiUrl)).resolves.toHaveLength(3);

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
  });
});

import { Buffer } from "node:buffer";
import {
  POSTBOX_SENDER,
  PostboxDeliveryError,
  type PostboxSendInput,
  type PostboxSender,
} from "../src/index.js";

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 1_048_576;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export interface LocalE2EConfig {
  mailpitApiUrl: URL;
}

export interface MailpitAddress {
  Address: string;
  Name: string;
}

export interface MailpitMessageSummary {
  ID: string;
  Subject: string;
}

export interface MailpitMessage extends MailpitMessageSummary {
  HTML: string;
  Text: string;
  To: MailpitAddress[];
  From: MailpitAddress;
  ReplyTo: MailpitAddress[];
  MessageID: string;
}

const requireLoopbackHttpUrl = (value: string | undefined, name: string): URL => {
  if (!value) throw new Error(`${name} is required when VBTECH_E2E=1`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a loopback-only HTTP origin`);
  }
  if (
    parsed.protocol !== "http:" ||
    !LOOPBACK_HOSTS.has(parsed.hostname) ||
    !parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    throw new Error(`${name} must be a loopback-only HTTP origin with an explicit port`);
  }
  parsed.pathname = "/";
  return parsed;
};

export const requireLocalE2EConfig = (): LocalE2EConfig => ({
  mailpitApiUrl: requireLoopbackHttpUrl(
    process.env.VBTECH_MAILPIT_API_URL,
    "VBTECH_MAILPIT_API_URL",
  ),
});

const readBoundedBody = async (response: Response): Promise<string> => {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("mailpit_response_too_large");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
};

const mailpitRequest = async (
  baseUrl: URL,
  path: string,
  init?: RequestInit,
): Promise<{ response: Response; text: string }> => {
  const url = new URL(path, baseUrl);
  if (url.origin !== baseUrl.origin) throw new Error("mailpit_url_escape");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await readBoundedBody(response);
    return { response, text };
  } finally {
    clearTimeout(timer);
  }
};

const parseObject = (text: string): Record<string, unknown> => {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("mailpit_response_invalid");
  }
  return parsed as Record<string, unknown>;
};

const address = (email: string, name?: string) => ({
  Email: email,
  ...(name ? { Name: name } : {}),
});

const sendBody = (input: PostboxSendInput) => ({
  From: address(POSTBOX_SENDER, "v-b.tech"),
  To: [address(input.recipient)],
  ReplyTo: [address(input.replyTo)],
  Subject: input.email.subject,
  HTML: input.email.html,
  Text: input.email.text,
  Headers: {
    "Message-ID": `<outbox-${input.outboxId}@v-b.tech>`,
  },
  Tags: ["vbtech-task7"],
});

export const createMailpitSender = (baseUrl: URL): PostboxSender => ({
  async prepare(input) {
    const body = JSON.stringify(sendBody(input));
    let discarded = false;
    return {
      discard() {
        discarded = true;
      },
      async send() {
        if (discarded) {
          throw new PostboxDeliveryError("transient", "mailpit_prepared_delivery_discarded");
        }
        let result: { response: Response; text: string };
        try {
          result = await mailpitRequest(baseUrl, "/api/v1/send", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
          });
        } catch {
          throw new PostboxDeliveryError("transient", "mailpit_unavailable");
        }
        if (!result.response.ok) {
          throw new PostboxDeliveryError("transient", "mailpit_rejected");
        }
        const id = parseObject(result.text).ID;
        if (typeof id !== "string" || id.length < 1 || id.length > 512 || /\p{Cc}/u.test(id)) {
          throw new PostboxDeliveryError("transient", "mailpit_response_invalid");
        }
        return { providerMessageId: `mailpit:${id}` };
      },
    };
  },
});

export const deleteAllMailpitMessages = async (baseUrl: URL): Promise<void> => {
  const { response } = await mailpitRequest(baseUrl, "/api/v1/messages", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error("mailpit_delete_failed");
};

export const listMailpitMessages = async (
  baseUrl: URL,
): Promise<MailpitMessageSummary[]> => {
  const { response, text } = await mailpitRequest(
    baseUrl,
    "/api/v1/messages?start=0&limit=50",
  );
  if (!response.ok) throw new Error("mailpit_list_failed");
  const messages = parseObject(text).messages;
  if (!Array.isArray(messages)) throw new Error("mailpit_response_invalid");
  return messages as MailpitMessageSummary[];
};

export const getMailpitMessage = async (
  baseUrl: URL,
  id: string,
): Promise<MailpitMessage> => {
  if (!id || id.length > 512 || /[^A-Za-z0-9_-]/.test(id)) {
    throw new Error("mailpit_message_id_invalid");
  }
  const { response, text } = await mailpitRequest(
    baseUrl,
    `/api/v1/message/${encodeURIComponent(id)}`,
  );
  if (!response.ok) throw new Error("mailpit_message_fetch_failed");
  return parseObject(text) as unknown as MailpitMessage;
};

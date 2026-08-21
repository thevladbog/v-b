import { Buffer } from "node:buffer";
import {
  POSTBOX_SENDER,
  PostboxDeliveryError,
  type PostboxSendInput,
  type PostboxSender,
} from "../src/index.js";

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 1_048_576;
const TASK7_MAILPIT_ORIGIN = "http://127.0.0.1:58025";
const TASK7_MAILPIT_LABEL = "vbtech-task7-dedicated";
const TASK7_MAILPIT_TAG = "vbtech-task7";
const dedicatedMailpitBrand: unique symbol = Symbol("dedicatedMailpit");

export interface LocalE2EConfig {
  mailpitApiUrl: URL;
}

export interface DedicatedMailpit {
  readonly url: URL;
  readonly [dedicatedMailpitBrand]: true;
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

const requireTask7MailpitUrl = (value: string | undefined): URL => {
  if (!value) throw new Error("VBTECH_MAILPIT_API_URL is required when VBTECH_E2E=1");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`VBTECH_MAILPIT_API_URL must be exactly ${TASK7_MAILPIT_ORIGIN}/`);
  }
  if (
    parsed.origin !== TASK7_MAILPIT_ORIGIN ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    throw new Error(`VBTECH_MAILPIT_API_URL must be exactly ${TASK7_MAILPIT_ORIGIN}/`);
  }
  parsed.pathname = "/";
  return parsed;
};

export const requireLocalE2EConfig = (): LocalE2EConfig => ({
  mailpitApiUrl: requireTask7MailpitUrl(process.env.VBTECH_MAILPIT_API_URL),
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
  fetchImpl: typeof fetch = fetch,
): Promise<{ response: Response; text: string }> => {
  const url = new URL(path, baseUrl);
  if (url.origin !== baseUrl.origin) throw new Error("mailpit_url_escape");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
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

export const connectDedicatedMailpit = async (
  baseUrl: URL,
  fetchImpl: typeof fetch = fetch,
): Promise<DedicatedMailpit> => {
  if (baseUrl.origin !== TASK7_MAILPIT_ORIGIN || baseUrl.pathname !== "/") {
    throw new Error("mailpit_task7_origin_mismatch");
  }
  let result: { response: Response; text: string };
  try {
    result = await mailpitRequest(baseUrl, "/api/v1/webui", undefined, fetchImpl);
  } catch {
    throw new Error("mailpit_task7_marker_unavailable");
  }
  if (!result.response.ok || parseObject(result.text).Label !== TASK7_MAILPIT_LABEL) {
    throw new Error("mailpit_task7_marker_mismatch");
  }
  return Object.freeze({
    url: new URL(baseUrl.href),
    [dedicatedMailpitBrand]: true as const,
  });
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
  Tags: [TASK7_MAILPIT_TAG],
});

export const createMailpitSender = (mailpit: DedicatedMailpit): PostboxSender => ({
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
          result = await mailpitRequest(mailpit.url, "/api/v1/send", {
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

export const deleteTask7MailpitMessages = async (
  mailpit: DedicatedMailpit,
): Promise<void> => {
  const messages = await listMailpitMessages(mailpit);
  if (messages.length === 0) return;
  const { response } = await mailpitRequest(mailpit.url, "/api/v1/messages", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ IDs: messages.map(({ ID }) => ID) }),
  });
  if (!response.ok) throw new Error("mailpit_delete_failed");
};

export const listMailpitMessages = async (
  mailpit: DedicatedMailpit,
): Promise<MailpitMessageSummary[]> => {
  const { response, text } = await mailpitRequest(
    mailpit.url,
    `/api/v1/search?query=${encodeURIComponent(`tag:${TASK7_MAILPIT_TAG}`)}&start=0&limit=50`,
  );
  if (!response.ok) throw new Error("mailpit_list_failed");
  const messages = parseObject(text).messages;
  if (!Array.isArray(messages)) throw new Error("mailpit_response_invalid");
  return messages as MailpitMessageSummary[];
};

export const getMailpitMessage = async (
  mailpit: DedicatedMailpit,
  id: string,
): Promise<MailpitMessage> => {
  if (!id || id.length > 512 || /[^A-Za-z0-9_-]/.test(id)) {
    throw new Error("mailpit_message_id_invalid");
  }
  const { response, text } = await mailpitRequest(
    mailpit.url,
    `/api/v1/message/${encodeURIComponent(id)}`,
  );
  if (!response.ok) throw new Error("mailpit_message_fetch_failed");
  return parseObject(text) as unknown as MailpitMessage;
};

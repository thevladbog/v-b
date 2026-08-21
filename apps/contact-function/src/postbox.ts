import { Buffer } from "node:buffer";
import { isEmailContact } from "@vbtech/contracts";
import type { RenderedEmail } from "@vbtech/email";

export const POSTBOX_SEND_ENDPOINT =
  "https://postbox.cloud.yandex.net/v2/email/outbound-emails";
export const POSTBOX_SENDER = "hello@v-b.tech";

const MAX_IAM_TOKEN_LENGTH = 8_192;
const MAX_PROVIDER_MESSAGE_ID_LENGTH = 512;
const MAX_RENDERED_PART_BYTES = 96_000;
const MAX_RAW_MIME_BYTES = 200_000;
const MAX_SUCCESS_BODY_BYTES = 8_192;
const POSTBOX_REQUEST_TIMEOUT_MILLISECONDS = 10_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type PostboxFailureDisposition = "transient" | "terminal";

export class PostboxDeliveryError extends Error {
  readonly name = "PostboxDeliveryError";

  constructor(
    readonly disposition: PostboxFailureDisposition,
    readonly safeCode: string,
  ) {
    super(safeCode);
  }
}

export interface PostboxSendInput {
  outboxId: string;
  recipient: string;
  replyTo: string;
  createdAt: Date;
  email: RenderedEmail;
}

export interface PostboxSendResult {
  providerMessageId: string;
}

export interface PostboxSender {
  send(input: PostboxSendInput): Promise<PostboxSendResult>;
}

export interface YandexPostboxOptions {
  getIamToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
}

const hasControls = (value: string): boolean => /\p{Cc}/u.test(value);

const assertSafeEmailAddress = (value: string): void => {
  if (!isEmailContact(value) || value.length > 254) {
    throw new PostboxDeliveryError("terminal", "postbox_message_invalid");
  }
};

const assertSendInput = (input: PostboxSendInput): void => {
  if (!UUID.test(input.outboxId)) {
    throw new PostboxDeliveryError("terminal", "postbox_message_invalid");
  }
  assertSafeEmailAddress(input.recipient);
  assertSafeEmailAddress(input.replyTo);
  if (
    !(input.createdAt instanceof Date) ||
    Number.isNaN(input.createdAt.getTime()) ||
    !input.email ||
    typeof input.email.subject !== "string" ||
    input.email.subject.length < 1 ||
    hasControls(input.email.subject) ||
    Buffer.byteLength(input.email.subject, "utf8") > 256 ||
    typeof input.email.html !== "string" ||
    typeof input.email.text !== "string" ||
    Buffer.byteLength(input.email.html, "utf8") > MAX_RENDERED_PART_BYTES ||
    Buffer.byteLength(input.email.text, "utf8") > MAX_RENDERED_PART_BYTES
  ) {
    throw new PostboxDeliveryError("terminal", "postbox_message_invalid");
  }
};

const wrapBase64 = (value: string): string =>
  value.match(/.{1,76}/g)?.join("\r\n") ?? "";

const encodeSubject = (subject: string): string => {
  const words: string[] = [];
  let chunk = "";
  let chunkBytes = 0;

  for (const character of subject) {
    const bytes = Buffer.byteLength(character, "utf8");
    if (chunk && chunkBytes + bytes > 45) {
      words.push(`=?UTF-8?B?${Buffer.from(chunk, "utf8").toString("base64")}?=`);
      chunk = "";
      chunkBytes = 0;
    }
    chunk += character;
    chunkBytes += bytes;
  }
  if (chunk) {
    words.push(`=?UTF-8?B?${Buffer.from(chunk, "utf8").toString("base64")}?=`);
  }

  return words.join("\r\n ");
};

export const buildRawMime = (input: PostboxSendInput): Buffer => {
  assertSendInput(input);
  const boundary = `vbtech-${input.outboxId}`;
  const lines = [
    `From: "v-b.tech" <${POSTBOX_SENDER}>`,
    `To: ${input.recipient}`,
    `Reply-To: ${input.replyTo}`,
    `Date: ${input.createdAt.toUTCString()}`,
    `Message-ID: <outbox-${input.outboxId}@v-b.tech>`,
    `Subject: ${encodeSubject(input.email.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(input.email.text, "utf8").toString("base64")),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(input.email.html, "utf8").toString("base64")),
    `--${boundary}--`,
    "",
  ];
  const raw = Buffer.from(lines.join("\r\n"), "utf8");
  if (raw.length > MAX_RAW_MIME_BYTES) {
    throw new PostboxDeliveryError("terminal", "postbox_message_invalid");
  }
  return raw;
};

const requireIamToken = (value: string): string => {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > MAX_IAM_TOKEN_LENGTH ||
    hasControls(value)
  ) {
    throw new PostboxDeliveryError("transient", "postbox_auth_unavailable");
  }
  return value;
};

const readBoundedText = async (response: Response): Promise<string> => {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > MAX_SUCCESS_BODY_BYTES) {
        await reader.cancel();
        throw new PostboxDeliveryError("transient", "postbox_response_invalid");
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch (error) {
    if (error instanceof PostboxDeliveryError) throw error;
    throw new PostboxDeliveryError("transient", "postbox_response_invalid");
  }
};

const parseProviderMessageId = async (response: Response): Promise<string> => {
  const text = await readBoundedText(response);
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid");
    }
    const messageId = (parsed as Record<string, unknown>).MessageId;
    if (
      typeof messageId !== "string" ||
      messageId.length < 1 ||
      messageId.length > MAX_PROVIDER_MESSAGE_ID_LENGTH ||
      hasControls(messageId)
    ) {
      throw new Error("invalid");
    }
    return messageId;
  } catch (error) {
    if (error instanceof PostboxDeliveryError) throw error;
    throw new PostboxDeliveryError("transient", "postbox_response_invalid");
  }
};

export class YandexPostbox implements PostboxSender {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: YandexPostboxOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async send(input: PostboxSendInput): Promise<PostboxSendResult> {
    const raw = buildRawMime(input);
    let token: string;
    try {
      token = requireIamToken(await this.options.getIamToken());
    } catch (error) {
      if (error instanceof PostboxDeliveryError) throw error;
      throw new PostboxDeliveryError("transient", "postbox_auth_unavailable");
    }

    const abortController = new AbortController();
    const timeout = setTimeout(
      () => abortController.abort(),
      POSTBOX_REQUEST_TIMEOUT_MILLISECONDS,
    );
    try {
      const response = await this.fetchImpl(POSTBOX_SEND_ENDPOINT, {
        method: "POST",
        signal: abortController.signal,
        headers: {
          "Content-Type": "application/json",
          "X-YaCloud-SubjectToken": token,
        },
        body: JSON.stringify({
          FromEmailAddress: POSTBOX_SENDER,
          Destination: { ToAddresses: [input.recipient] },
          Content: { Raw: { Data: raw.toString("base64") } },
        }),
      });

      if (response.status === 200) {
        return { providerMessageId: await parseProviderMessageId(response) };
      }
      if (response.status === 400 || response.status === 404) {
        throw new PostboxDeliveryError("terminal", "postbox_message_rejected");
      }
      throw new PostboxDeliveryError("transient", "postbox_unavailable");
    } catch (error) {
      if (error instanceof PostboxDeliveryError) throw error;
      throw new PostboxDeliveryError("transient", "postbox_unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
}

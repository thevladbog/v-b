import { Buffer } from "node:buffer";
import { isPublicContactError, publicError } from "./errors.js";

const VALIDATE_URL = "https://smartcaptcha.cloud.yandex.ru/validate";
const MAX_PROVIDER_RESPONSE_BYTES = 16_384;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 5_000;

type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface SmartCaptchaOptions {
  secret: string;
  fetch?: Fetch;
  timeoutMs?: number;
  expectedHost?: string;
}

const readBoundedUtf8 = async (response: Response): Promise<string> => {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new Error("provider_response_too_large");
  }
  if (!response.body) throw new Error("provider_response_empty");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_PROVIDER_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("provider_response_too_large");
    }
    chunks.push(value);
  }
  if (size === 0) throw new Error("provider_response_empty");
  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
};

export class SmartCaptcha {
  private readonly fetch: Fetch;
  private readonly timeoutMs: number;
  private readonly expectedHost: string;

  constructor(private readonly options: SmartCaptchaOptions) {
    if (!options.secret || options.secret.length > 8_192 || /\p{Cc}/u.test(options.secret)) {
      throw new Error("invalid_captcha_secret");
    }
    this.timeoutMs = options.timeoutMs ?? 1_000;
    if (
      !Number.isInteger(this.timeoutMs) ||
      this.timeoutMs < MIN_TIMEOUT_MS ||
      this.timeoutMs > MAX_TIMEOUT_MS
    ) {
      throw new Error("invalid_captcha_timeout");
    }
    this.expectedHost = options.expectedHost ?? "v-b.tech";
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async assertHuman(token: string, source: string): Promise<void> {
    if (!token) throw publicError("captcha_required", 400);

    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(new Error("captcha_timeout"));
      }, this.timeoutMs);
    });

    try {
      const validate = async (): Promise<void> => {
        const response = await this.fetch(VALIDATE_URL, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            secret: this.options.secret,
            token,
            ip: source,
          }),
          signal: controller.signal,
        });
        if (response.status !== 200) throw new Error("captcha_non_200");

        const raw = await readBoundedUtf8(response);
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("captcha_malformed");
        }
        const result = parsed as Record<string, unknown>;
        if (typeof result.status !== "string" || typeof result.message !== "string") {
          throw new Error("captcha_malformed");
        }
        if (result.status !== "ok") throw publicError("captcha_rejected", 400);
        if (result.host !== this.expectedHost) throw new Error("captcha_wrong_host");
      };
      await Promise.race([validate(), timeout]);
    } catch (error) {
      if (isPublicContactError(error)) throw error;
      throw publicError("captcha_unavailable", 503);
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      controller.abort();
    }
  }
}

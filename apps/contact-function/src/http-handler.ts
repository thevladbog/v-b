import { Buffer } from "node:buffer";
import { isIP } from "node:net";
import { contactRequestSchema } from "@vbtech/contracts";
import {
  CURRENT_CONTACT_CONSENT_ID,
  assertContactConsentPublishable,
} from "@vbtech/legal-documents";
import {
  isContactSubmissionEnabled,
  loadContactProductionConfig,
  type ContactProductionConfig,
} from "./config.js";
import { isPublicContactError, publicError } from "./errors.js";
import type { SubmitContact } from "./submit.js";

export interface YandexHttpEvent {
  httpMethod: string;
  path: string;
  headers: Record<string, string> | null;
  multiValueHeaders: Record<string, string[]> | null;
  queryStringParameters: Record<string, string> | null;
  multiValueQueryStringParameters: Record<string, string[]> | null;
  requestContext: { identity: { sourceIp: string } };
  body: string;
  isBase64Encoded: boolean;
}

export interface YandexHttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded: false;
}

export interface HttpHandlerDependencies {
  enabled: boolean;
  submitContact: SubmitContact;
}

const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};
const TEXT_HEADERS = {
  "cache-control": "no-store",
  "content-type": "text/plain; charset=utf-8",
};
const MAX_BODY_BYTES = 8 * 1_024;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const neutralNotFound = (): YandexHttpResponse => ({
  statusCode: 404,
  headers: TEXT_HEADERS,
  body: "Not Found",
  isBase64Encoded: false,
});

const jsonResponse = (statusCode: number, value: unknown): YandexHttpResponse => ({
  statusCode,
  headers: JSON_HEADERS,
  body: JSON.stringify(value),
  isBase64Encoded: false,
});

const hasQuery = (event: YandexHttpEvent): boolean =>
  Object.keys(event.queryStringParameters ?? {}).length > 0 ||
  Object.keys(event.multiValueQueryStringParameters ?? {}).length > 0;

const exactRoute = (event: YandexHttpEvent): boolean =>
  event.httpMethod === "POST" && event.path === "/api/contact" && !hasQuery(event);

const header = (event: YandexHttpEvent, wanted: string): string => {
  const values: string[] = [];
  for (const [name, value] of Object.entries(event.headers ?? {})) {
    if (name.toLowerCase() !== wanted) continue;
    if (typeof value !== "string") throw publicError("invalid_request", 400);
    values.push(value);
  }
  for (const [name, entries] of Object.entries(event.multiValueHeaders ?? {})) {
    if (name.toLowerCase() !== wanted) continue;
    if (!Array.isArray(entries) || entries.some((value) => typeof value !== "string")) {
      throw publicError("invalid_request", 400);
    }
    values.push(...entries);
  }
  if (values.length !== 1) throw publicError("invalid_request", 400);
  return values[0]!;
};

const validJsonContentType = (value: string): boolean =>
  /^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(value);

const strictBase64 = (body: string): Buffer => {
  if (!body || body.length % 4 !== 0 || !BASE64_PATTERN.test(body)) {
    throw publicError("invalid_request", 400);
  }
  const decoded = Buffer.from(body, "base64");
  if (decoded.toString("base64") !== body) throw publicError("invalid_request", 400);
  return decoded;
};

const decodeBody = (event: YandexHttpEvent): string => {
  if (typeof event.body !== "string" || typeof event.isBase64Encoded !== "boolean") {
    throw publicError("invalid_request", 400);
  }
  const bytes = event.isBase64Encoded ? strictBase64(event.body) : Buffer.from(event.body, "utf8");
  if (bytes.length > MAX_BODY_BYTES) throw publicError("invalid_request", 413);
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!event.isBase64Encoded && text !== event.body) {
      throw publicError("invalid_request", 400);
    }
    return text;
  } catch (error) {
    if (isPublicContactError(error)) throw error;
    throw publicError("invalid_request", 400);
  }
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw publicError("invalid_request", 400);
  }
};

const sourceIp = (event: YandexHttpEvent): string => {
  const source = event.requestContext?.identity?.sourceIp;
  if (typeof source !== "string" || source.length > 45 || isIP(source) === 0) {
    throw publicError("invalid_request", 400);
  }
  return source;
};

export const createHttpHandler = (dependencies: HttpHandlerDependencies) =>
  async (event: YandexHttpEvent): Promise<YandexHttpResponse> => {
    if (!dependencies.enabled) return neutralNotFound();
    if (!exactRoute(event)) return neutralNotFound();

    try {
      if (!validJsonContentType(header(event, "content-type"))) {
        throw publicError("invalid_request", 400);
      }
      const decodedBody = decodeBody(event);
      if (header(event, "origin") !== "https://v-b.tech") {
        throw publicError("invalid_request", 400);
      }
      if (header(event, "host") !== "v-b.tech") throw publicError("invalid_request", 400);

      const parsed = contactRequestSchema.safeParse(parseJson(decodedBody));
      if (!parsed.success) {
        const captchaOnly = parsed.error.issues.every(
          ({ path }) => path.length === 1 && path[0] === "captchaToken",
        );
        throw publicError(captchaOnly ? "captcha_required" : "invalid_request", 400);
      }
      const accepted = await dependencies.submitContact(parsed.data, sourceIp(event));
      return jsonResponse(202, accepted);
    } catch (error) {
      if (isPublicContactError(error)) {
        return jsonResponse(error.status, { error: error.code });
      }
      return jsonResponse(503, { error: "temporarily_unavailable" });
    }
  };

const PRODUCTION_CAPTCHA_TIMEOUT_MS = 1_000;

export interface ProductionSubmitLoaderDependencies {
  assertPublishable(): void;
  loadConfig(): ContactProductionConfig;
  compose(
    config: ContactProductionConfig,
    captchaTimeoutMs: number,
  ): Promise<SubmitContact>;
}

export const createProductionSubmitLoader = (
  dependencies: ProductionSubmitLoaderDependencies,
): (() => Promise<SubmitContact>) => {
  let cached: Promise<SubmitContact> | undefined;
  return () => {
    cached ??= (async () => {
      dependencies.assertPublishable();
      const config = dependencies.loadConfig();
      return dependencies.compose(config, PRODUCTION_CAPTCHA_TIMEOUT_MS);
    })();
    return cached;
  };
};

const composeProductionSubmit = async (
  config: ContactProductionConfig,
  captchaTimeoutMs: number,
): Promise<SubmitContact> => {
    const [{ Pool }, { OutboxRepository }, { PostgresRateLimitRepository, RateLimiter }, { SmartCaptcha }, { createSubmitContact }] =
      await Promise.all([
        import("pg"),
        import("./outbox-repository.js"),
        import("./rate-limit.js"),
        import("./captcha.js"),
        import("./submit.js"),
      ]);
    const pool = new Pool({ connectionString: config.databaseUrl, max: 8 });
    return createSubmitContact({
      enabled: true,
      limiter: new RateLimiter(
        new PostgresRateLimitRepository(pool),
        config.rateLimitHmacKey,
      ),
      captcha: new SmartCaptcha({
        secret: config.captchaSecret,
        timeoutMs: captchaTimeoutMs,
      }),
      repository: new OutboxRepository(pool, config.outboxEncryptionKey),
    });
};

const loadProductionSubmit = createProductionSubmitLoader({
  assertPublishable: () =>
    assertContactConsentPublishable(CURRENT_CONTACT_CONSENT_ID, true),
  loadConfig: loadContactProductionConfig,
  compose: composeProductionSubmit,
});

export const httpHandler = async (
  event: YandexHttpEvent,
  _context?: unknown,
): Promise<YandexHttpResponse> => {
  if (!isContactSubmissionEnabled()) return neutralNotFound();
  try {
    assertContactConsentPublishable(CURRENT_CONTACT_CONSENT_ID, true);
  } catch {
    return neutralNotFound();
  }
  if (!exactRoute(event)) return neutralNotFound();
  try {
    const submitContact = await loadProductionSubmit();
    return createHttpHandler({ enabled: true, submitContact })(event);
  } catch {
    return jsonResponse(503, { error: "temporarily_unavailable" });
  }
};

import {
  CONTACT_ERROR_CODES,
  contactRequestSchema,
  type ContactErrorCode,
  type ContactLocale,
} from "@vbtech/contracts";
import { CURRENT_CONTACT_CONSENT_ID } from "@vbtech/legal-documents";
import { normalizeContact } from "./contact-validation.js";

const PUBLIC_RESPONSE_LIMIT_BYTES = 1_024;
const JSON_CONTENT_TYPE = /^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i;
const ERROR_STATUS: Readonly<Record<ContactErrorCode, number>> = {
  invalid_request: 400,
  consent_revision_changed: 409,
  captcha_required: 400,
  captcha_rejected: 400,
  captcha_unavailable: 503,
  rate_limited: 429,
  submission_disabled: 404,
  temporarily_unavailable: 503,
};
const ERROR_CODES = new Set<string>(CONTACT_ERROR_CODES);

export interface ContactClientDraft {
  locale: ContactLocale;
  name: string;
  contact: string;
  message: string;
  sourcePath: "/" | "/en/";
  consentAccepted: boolean;
  website: string;
}

export interface SubmitContactDraftDependencies {
  requestId?: string;
  createRequestId(): string;
  captchaToken: string;
  fetch: typeof globalThis.fetch;
  signal?: AbortSignal;
}

export type ContactSubmitResult =
  | { accepted: true; requestId: string }
  | { accepted: false; code: ContactErrorCode; requestId: string };

const errors = {
  ru: {
    invalid_request: "Проверьте поля обращения и попробуйте снова.",
    consent_revision_changed: "Документы изменились. Обновите страницу и ознакомьтесь с текущими документами перед новой отправкой.",
    captcha_required: "Повторите проверку SmartCaptcha и отправьте обращение снова.",
    captcha_rejected: "SmartCaptcha не подтвердила проверку. Попробуйте снова.",
    captcha_unavailable: "Проверка SmartCaptcha временно недоступна. Попробуйте позже.",
    rate_limited: "Слишком много попыток. Попробуйте позже.",
    submission_disabled: "Онлайн-отправка сейчас недоступна. Используйте Telegram или email.",
    temporarily_unavailable: "Отправка временно недоступна. Данные сохранены в форме — попробуйте снова позже.",
  },
  en: {
    invalid_request: "Review the enquiry fields and try again.",
    consent_revision_changed: "The documents changed. Refresh the page and review the current documents before submitting again.",
    captcha_required: "Complete SmartCaptcha again and resubmit the enquiry.",
    captcha_rejected: "SmartCaptcha could not confirm the check. Try again.",
    captcha_unavailable: "SmartCaptcha verification is temporarily unavailable. Try again later.",
    rate_limited: "Too many attempts. Try again later.",
    submission_disabled: "Online submission is unavailable. Use Telegram or email instead.",
    temporarily_unavailable: "Submission is temporarily unavailable. Your details remain in the form — try again later.",
  },
} as const satisfies Readonly<Record<ContactLocale, Readonly<Record<ContactErrorCode, string>>>>;

export const CONTACT_SUBMISSION_COPY = {
  ru: {
    busy: "Отправляем обращение…",
    accepted: "Обращение получено. Идентификатор сохранён для подтверждения доставки.",
    errors: errors.ru,
  },
  en: {
    busy: "Sending the enquiry…",
    accepted: "Your enquiry was received. Its request ID is available for delivery confirmation.",
    errors: errors.en,
  },
} as const;

export const normalizeClientDraft = (draft: ContactClientDraft): ContactClientDraft => ({
  ...draft,
  name: draft.name.trim(),
  contact: normalizeContact(draft.contact),
  message: draft.message.trim(),
});

export const contactDraftFingerprint = (draft: ContactClientDraft): string => {
  const normalized = normalizeClientDraft(draft);
  return JSON.stringify([
    normalized.locale,
    normalized.name,
    normalized.contact,
    normalized.message,
    normalized.sourcePath,
    CURRENT_CONTACT_CONSENT_ID,
    normalized.website,
  ]);
};

const temporaryFailure = (requestId: string): ContactSubmitResult => ({
  accepted: false,
  code: "temporarily_unavailable",
  requestId,
});

const readBoundedJson = async (response: Response): Promise<unknown> => {
  if (!JSON_CONTENT_TYPE.test(response.headers.get("content-type") ?? "")) {
    throw new TypeError("invalid_public_response_content_type");
  }
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > PUBLIC_RESPONSE_LIMIT_BYTES) {
      throw new TypeError("invalid_public_response_length");
    }
  }

  const reader = response.body?.getReader();
  if (!reader) throw new TypeError("missing_public_response_body");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > PUBLIC_RESPONSE_LIMIT_BYTES) {
        await reader.cancel();
        throw new TypeError("oversized_public_response");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return JSON.parse(text) as unknown;
};

const exactObject = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
};

const parsePublicResponse = async (
  response: Response,
  requestId: string,
): Promise<ContactSubmitResult> => {
  const value = await readBoundedJson(response);
  if (response.status === 202) {
    if (
      exactObject(value, ["accepted", "requestId"]) &&
      value.accepted === true &&
      value.requestId === requestId
    ) {
      return { accepted: true, requestId };
    }
    return temporaryFailure(requestId);
  }

  if (!exactObject(value, ["error"]) || typeof value.error !== "string") {
    return temporaryFailure(requestId);
  }
  if (!ERROR_CODES.has(value.error)) return temporaryFailure(requestId);
  const code = value.error as ContactErrorCode;
  if (ERROR_STATUS[code] !== response.status) return temporaryFailure(requestId);
  return { accepted: false, code, requestId };
};

export async function submitContactDraft(
  draft: ContactClientDraft,
  dependencies: SubmitContactDraftDependencies,
): Promise<ContactSubmitResult> {
  const requestId = dependencies.requestId ?? dependencies.createRequestId();
  const normalized = normalizeClientDraft(draft);
  const parsed = contactRequestSchema.safeParse({
    requestId,
    locale: normalized.locale,
    name: normalized.name,
    contact: normalized.contact,
    message: normalized.message,
    sourcePath: normalized.sourcePath,
    consentId: CURRENT_CONTACT_CONSENT_ID,
    captchaToken: dependencies.captchaToken,
    website: normalized.website,
  });
  if (!draft.consentAccepted || !parsed.success) {
    return { accepted: false, code: "invalid_request", requestId };
  }

  try {
    const response = await dependencies.fetch("/api/contact", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
      signal: dependencies.signal,
    });
    return await parsePublicResponse(response, requestId);
  } catch {
    return temporaryFailure(requestId);
  }
}

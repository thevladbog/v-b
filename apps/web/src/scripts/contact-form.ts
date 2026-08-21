import type { Locale } from "@vbtech/content";
import {
  CONTACT_SUBMISSION_COPY,
  contactDraftFingerprint,
  normalizeClientDraft,
  submitContactDraft,
  type ContactClientDraft,
} from "../lib/contact-client.js";
import {
  normalizeContact,
  validateDraft,
  type ContactField,
} from "../lib/contact-validation.js";

const FIELD_ORDER: readonly ContactField[] = ["name", "contact", "message", "consent"];
const SMARTCAPTCHA_CLIENT = "https://smartcaptcha.cloud.yandex.ru/captcha.js";
let captchaCallbackSequence = 0;

interface SmartCaptchaOptions {
  sitekey: string;
  hl: Locale;
  invisible: true;
  callback(token: string): void;
  "expired-callback"(): void;
  "error-callback"(): void;
}

interface SmartCaptchaApi {
  render(container: HTMLElement, options: SmartCaptchaOptions): number;
  reset(widgetId: number): void;
  execute(widgetId: number): void;
}

declare global {
  interface Window { smartCaptcha?: SmartCaptchaApi }
}

interface ContactControls {
  name: HTMLInputElement;
  contact: HTMLInputElement;
  message: HTMLTextAreaElement;
  consent: HTMLInputElement;
  submit: HTMLButtonElement;
}

interface CaptchaTokenProvider {
  acquire(): Promise<string>;
  reset(): void;
}

export interface ContactFormDependencies {
  createRequestId(): string;
  fetch: typeof globalThis.fetch;
  captcha: CaptchaTokenProvider;
}

const controlsFor = (form: HTMLFormElement): ContactControls | undefined => {
  const name = form.elements.namedItem("name");
  const contact = form.elements.namedItem("contact");
  const message = form.elements.namedItem("message");
  const consent = form.elements.namedItem("consent");
  const submit = form.querySelector<HTMLButtonElement>("button[type='submit']");
  if (
    !(name instanceof HTMLInputElement) ||
    !(contact instanceof HTMLInputElement) ||
    !(message instanceof HTMLTextAreaElement) ||
    !(consent instanceof HTMLInputElement) ||
    !submit
  ) return undefined;
  return { name, contact, message, consent, submit };
};

const renderValidation = (
  form: HTMLFormElement,
  controls: ContactControls,
  fields: readonly ContactField[],
): void => {
  const invalid = new Set(fields);
  for (const field of FIELD_ORDER) {
    const control = controls[field];
    const error = form.querySelector<HTMLElement>(`#contact-${field}-error`);
    if (invalid.has(field)) control.setAttribute("aria-invalid", "true");
    else control.removeAttribute("aria-invalid");
    if (error) error.textContent = invalid.has(field) ? error.dataset.errorMessage ?? "" : "";
  }
  const summary = form.querySelector<HTMLElement>("[data-contact-errors]");
  if (summary) {
    summary.hidden = fields.length === 0;
    summary.textContent = fields.length === 0 ? "" : form.dataset.errorSummaryMessage ?? "";
  }
};

const setStatus = (form: HTMLFormElement, message: string): void => {
  const status = form.querySelector<HTMLElement>("[data-contact-status]");
  if (!status) return;
  status.textContent = "";
  status.textContent = message;
};

const setBusy = (form: HTMLFormElement, submit: HTMLButtonElement, busy: boolean): void => {
  form.setAttribute("aria-busy", String(busy));
  submit.disabled = busy;
};

const draftFrom = (
  form: HTMLFormElement,
  controls: ContactControls,
  locale: Locale,
): ContactClientDraft => ({
  locale,
  name: controls.name.value,
  contact: controls.contact.value,
  message: controls.message.value,
  sourcePath: form.dataset.sourcePath === "/en/" ? "/en/" : "/",
  consentAccepted: controls.consent.checked,
  website: "",
});

const writeNormalizedDraft = (controls: ContactControls, draft: ContactClientDraft): void => {
  controls.name.value = draft.name;
  controls.contact.value = draft.contact;
  controls.message.value = draft.message;
};

const bindValidationOnlyForm = (form: HTMLFormElement, locale: Locale): void => {
  form.addEventListener("submit", (event) => {
    const name = form.elements.namedItem("name") as HTMLInputElement | null;
    const contact = form.elements.namedItem("contact") as HTMLInputElement | null;
    const message = form.elements.namedItem("message") as HTMLTextAreaElement | null;
    const consent = form.elements.namedItem("consent") as HTMLInputElement | null;
    if (!name || !contact || !message || !consent) return;
    const validation = validateDraft(
      { name: name.value, contact: contact.value, message: message.value, consent: consent.checked },
      locale,
    );
    const invalid = new Set(validation.fields);
    for (const field of FIELD_ORDER) {
      const control = form.elements.namedItem(field) as HTMLInputElement | HTMLTextAreaElement | null;
      const error = form.querySelector<HTMLElement>(`#contact-${field}-error`);
      if (!control || !error) continue;
      if (invalid.has(field)) control.setAttribute("aria-invalid", "true");
      else control.removeAttribute("aria-invalid");
      error.textContent = invalid.has(field) ? error.dataset.errorMessage ?? "" : "";
    }
    const summary = form.querySelector<HTMLElement>("[data-contact-errors]");
    if (summary) {
      summary.hidden = validation.valid;
      summary.textContent = validation.valid ? "" : form.dataset.errorSummaryMessage ?? "";
    }
    if (!validation.valid) {
      event.preventDefault();
      const first = form.elements.namedItem(validation.fields[0] ?? "") as HTMLElement | null;
      first?.focus();
      return;
    }
    name.value = name.value.trim();
    contact.value = normalizeContact(contact.value);
    message.value = message.value.trim();
  });
};

export function bindContactForm(
  form: HTMLFormElement,
  locale: Locale,
  dependencies?: ContactFormDependencies,
): void {
  if (!dependencies) {
    bindValidationOnlyForm(form, locale);
    return;
  }
  const controls = controlsFor(form);
  if (!controls) return;
  let busy = false;
  let pending: { fingerprint: string; requestId: string } | undefined;
  let consentRefreshRequired = false;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy) return;
    if (consentRefreshRequired) {
      setStatus(form, CONTACT_SUBMISSION_COPY[locale].errors.consent_revision_changed);
      form.querySelector<HTMLElement>("[data-contact-consent-link='consent']")?.focus();
      return;
    }
    const draft = draftFrom(form, controls, locale);
    const validation = validateDraft(
      { name: draft.name, contact: draft.contact, message: draft.message, consent: draft.consentAccepted },
      locale,
    );
    renderValidation(form, controls, validation.fields);
    if (!validation.valid) {
      setStatus(form, "");
      controls[validation.fields[0] ?? "name"].focus();
      return;
    }
    const normalized = normalizeClientDraft(draft);
    writeNormalizedDraft(controls, normalized);
    const fingerprint = contactDraftFingerprint(normalized);
    if (!pending || pending.fingerprint !== fingerprint) {
      pending = { fingerprint, requestId: dependencies.createRequestId() };
    }
    busy = true;
    setBusy(form, controls.submit, true);
    setStatus(form, CONTACT_SUBMISSION_COPY[locale].busy);
    void (async () => {
      try {
        let captchaToken: string;
        try {
          captchaToken = await dependencies.captcha.acquire();
        } catch {
          setStatus(form, CONTACT_SUBMISSION_COPY[locale].errors.captcha_unavailable);
          return;
        }
        const result = await submitContactDraft(normalized, {
          requestId: pending!.requestId,
          createRequestId: dependencies.createRequestId,
          captchaToken,
          fetch: dependencies.fetch,
        });
        if (result.accepted) {
          form.reset();
          renderValidation(form, controls, []);
          pending = undefined;
          dependencies.captcha.reset();
          delete form.dataset.consentRefreshRequired;
          setStatus(form, CONTACT_SUBMISSION_COPY[locale].accepted);
          return;
        }
        if (result.code === "consent_revision_changed") {
          pending = undefined;
          consentRefreshRequired = true;
          controls.consent.checked = false;
          form.dataset.consentRefreshRequired = "true";
          setStatus(form, CONTACT_SUBMISSION_COPY[locale].errors[result.code]);
          form.querySelector<HTMLElement>("[data-contact-consent-link='consent']")?.focus();
          return;
        }
        setStatus(form, CONTACT_SUBMISSION_COPY[locale].errors[result.code]);
      } finally {
        busy = false;
        setBusy(form, controls.submit, false);
      }
    })();
  });
}

const loadSmartCaptcha = (
  windowTarget: Window,
  documentTarget: Document,
  timeoutMs: number,
): Promise<SmartCaptchaApi> => {
  if (windowTarget.smartCaptcha) return Promise.resolve(windowTarget.smartCaptcha);
  return new Promise((resolve, reject) => {
    const callbackName = `__vbtechSmartCaptchaOnload${++captchaCallbackSequence}`;
    const script = documentTarget.createElement("script");
    const url = new URL(SMARTCAPTCHA_CLIENT);
    url.searchParams.set("render", "onload");
    url.searchParams.set("onload", callbackName);
    script.src = url.toString();
    script.async = true;
    script.referrerPolicy = "no-referrer";
    let settled = false;
    let timer = 0;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      windowTarget.clearTimeout(timer);
      delete (windowTarget as unknown as Record<string, unknown>)[callbackName];
      if (error) {
        script.remove();
        reject(error);
      } else if (windowTarget.smartCaptcha) resolve(windowTarget.smartCaptcha);
      else reject(new Error("smartcaptcha_api_missing"));
    };
    (windowTarget as unknown as Record<string, unknown>)[callbackName] = () => finish();
    script.addEventListener("error", () => finish(new Error("smartcaptcha_script_error")), { once: true });
    timer = windowTarget.setTimeout(() => finish(new Error("smartcaptcha_script_timeout")), timeoutMs);
    documentTarget.head.append(script);
  });
};

const createCaptchaTokenProvider = (form: HTMLFormElement, locale: Locale): CaptchaTokenProvider => {
  const container = form.querySelector<HTMLElement>("[data-contact-captcha]");
  const siteKey = form.dataset.captchaSiteKey ?? "";
  const parsedTimeout = Number(form.dataset.captchaLoadTimeoutMs);
  const timeoutMs = Number.isSafeInteger(parsedTimeout) && parsedTimeout >= 100 && parsedTimeout <= 15_000
    ? parsedTimeout
    : 5_000;
  let apiPromise: Promise<SmartCaptchaApi> | undefined;
  let api: SmartCaptchaApi | undefined;
  let widgetId: number | undefined;
  let active: { resolve(token: string): void; reject(error: Error): void; timer: number } | undefined;
  const rejectActive = (reason: string) => {
    if (!active) return;
    window.clearTimeout(active.timer);
    const current = active;
    active = undefined;
    current.reject(new Error(reason));
  };
  const resolveActive = (token: string) => {
    if (!active) return;
    if (typeof token !== "string" || token.trim().length === 0) {
      rejectActive("smartcaptcha_empty_token");
      return;
    }
    window.clearTimeout(active.timer);
    const current = active;
    active = undefined;
    current.resolve(token);
  };
  const ensureWidget = async (): Promise<SmartCaptchaApi> => {
    if (!container || !siteKey) throw new Error("smartcaptcha_fixture_config_missing");
    apiPromise ??= loadSmartCaptcha(window, document, timeoutMs).catch((error) => {
      apiPromise = undefined;
      throw error;
    });
    api = await apiPromise;
    widgetId ??= api.render(container, {
      sitekey: siteKey,
      hl: locale,
      invisible: true,
      callback: resolveActive,
      "expired-callback": () => rejectActive("smartcaptcha_expired"),
      "error-callback": () => rejectActive("smartcaptcha_javascript_error"),
    });
    return api;
  };
  return {
    async acquire() {
      const ready = await ensureWidget();
      if (widgetId === undefined) throw new Error("smartcaptcha_widget_missing");
      rejectActive("smartcaptcha_replaced_attempt");
      const token = new Promise<string>((resolve, reject) => {
        active = {
          resolve,
          reject,
          timer: window.setTimeout(() => rejectActive("smartcaptcha_execute_timeout"), timeoutMs),
        };
      });
      ready.reset(widgetId);
      ready.execute(widgetId);
      return token;
    },
    reset() {
      rejectActive("smartcaptcha_reset");
      if (api && widgetId !== undefined) api.reset(widgetId);
    },
  };
};

export function initializeContactForms(documentTarget: Document = document): void {
  const locale: Locale = documentTarget.documentElement.lang === "ru" ? "ru" : "en";
  documentTarget.querySelectorAll<HTMLFormElement>("[data-contact-form]").forEach((form) => {
    if (form.dataset.submissionEnabled !== "true") return;
    bindContactForm(form, locale, {
      createRequestId: () => crypto.randomUUID(),
      fetch: globalThis.fetch.bind(globalThis),
      captcha: createCaptchaTokenProvider(form, locale),
    });
  });
}

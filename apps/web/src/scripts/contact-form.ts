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
const CONTACT_OPERATION_TIMEOUT_MS = 10_000;
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
  destroy?(widgetId: number): void;
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
  fieldset: HTMLFieldSetElement;
}

export interface CaptchaTokenProvider {
  acquire(signal: AbortSignal): Promise<string>;
  reset(): void;
  dispose(): void;
}

export interface ContactClock {
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(timer: unknown): void;
}

export interface ContactFormDependencies {
  createRequestId(): string;
  fetch: typeof globalThis.fetch;
  captcha: CaptchaTokenProvider;
  clock?: ContactClock;
}

export type ContactFormDisposer = () => void;

const formBindings = new WeakMap<HTMLFormElement, ContactFormDisposer>();
const documentBindings = new WeakMap<Document, ContactFormDisposer>();

const isControl = (value: unknown): value is HTMLInputElement | HTMLTextAreaElement =>
  typeof value === "object" && value !== null &&
  typeof (value as { value?: unknown }).value === "string" &&
  typeof (value as { setAttribute?: unknown }).setAttribute === "function" &&
  typeof (value as { removeAttribute?: unknown }).removeAttribute === "function" &&
  typeof (value as { focus?: unknown }).focus === "function";

const controlsFor = (form: HTMLFormElement): ContactControls | undefined => {
  const name = form.elements.namedItem("name");
  const contact = form.elements.namedItem("contact");
  const message = form.elements.namedItem("message");
  const consent = form.elements.namedItem("consent");
  const submit = form.querySelector<HTMLButtonElement>("button[type='submit']");
  const fieldset = form.querySelector<HTMLFieldSetElement>("[data-contact-fields]");
  if (!isControl(name) || !isControl(contact) || !isControl(message) || !isControl(consent) || !submit || !fieldset) {
    return undefined;
  }
  return {
    name: name as HTMLInputElement,
    contact: contact as HTMLInputElement,
    message: message as HTMLTextAreaElement,
    consent: consent as HTMLInputElement,
    submit,
    fieldset,
  };
};

const errorFor = (form: HTMLFormElement, field: ContactField) =>
  form.querySelector<HTMLElement>(`[data-contact-error="${field}"]`);

const renderValidation = (
  form: HTMLFormElement,
  controls: Pick<ContactControls, ContactField>,
  fields: readonly ContactField[],
): void => {
  const invalid = new Set(fields);
  for (const field of FIELD_ORDER) {
    const control = controls[field];
    const error = errorFor(form, field);
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

const freezeVisitorControls = (form: HTMLFormElement, controls: ContactControls): (() => void) => {
  const fieldsetDisabled = controls.fieldset.disabled;
  const submitDisabled = controls.submit.disabled;
  let restored = false;
  form.setAttribute("aria-busy", "true");
  controls.fieldset.disabled = true;
  controls.submit.disabled = true;
  return () => {
    if (restored) return;
    restored = true;
    controls.fieldset.disabled = fieldsetDisabled;
    controls.submit.disabled = submitDisabled;
    form.setAttribute("aria-busy", "false");
  };
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

const createDisposer = (
  form: HTMLFormElement,
  submitHandler: EventListener,
  teardown?: () => void,
): ContactFormDisposer => {
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    form.removeEventListener("submit", submitHandler);
    try {
      teardown?.();
    } catch {
      // Disposal must remain idempotent even if an injected provider cleanup fails.
    } finally {
      if (formBindings.get(form) === dispose) formBindings.delete(form);
    }
  };
  formBindings.set(form, dispose);
  return dispose;
};

const bindValidationOnlyForm = (form: HTMLFormElement, locale: Locale): ContactFormDisposer => {
  const existing = formBindings.get(form);
  if (existing) return existing;
  const submitHandler: EventListener = (event) => {
    const name = form.elements.namedItem("name") as HTMLInputElement | null;
    const contact = form.elements.namedItem("contact") as HTMLInputElement | null;
    const message = form.elements.namedItem("message") as HTMLTextAreaElement | null;
    const consent = form.elements.namedItem("consent") as HTMLInputElement | null;
    if (!name || !contact || !message || !consent) return;
    const validation = validateDraft(
      { name: name.value, contact: contact.value, message: message.value, consent: consent.checked },
      locale,
    );
    renderValidation(form, { name, contact, message, consent }, validation.fields);
    if (!validation.valid) {
      event.preventDefault();
      const first = form.elements.namedItem(validation.fields[0] ?? "") as HTMLElement | null;
      first?.focus();
      return;
    }
    name.value = name.value.trim();
    contact.value = normalizeContact(contact.value);
    message.value = message.value.trim();
  };
  form.addEventListener("submit", submitHandler);
  return createDisposer(form, submitHandler);
};

const defaultClock: ContactClock = {
  setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
  clearTimeout: (timer) => globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>),
};

const operationAbortedError = () => new DOMException("contact_operation_aborted", "AbortError");

const raceWithAbort = <Value>(promise: Promise<Value>, signal: AbortSignal): Promise<Value> => {
  if (signal.aborted) return Promise.reject(operationAbortedError());
  return new Promise<Value>((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      complete();
    };
    const onAbort = () => finish(() => reject(operationAbortedError()));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
};

export function bindContactForm(
  form: HTMLFormElement,
  locale: Locale,
  dependencies?: ContactFormDependencies,
): ContactFormDisposer {
  const existing = formBindings.get(form);
  if (existing) return existing;
  if (!dependencies) return bindValidationOnlyForm(form, locale);
  const controls = controlsFor(form);
  if (!controls) {
    const noOp = () => {
      if (formBindings.get(form) === noOp) formBindings.delete(form);
    };
    formBindings.set(form, noOp);
    return noOp;
  }

  const clock = dependencies.clock ?? defaultClock;
  const resetCaptcha = () => {
    try {
      dependencies.captcha.reset();
    } catch {
      // Provider cleanup cannot be allowed to strand the visitor in a busy state.
    }
  };
  let busy = false;
  let disposed = false;
  let pending: { fingerprint: string; requestId: string } | undefined;
  let consentRefreshRequired = false;
  let activeAttempt: {
    controller: AbortController;
    timer: unknown;
    restore(): void;
  } | undefined;

  const submitHandler: EventListener = (event) => {
    event.preventDefault();
    if (busy || disposed) return;
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
    const restore = freezeVisitorControls(form, controls);
    const controller = new AbortController();
    const timer = clock.setTimeout(() => {
      controller.abort();
      resetCaptcha();
    }, CONTACT_OPERATION_TIMEOUT_MS);
    activeAttempt = { controller, timer, restore };
    setStatus(form, CONTACT_SUBMISSION_COPY[locale].busy);

    void (async () => {
      try {
        let captchaToken: string;
        try {
          captchaToken = await raceWithAbort(
            dependencies.captcha.acquire(controller.signal),
            controller.signal,
          );
        } catch {
          if (!disposed) {
            const message = controller.signal.aborted
              ? CONTACT_SUBMISSION_COPY[locale].errors.temporarily_unavailable
              : CONTACT_SUBMISSION_COPY[locale].errors.captcha_unavailable;
            setStatus(form, message);
          }
          return;
        }
        if (disposed) return;
        if (controller.signal.aborted) {
          setStatus(form, CONTACT_SUBMISSION_COPY[locale].errors.temporarily_unavailable);
          return;
        }
        const result = await submitContactDraft(normalized, {
          requestId: pending!.requestId,
          createRequestId: dependencies.createRequestId,
          captchaToken,
          fetch: dependencies.fetch,
          signal: controller.signal,
        });
        if (disposed) return;
        pending = { fingerprint, requestId: result.requestId };
        if (result.accepted) {
          form.reset();
          renderValidation(form, controls, []);
          pending = undefined;
          resetCaptcha();
          delete form.dataset.consentRefreshRequired;
          setStatus(form, `${CONTACT_SUBMISSION_COPY[locale].accepted} ${result.requestId}.`);
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
        if (activeAttempt?.controller === controller) {
          clock.clearTimeout(activeAttempt.timer);
          activeAttempt = undefined;
        }
        if (!disposed) {
          busy = false;
          restore();
        }
      }
    })();
  };

  form.addEventListener("submit", submitHandler);
  const dispose = createDisposer(form, submitHandler, () => {
    disposed = true;
    busy = false;
    if (activeAttempt) {
      clock.clearTimeout(activeAttempt.timer);
      activeAttempt.controller.abort();
      activeAttempt.restore();
      activeAttempt = undefined;
    }
    dependencies.captcha.dispose();
  });
  return dispose;
}

interface CaptchaLoaderState {
  callbackName: string;
  promise: Promise<SmartCaptchaApi>;
  release(): void;
  subscribers: number;
  settled: boolean;
}

interface CaptchaLoaderSubscription {
  promise: Promise<SmartCaptchaApi>;
  release(): void;
}

const captchaLoaders = new WeakMap<Document, CaptchaLoaderState>();

const subscribeSmartCaptcha = (
  windowTarget: Window,
  documentTarget: Document,
  timeoutMs: number,
): CaptchaLoaderSubscription => {
  let state = captchaLoaders.get(documentTarget);
  if (!state) {
    const callbackName = `__vbtechSmartCaptchaOnload${++captchaCallbackSequence}`;
    const script = documentTarget.createElement("script");
    const url = new URL(SMARTCAPTCHA_CLIENT);
    url.searchParams.set("render", "onload");
    url.searchParams.set("onload", callbackName);
    script.src = url.toString();
    script.async = true;
    script.referrerPolicy = "no-referrer";
    let timer = 0;
    let resolvePromise!: (api: SmartCaptchaApi) => void;
    let rejectPromise!: (error: Error) => void;
    const promise = new Promise<SmartCaptchaApi>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const created: CaptchaLoaderState = {
      callbackName,
      promise,
      subscribers: 0,
      settled: false,
      release() {
        if (created.subscribers > 0) created.subscribers -= 1;
        if (created.subscribers === 0 && !created.settled) fail(new Error("smartcaptcha_no_subscribers"));
      },
    };
    const onScriptError = () => fail(new Error("smartcaptcha_script_error"));
    const clearPending = () => {
      windowTarget.clearTimeout(timer);
      script.removeEventListener("error", onScriptError);
      delete (windowTarget as unknown as Record<string, unknown>)[callbackName];
    };
    const fail = (error: Error) => {
      if (created.settled) return;
      created.settled = true;
      clearPending();
      script.remove();
      if (captchaLoaders.get(documentTarget) === created) captchaLoaders.delete(documentTarget);
      rejectPromise(error);
    };
    const succeed = () => {
      if (created.settled) return;
      if (!windowTarget.smartCaptcha) {
        fail(new Error("smartcaptcha_api_missing"));
        return;
      }
      created.settled = true;
      clearPending();
      resolvePromise(windowTarget.smartCaptcha);
    };
    (windowTarget as unknown as Record<string, unknown>)[callbackName] = succeed;
    script.addEventListener("error", onScriptError, { once: true });
    timer = windowTarget.setTimeout(() => fail(new Error("smartcaptcha_script_timeout")), timeoutMs);
    captchaLoaders.set(documentTarget, created);
    documentTarget.head.append(script);
    state = created;
  }
  state.subscribers += 1;
  let released = false;
  return {
    promise: state.promise,
    release() {
      if (released) return;
      released = true;
      state!.release();
    },
  };
};

const createCaptchaTokenProvider = (
  form: HTMLFormElement,
  locale: Locale,
  windowTarget: Window,
  documentTarget: Document,
): CaptchaTokenProvider => {
  const container = form.querySelector<HTMLElement>("[data-contact-captcha]");
  const siteKey = form.dataset.captchaSiteKey ?? "";
  const parsedTimeout = Number(form.dataset.captchaLoadTimeoutMs);
  const timeoutMs = Number.isSafeInteger(parsedTimeout) && parsedTimeout >= 100 && parsedTimeout <= 15_000
    ? parsedTimeout
    : 5_000;
  let subscription: CaptchaLoaderSubscription | undefined;
  let api: SmartCaptchaApi | undefined;
  let widgetId: number | undefined;
  let disposed = false;
  let active: { resolve(token: string): void; reject(error: Error): void; timer: number } | undefined;
  const rejectActive = (reason: string) => {
    if (!active) return;
    windowTarget.clearTimeout(active.timer);
    const current = active;
    active = undefined;
    current.reject(new Error(reason));
  };
  const resolveActive = (token: string) => {
    if (disposed || !active) return;
    if (typeof token !== "string" || token.trim().length === 0) {
      rejectActive("smartcaptcha_empty_token");
      return;
    }
    windowTarget.clearTimeout(active.timer);
    const current = active;
    active = undefined;
    current.resolve(token);
  };
  const ensureWidget = async (signal: AbortSignal): Promise<SmartCaptchaApi> => {
    if (disposed) throw new Error("smartcaptcha_provider_disposed");
    if (!container || !siteKey) throw new Error("smartcaptcha_fixture_config_missing");
    subscription ??= subscribeSmartCaptcha(windowTarget, documentTarget, timeoutMs);
    const currentSubscription = subscription;
    try {
      api = await raceWithAbort(currentSubscription.promise, signal);
    } catch (error) {
      if (subscription === currentSubscription) {
        currentSubscription.release();
        subscription = undefined;
      }
      throw error;
    }
    if (disposed || signal.aborted) throw operationAbortedError();
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
    async acquire(signal) {
      const ready = await ensureWidget(signal);
      if (disposed || signal.aborted) throw operationAbortedError();
      if (widgetId === undefined) throw new Error("smartcaptcha_widget_missing");
      rejectActive("smartcaptcha_replaced_attempt");
      const token = new Promise<string>((resolve, reject) => {
        active = {
          resolve,
          reject,
          timer: windowTarget.setTimeout(() => rejectActive("smartcaptcha_execute_timeout"), timeoutMs),
        };
      });
      ready.reset(widgetId);
      ready.execute(widgetId);
      try {
        return await raceWithAbort(token, signal);
      } catch (error) {
        if (signal.aborted) rejectActive("smartcaptcha_operation_aborted");
        throw error;
      }
    },
    reset() {
      rejectActive("smartcaptcha_reset");
      if (!disposed && api && widgetId !== undefined) {
        try {
          api.reset(widgetId);
        } catch {
          // Reset is best-effort cleanup; the next acquire still requests a new token.
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      rejectActive("smartcaptcha_provider_disposed");
      subscription?.release();
      subscription = undefined;
      try {
        if (api && widgetId !== undefined) {
          if (api.destroy) api.destroy(widgetId);
          else api.reset(widgetId);
        }
      } catch {
        // DOM cleanup below still removes this form's widget surface.
      } finally {
        widgetId = undefined;
        container?.replaceChildren();
      }
    },
  };
};

export function disposeContactForm(form: HTMLFormElement): void {
  formBindings.get(form)?.();
}

export function initializeContactForms(documentTarget: Document = document): ContactFormDisposer {
  const existing = documentBindings.get(documentTarget);
  if (existing) return existing;
  const locale: Locale = documentTarget.documentElement.lang === "ru" ? "ru" : "en";
  const disposers: ContactFormDisposer[] = [];
  const windowTarget = documentTarget.defaultView;
  if (windowTarget) {
    documentTarget.querySelectorAll<HTMLFormElement>("[data-contact-form]").forEach((form) => {
      if (form.dataset.submissionEnabled !== "true") return;
      disposers.push(bindContactForm(form, locale, {
        createRequestId: () => windowTarget.crypto.randomUUID(),
        fetch: windowTarget.fetch.bind(windowTarget),
        captcha: createCaptchaTokenProvider(form, locale, windowTarget, documentTarget),
      }));
    });
  }
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const formDispose of disposers) formDispose();
    if (documentBindings.get(documentTarget) === dispose) documentBindings.delete(documentTarget);
  };
  documentBindings.set(documentTarget, dispose);
  return dispose;
}

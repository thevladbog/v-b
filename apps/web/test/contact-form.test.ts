import { describe, expect, it, vi } from "vitest";
import {
  bindContactForm,
  type ContactFormDependencies,
} from "../src/scripts/contact-form.js";

type SubmitListener = (event: { preventDefault(): void }) => void;

class FakeControl {
  value = "";
  checked = false;
  disabled = false;
  focused = false;
  readonly attributes = new Map<string, string>();

  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  focus() { this.focused = true; }
}

class FakeForm {
  readonly controls = {
    name: new FakeControl(),
    contact: new FakeControl(),
    message: new FakeControl(),
    consent: new FakeControl(),
  };
  readonly submitControl = new FakeControl();
  readonly fieldset = new FakeControl();
  readonly summary = { hidden: true, textContent: "" };
  readonly status = { textContent: "" };
  readonly consentLink = new FakeControl();
  readonly errors = Object.fromEntries(
    Object.keys(this.controls).map((field) => [
      field,
      { dataset: { errorMessage: `error:${field}` }, textContent: "" },
    ]),
  ) as Record<string, { dataset: { errorMessage: string }; textContent: string }>;
  readonly attributes = new Map<string, string>();
  readonly listeners = new Set<SubmitListener>();
  readonly dataset: Record<string, string> = {
    errorSummaryMessage: "summary",
    sourcePath: "/en/",
  };
  resetCount = 0;
  readonly elements = {
    namedItem: (name: string) => this.controls[name as keyof typeof this.controls] ?? null,
  };

  querySelector(selector: string) {
    if (selector === "button[type='submit']") return this.submitControl;
    if (selector === "[data-contact-fields]") return this.fieldset;
    if (selector === "[data-contact-errors]") return this.summary;
    if (selector === "[data-contact-status]") return this.status;
    if (selector === "[data-contact-consent-link='consent']") return this.consentLink;
    const error = selector.match(/^\[data-contact-error="(.+)"\]$/)?.[1];
    return error ? this.errors[error] ?? null : null;
  }

  addEventListener(type: string, listener: SubmitListener) {
    if (type === "submit") this.listeners.add(listener);
  }

  removeEventListener(type: string, listener: SubmitListener) {
    if (type === "submit") this.listeners.delete(listener);
  }

  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }

  reset() {
    this.resetCount += 1;
    for (const control of Object.values(this.controls)) {
      control.value = "";
      control.checked = false;
    }
  }

  submit() {
    let prevented = false;
    for (const listener of this.listeners) {
      listener({ preventDefault: () => { prevented = true; } });
    }
    return prevented;
  }
}

const fillValid = (form: FakeForm) => {
  form.controls.name.value = "  Vlad  ";
  form.controls.contact.value = "  @abc_1  ";
  form.controls.message.value = "  Project enquiry  ";
  form.controls.consent.checked = true;
};

const validationSetup = () => {
  const form = new FakeForm();
  const dispose = bindContactForm(form as unknown as HTMLFormElement, "en");
  return { form, dispose };
};

const enhancedDependencies = (
  overrides: Partial<ContactFormDependencies> = {},
): ContactFormDependencies => ({
  createRequestId: () => "11111111-1111-4111-8111-111111111111",
  fetch: vi.fn(async (_input, init) => {
    const requestId = (JSON.parse(String(init?.body)) as { requestId: string }).requestId;
    return new Response(JSON.stringify({ accepted: true, requestId }), {
      status: 202,
      headers: { "content-type": "application/json" },
    });
  }),
  captcha: {
    acquire: vi.fn(async () => "one-time-token"),
    reset: vi.fn(),
    dispose: vi.fn(),
  },
  ...overrides,
});

describe("contact form binding", () => {
  it("prevents an invalid native submit, renders localized errors, and focuses the first field", () => {
    const { form } = validationSetup();
    expect(form.submit()).toBe(true);
    expect(form.summary).toEqual({ hidden: false, textContent: "summary" });
    expect(form.controls.name.focused).toBe(true);
    for (const [field, control] of Object.entries(form.controls)) {
      expect(control.attributes.get("aria-invalid")).toBe("true");
      expect(form.errors[field]?.textContent).toBe(`error:${field}`);
    }
  });

  it("clears prior errors and permits a valid native POST", () => {
    const { form } = validationSetup();
    form.submit();
    fillValid(form);
    expect(form.submit()).toBe(false);
    expect(form.summary).toEqual({ hidden: true, textContent: "" });
    expect(form.controls.name.value).toBe("Vlad");
    expect(form.controls.contact.value).toBe("@abc_1");
    expect(form.controls.message.value).toBe("Project enquiry");
    for (const [field, control] of Object.entries(form.controls)) {
      expect(control.attributes.has("aria-invalid")).toBe(false);
      expect(form.errors[field]?.textContent).toBe("");
    }
  });

  it("preserves typed whitespace when the submit attempt is invalid", () => {
    const { form } = validationSetup();
    fillValid(form);
    form.controls.consent.checked = false;
    form.submit();
    expect(form.controls.name.value).toBe("  Vlad  ");
    expect(form.controls.contact.value).toBe("  @abc_1  ");
    expect(form.controls.message.value).toBe("  Project enquiry  ");
  });

  it("is idempotent per form and returns a reusable disposer", () => {
    const form = new FakeForm();
    const dependencies = enhancedDependencies();
    const first = bindContactForm(form as unknown as HTMLFormElement, "en", dependencies);
    const second = bindContactForm(form as unknown as HTMLFormElement, "en", dependencies);
    expect(first).toBe(second);
    expect(form.listeners).toHaveLength(1);
    expect(typeof first).toBe("function");
    first();
    first();
    expect(form.listeners).toHaveLength(0);
    expect(dependencies.captcha.dispose).toHaveBeenCalledTimes(1);
  });

  it("uses an immutable ten-second full-operation timeout and restores frozen visitor controls", async () => {
    const form = new FakeForm();
    fillValid(form);
    const timers = new Map<number, { callback(): void; milliseconds: number }>();
    let nextTimer = 0;
    let submittedSignal: AbortSignal | undefined;
    const dependencies = enhancedDependencies({
      fetch: vi.fn(async (_input, init) => {
        submittedSignal = init?.signal ?? undefined;
        return await new Promise<Response>((_resolve, reject) => {
          submittedSignal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      }),
      clock: {
        setTimeout(callback, milliseconds) {
          const id = ++nextTimer;
          timers.set(id, { callback, milliseconds });
          return id;
        },
        clearTimeout(id) { timers.delete(id); },
      },
    } as Partial<ContactFormDependencies>);
    bindContactForm(form as unknown as HTMLFormElement, "en", dependencies);
    form.submit();
    await vi.waitFor(() => expect(submittedSignal).toBeDefined());
    expect([...timers.values()].map(({ milliseconds }) => milliseconds)).toContain(10_000);
    expect(form.fieldset.disabled).toBe(true);
    expect(form.attributes.get("aria-busy")).toBe("true");
    [...timers.values()].find(({ milliseconds }) => milliseconds === 10_000)!.callback();
    await vi.waitFor(() => expect(form.status.textContent).toMatch(/temporarily unavailable/i));
    expect(submittedSignal?.aborted).toBe(true);
    expect(form.fieldset.disabled).toBe(false);
    expect(form.submitControl.disabled).toBe(false);
    expect(form.attributes.get("aria-busy")).toBe("false");
  });

  it("aborts on teardown and ignores a late accepted response without mutating the disposed form", async () => {
    const form = new FakeForm();
    fillValid(form);
    let resolveResponse: ((response: Response) => void) | undefined;
    let signal: AbortSignal | undefined;
    const dependencies = enhancedDependencies({
      fetch: vi.fn(async (_input, init) => {
        signal = init?.signal ?? undefined;
        return await new Promise<Response>((resolve) => { resolveResponse = resolve; });
      }),
    });
    const dispose = bindContactForm(form as unknown as HTMLFormElement, "en", dependencies);
    form.submit();
    await vi.waitFor(() => expect(resolveResponse).toBeDefined());
    dispose();
    const statusAfterDispose = form.status.textContent;
    resolveResponse!(new Response(JSON.stringify({
      accepted: true,
      requestId: "11111111-1111-4111-8111-111111111111",
    }), { status: 202, headers: { "content-type": "application/json" } }));
    await Promise.resolve();
    await Promise.resolve();
    expect(signal?.aborted).toBe(true);
    expect(form.listeners).toHaveLength(0);
    expect(form.resetCount).toBe(0);
    expect(form.status.textContent).toBe(statusAfterDispose);
    expect(dependencies.captcha.dispose).toHaveBeenCalledTimes(1);
  });

  it("announces the canonical accepted UUID as a transient reference", async () => {
    const form = new FakeForm();
    fillValid(form);
    const uppercase = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
    bindContactForm(form as unknown as HTMLFormElement, "en", enhancedDependencies({
      createRequestId: () => uppercase,
    }));
    form.submit();
    await vi.waitFor(() => expect(form.status.textContent).toContain(uppercase.toLowerCase()));
    expect(form.status.textContent).toMatch(/reference/i);
  });
});

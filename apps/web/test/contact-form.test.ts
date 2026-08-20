import { describe, expect, it } from "vitest";
import { bindContactForm } from "../src/scripts/contact-form.js";

type SubmitListener = (event: { preventDefault(): void }) => void;

class FakeControl {
  value = "";
  checked = false;
  focused = false;
  readonly attributes = new Map<string, string>();

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }

  focus() {
    this.focused = true;
  }
}

const setup = () => {
  const controls = {
    name: new FakeControl(),
    contact: new FakeControl(),
    message: new FakeControl(),
    consent: new FakeControl(),
  };
  const errors = Object.fromEntries(
    Object.keys(controls).map((field) => [
      `#contact-${field}-error`,
      { dataset: { errorMessage: `error:${field}` }, textContent: "" },
    ]),
  );
  const summary = { hidden: true, textContent: "" };
  let submit: SubmitListener | undefined;
  const form = {
    dataset: { errorSummaryMessage: "summary" },
    elements: { namedItem: (name: string) => controls[name as keyof typeof controls] ?? null },
    querySelector: (selector: string) =>
      selector === "[data-contact-errors]" ? summary : errors[selector] ?? null,
    addEventListener: (type: string, listener: SubmitListener) => {
      if (type === "submit") submit = listener;
    },
  };
  bindContactForm(form as unknown as HTMLFormElement, "en");
  return { controls, errors, summary, submit: () => submit };
};

describe("contact form binding", () => {
  it("prevents an invalid native submit, renders localized errors, and focuses the first field", () => {
    const { controls, errors, summary, submit } = setup();
    let prevented = false;

    submit()?.({ preventDefault: () => { prevented = true; } });

    expect(prevented).toBe(true);
    expect(summary).toEqual({ hidden: false, textContent: "summary" });
    expect(controls.name.focused).toBe(true);
    for (const [field, control] of Object.entries(controls)) {
      expect(control.attributes.get("aria-invalid")).toBe("true");
      expect(errors[`#contact-${field}-error`]?.textContent).toBe(`error:${field}`);
    }
  });

  it("clears prior errors and permits a valid native POST", () => {
    const { controls, errors, summary, submit } = setup();
    submit()?.({ preventDefault() {} });
    controls.name.value = "Vlad";
    controls.contact.value = "@abc_1";
    controls.message.value = "Project enquiry";
    controls.consent.checked = true;
    let prevented = false;

    submit()?.({ preventDefault: () => { prevented = true; } });

    expect(prevented).toBe(false);
    expect(summary).toEqual({ hidden: true, textContent: "" });
    for (const [field, control] of Object.entries(controls)) {
      expect(control.attributes.has("aria-invalid")).toBe(false);
      expect(errors[`#contact-${field}-error`]?.textContent).toBe("");
    }
  });
});

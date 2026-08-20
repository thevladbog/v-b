import {
  normalizeContact,
  validateDraft,
  type ContactField,
} from "../lib/contact-validation.js";
import type { Locale } from "@vbtech/content";

const FIELD_ORDER: readonly ContactField[] = ["name", "contact", "message", "consent"];

export function bindContactForm(form: HTMLFormElement, locale: Locale): void {
  form.addEventListener("submit", (event) => {
    const name = form.elements.namedItem("name") as HTMLInputElement | null;
    const contact = form.elements.namedItem("contact") as HTMLInputElement | null;
    const message = form.elements.namedItem("message") as HTMLTextAreaElement | null;
    const consent = form.elements.namedItem("consent") as HTMLInputElement | null;
    if (!name || !contact || !message || !consent) return;

    const validation = validateDraft(
      {
        name: name.value,
        contact: contact.value,
        message: message.value,
        consent: consent.checked,
      },
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
}

export function initializeContactForms(documentTarget: Document = document): void {
  const locale: Locale = documentTarget.documentElement.lang === "ru" ? "ru" : "en";

  documentTarget.querySelectorAll<HTMLFormElement>("[data-contact-form]").forEach((form) => {
    if (form.dataset.submissionEnabled !== "true") return;
    bindContactForm(form, locale);
  });
}

import { SITE_CONTENT } from "@vbtech/content";
import { serializeLlmsText } from "../lib/llms.js";

export const prerender = true;

const page = SITE_CONTENT.en;
const body = serializeLlmsText({
  title: "v-b.tech — Vlad Bogatyrev",
  description: page.meta.description,
  canonicalPages: [
    { label: "Russian", href: "https://v-b.tech/" },
    { label: "English", href: "https://v-b.tech/en/" },
  ],
  services: page.expertise.items,
  projects: page.cases,
  legalDrafts: [
    { label: "Legal register", href: "https://v-b.tech/legal/" },
    { label: "Privacy draft", href: "https://v-b.tech/privacy/" },
    { label: "Personal data consent draft", href: "https://v-b.tech/personal-data-consent/" },
    { label: "English legal register", href: "https://v-b.tech/en/legal/" },
    { label: "English privacy draft", href: "https://v-b.tech/en/privacy/" },
    {
      label: "English personal data consent draft",
      href: "https://v-b.tech/en/personal-data-consent/",
    },
  ],
});

export function GET(): Response {
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

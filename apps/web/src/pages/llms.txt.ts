import { SITE_CONTENT } from "@vbtech/content";

export const prerender = true;

const page = SITE_CONTENT.en;
const serviceLines = page.expertise.items
  .map((service) => `- ${service.title}: ${service.description}`)
  .join("\n");
const projectLines = page.cases
  .map((project) => `- ${project.name}: ${project.outcome} ${project.href}`)
  .join("\n");

const body = `# v-b.tech — Vlad Bogatyrev

${page.meta.description}

## Canonical pages

- Russian: https://v-b.tech/
- English: https://v-b.tech/en/

## Services

${serviceLines}

## Selected projects

${projectLines}

## Legal drafts

- Legal register: https://v-b.tech/legal/
- Privacy draft: https://v-b.tech/privacy/
- Personal data consent draft: https://v-b.tech/personal-data-consent/
- English legal register: https://v-b.tech/en/legal/
- English privacy draft: https://v-b.tech/en/privacy/
- English personal data consent draft: https://v-b.tech/en/personal-data-consent/
`;

export function GET(): Response {
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

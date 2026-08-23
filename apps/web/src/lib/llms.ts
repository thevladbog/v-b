interface Link {
  readonly label: string;
  readonly href: string;
}

interface Service {
  readonly title: string;
  readonly description: string;
}

interface Project {
  readonly name: string;
  readonly outcome: string;
  readonly href: string;
}

export interface LlmsTextInput {
  readonly title: string;
  readonly description: string;
  readonly canonicalPages: readonly Link[];
  readonly services: readonly Service[];
  readonly projects: readonly Project[];
  readonly legalDocuments: readonly Link[];
}

const linesForLinks = (links: readonly Link[]) =>
  links.map(({ label, href }) => `- ${label}: ${href}`).join("\n");

export function serializeLlmsText(input: LlmsTextInput): string {
  const serviceLines = input.services
    .map(({ title, description }) => `- ${title}: ${description}`)
    .join("\n");
  const projectLines = input.projects
    .map(({ name, outcome, href }) => `- ${name}: ${outcome} ${href}`)
    .join("\n");

  return `# ${input.title}

${input.description}

## Canonical pages

${linesForLinks(input.canonicalPages)}

## Services

${serviceLines}

## Selected projects

${projectLines}

## Legal documents

${linesForLinks(input.legalDocuments)}
`;
}

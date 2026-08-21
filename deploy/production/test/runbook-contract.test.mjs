import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const runbookNames = ["publication", "form-activation", "data-retention", "rollback"];

async function runbook(name) {
  return readFile(new URL(`docs/runbooks/${name}.md`, root), "utf8");
}

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

function commandBody(source, title) {
  const heading = `### Command: ${title}`;
  const headingStart = source.indexOf(heading);
  assert.ok(headingStart >= 0, `missing command ${title}`);
  const fenceStart = source.indexOf("```bash\n", headingStart);
  const fenceEnd = source.indexOf("\n```", fenceStart);
  assert.ok(fenceStart >= 0 && fenceEnd > fenceStart, `missing bash body for ${title}`);
  return source.slice(fenceStart + "```bash\n".length, fenceEnd);
}

function assertOrdered(source, labels) {
  let previous = -1;
  for (const label of labels) {
    const position = source.indexOf(`Gate ID: \`${label}\``);
    assert.ok(position >= 0, `missing gate ${label}`);
    assert.ok(position > previous, `gate ${label} is out of order`);
    previous = position;
  }
}

function commandCards(source, name) {
  const blocks = [...source.matchAll(/```bash\n([\s\S]*?)\n```/g)];
  const cards = [...source.matchAll(
    /### Command: ([^\n]+)\n\n- Target\/resource: ([^\n]+)\n- Classification: \*\*(READ-ONLY|MUTATING)\*\*\n- Expected output: ([^\n]+)\n- Bounded failure branch: ([^\n]+)\n\n```bash\n([\s\S]*?)\n```/g,
  )];

  assert.ok(blocks.length > 0, `${name} must include at least one command card`);
  assert.equal(cards.length, blocks.length, `${name} has an unclassified operational command`);

  for (const [, title, target, classification, expected, failure, command] of cards) {
    for (const [field, value] of Object.entries({ title, target, expected, failure })) {
      assert.ok(value.trim().length >= 12, `${name} command ${field} is not operationally specific`);
    }
    assert.match(failure, /stop|abort|do not|escalate|restore|retain/i);
    assert.doesNotMatch(command, /(?:--data(?:-raw)?|-d\s|--form)\b/i);
    assert.doesNotMatch(command, /(?:echo|printf|printenv|env)\b[^\n]*(?:secret|token|password|database_url)/i);
    assert.doesNotMatch(
      command,
      /(?:select|returning)\s+(?:payload_ciphertext|payload_iv|payload_auth_tag)\b/i,
    );
    assert.ok(["READ-ONLY", "MUTATING"].includes(classification));
  }
}

function operatorCards(source, name) {
  const headings = [...source.matchAll(/^### Operator card: ([^\n]+)$/gm)];
  const cards = [...source.matchAll(
    /### Operator card: ([^\n]+)\n\n- Target\/resource: ([^\n]+)\n- Classification: \*\*(READ-ONLY|MUTATING)\*\*\n- Required evidence: ([^\n]+)\n- Expected output: ([^\n]+)\n- Bounded failure branch: ([^\n]+)/g,
  )];

  assert.ok(cards.length > 0, `${name} must include at least one operator card`);
  assert.equal(cards.length, headings.length, `${name} has an unclassified operator step`);
  for (const [, title, target, classification, required, expected, failure] of cards) {
    for (const [field, value] of Object.entries({ title, target, required, expected, failure })) {
      assert.ok(value.trim().length >= 12, `${name} operator ${field} is not specific`);
    }
    assert.match(failure, /stop|abort|do not|escalate|restore|retain/i);
    assert.ok(["READ-ONLY", "MUTATING"].includes(classification));
  }
  return cards.map((card) => ({ title: card[1], classification: card[3] }));
}

test("publication separates artifact approval from ordered cloud and disabled-runtime mutation", async () => {
  const source = await runbook("publication");

  assertOrdered(source, [
    "runtime-inventory",
    "dns-inventory",
    "publication-approval",
    "immutable-publication",
    "cloud-runtime-approval",
    "isolated-database",
    "runtime-secrets",
    "least-privilege-permissions",
    "database-bootstrap",
    "disabled-function-deploy",
    "disabled-web-deploy",
    "private-smoke",
    "private-legal-contact-evidence",
    "dns-approval",
    "dns-mutation",
    "public-smoke",
    "public-legal-contact-evidence",
  ]);
  assert.match(source, /release-time evidence placeholder/i);
  assert.match(source, /fail(?:s|ed)? closed/i);
  assert.match(source, /cloud\/database\/private runtime mutation approval ID/i);
  assert.match(source, /publication approval[^\n]*does not authorize[^\n]*(?:cloud|database|runtime)/i);
  assert.match(source, /Task 8[^\n]*Step 1/i);
  assert.match(source, /remote deployment executor[^\n]*not configured/i);
  assert.match(source, /DNS approval ID/i);
  assert.match(source, /form activation requires a separate approval/i);
  const operators = operatorCards(source, "publication");
  assert.ok(operators.some(({ title, classification }) => /runtime inventory/i.test(title) && classification === "READ-ONLY"));
  assert.ok(operators.some(({ title, classification }) => /DNS.*inventory/i.test(title) && classification === "READ-ONLY"));
  commandCards(source, "publication");
});

test("route smoke is supplemented by bounded legal-release and direct-contact evidence", async () => {
  const publication = await runbook("publication");
  const rollback = await runbook("rollback");

  const expectedResponseOrder = [
    "ru-home.html",
    "en-home.html",
    "ru-policy.html",
    "en-policy.html",
    "ru-consent.html",
    "en-consent.html",
  ];

  assert.match(publication, /17-check route smoke does not verify[^\n]*legal[^\n]*direct contacts/i);
  assert.match(publication, /### Command: Verify private legal releases and direct contacts/);
  assert.match(publication, /### Command: Verify public legal releases and direct contacts/);
  assert.match(rollback, /### Command: Verify preserved legal releases and direct contacts/);
  for (const document of [publication, rollback]) {
    assert.match(document, /curl[^\n]*--max-filesize/);
    assert.match(document, /VBT-PD-01\/DRAFT/);
    assert.match(document, /VBT-PD-02\/DRAFT/);
    assert.match(document, /mailto:hello@v-b\.tech/);
    assert.match(document, /https:\/\/t\.me\/thevladbog/);
  }
  for (const [document, title] of [
    [publication, "Verify private legal releases and direct contacts"],
    [publication, "Verify public legal releases and direct contacts"],
    [rollback, "Verify preserved legal releases and direct contacts"],
  ]) {
    const command = commandBody(document, title);
    const checksStart = command.indexOf("const checks = ");
    const checksEnd = command.indexOf("; const hashes =", checksStart);
    assert.ok(checksStart >= 0 && checksEnd > checksStart, `${title} must define hash order`);
    const responseOrder = [...command.slice(checksStart, checksEnd).matchAll(
      /"((?:ru|en)-(?:home|policy|consent)\.html)"/g,
    )].map((match) => match[1]);

    assert.deepEqual(responseOrder, expectedResponseOrder, `${title} hash order must be stable`);
    assert.match(command, /import \{ createHash \} from "node:crypto"/);
    assert.match(command, /createHash\("sha256"\)\.update\(body\)\.digest\("hex"\)/);
    assert.match(command, /responses: hashes/);
  }
  assert.match(rollback, /tabletop[^\n]*legal\/contact evidence[^\n]*passed/i);
});

test("form activation requires approved active legal releases and its own approval before mutation", async () => {
  const source = await runbook("form-activation");

  assertOrdered(source, [
    "legal-approval",
    "active-artifact-proof",
    "form-activation-approval",
    "backend-enable",
    "web-enable",
    "public-form-smoke",
  ]);
  assert.match(source, /VBT-PD-01[^\n]*ACTIVE/i);
  assert.match(source, /VBT-PD-02[^\n]*ACTIVE/i);
  assert.match(source, /form activation approval ID/i);
  assert.match(source, /DNS approval[^\n]*does not authorize[^\n]*form activation/i);
  assert.match(source, /controlled non-sensitive test data/i);
  commandCards(source, "form-activation");
});

test("monthly retention evidence covers terminal payload, metadata, and mailbox lifecycle", async () => {
  const source = await runbook("data-retention");

  assert.match(source, /monthly/i);
  assert.match(source, /terminal payload[^\n]*24 hours/i);
  assert.match(source, /terminal metadata[^\n]*30 days/i);
  assert.match(source, /business mailbox/i);
  assert.match(source, /no more than one year after (?:the )?last substantive contact/i);
  assert.match(source, /separate documented legal basis/i);
  assert.match(source, /metadata-only/i);
  assert.doesNotMatch(source, /request bod(?:y|ies)|decrypted payloads?|captcha tokens?/i);
  commandCards(source, "data-retention");
});

test("tabletop rollback disables the form first while preserving legal and direct-contact routes", async () => {
  const source = await runbook("rollback");
  const rows = [...source.matchAll(
    /^\|\s*(\d+)\s*\|\s*`([^`]+)`\s*\|\s*(enabled|disabled)\s*\|\s*(kept|removed)\s*\|\s*(kept|removed)\s*\|$/gm,
  )].map((match) => ({
    order: Number(match[1]),
    action: match[2],
    form: match[3],
    legal: match[4],
    contacts: match[5],
  }));

  assert.ok(rows.length >= 3, "tabletop must exercise at least three rollback actions");
  assert.deepEqual(rows[0], {
    order: 1,
    action: "disable-public-form",
    form: "disabled",
    legal: "kept",
    contacts: "kept",
  });
  assert.deepEqual(rows.map((row) => row.order), rows.map((_, index) => index + 1));
  assert.ok(rows.every((row) => row.legal === "kept" && row.contacts === "kept"));
  assert.match(source, /nine HTML files/i);
  assert.match(source, /zero JS\/MJS/i);
  assert.match(source, /DNS[^\n]*separate explicit approval/i);
  commandCards(source, "rollback");
});

test("all runbooks keep secrets, live IDs, and personal request content out of evidence", async () => {
  const sources = await Promise.all(runbookNames.map(runbook));
  const combined = sources.join("\n");

  assert.match(combined, /do not invent live resource IDs/i);
  assert.match(combined, /named release-time evidence placeholders/i);
  assert.doesNotMatch(combined, /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/);
  assert.doesNotMatch(combined, /postgres(?:ql)?:\/\/[^\s`]+:[^\s`]+@/i);
});

test("external DNS handoff acquires evidence before sheet approval and structures every operation", async () => {
  const dns = await source("docs/runbooks/external-dns.md");
  const sequence = [
    "obtain read-only evidence",
    "prepare the exact local sheet",
    "request separate approval for that exact sheet",
    "apply only after approval",
  ];
  let previous = -1;
  for (const phrase of sequence) {
    const position = dns.toLowerCase().indexOf(phrase.toLowerCase());
    assert.ok(position > previous, `external DNS sequence is missing or reorders: ${phrase}`);
    previous = position;
  }
  const operators = operatorCards(dns, "external-dns");
  assert.ok(operators.some(({ title, classification }) => /acquire.*DNS.*evidence/i.test(title) && classification === "READ-ONLY"));
  assert.ok(operators.some(({ title, classification }) => /apply.*DNS/i.test(title) && classification === "MUTATING"));
  commandCards(dns, "external-dns");
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const runbookNames = ["publication", "form-activation", "data-retention", "rollback"];

async function runbook(name) {
  return readFile(new URL(`docs/runbooks/${name}.md`, root), "utf8");
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

test("publication gates inventory before mutation and deploy disabled before separately approved DNS", async () => {
  const source = await runbook("publication");

  assertOrdered(source, [
    "runtime-inventory",
    "dns-inventory",
    "publication-approval",
    "immutable-publication",
    "disabled-deploy",
    "private-smoke",
    "dns-approval",
    "dns-mutation",
    "public-smoke",
  ]);
  assert.match(source, /release-time evidence placeholder/i);
  assert.match(source, /fail(?:s|ed)? closed/i);
  assert.match(source, /DNS approval ID/i);
  assert.match(source, /form activation requires a separate approval/i);
  commandCards(source, "publication");
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

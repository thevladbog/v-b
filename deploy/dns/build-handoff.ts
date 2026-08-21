import { isIP } from "node:net";
import {
  VBTECH_DOMAIN,
  VBTECH_WWW_DOMAIN,
  type DnsHandoff,
  type DnsHandoffAction,
  type DnsHandoffInput,
  type DnsHandoffRecord,
  type DnsMergeRule,
  type DnsRecord,
  type DnsRecordType,
  type PostboxHandoffInput,
  type PostboxRecord,
} from "./record-schema.js";

export type {
  DnsHandoff,
  DnsHandoffInput,
  DnsHandoffRecord,
  DnsMergeRule,
  DnsRecord,
  DnsRecordType,
} from "./record-schema.js";

const MIGRATION_TTL = 300;
const DNS_RECORD_TYPES = new Set<DnsRecordType>(["A", "AAAA", "CNAME", "MX", "TXT"]);

function fail(code: string): never {
  throw new Error(`dns_handoff_${code}`);
}

function exactRecordId(record: Pick<DnsRecord, "name" | "type" | "value">): string {
  return `${record.name}\u0000${record.type}\u0000${record.value}`;
}

function rrsetId(record: Pick<DnsRecord, "name" | "type">): string {
  return `${record.name}\u0000${record.type}`;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isSpf(record: DnsRecord): boolean {
  return record.type === "TXT" && record.value.trim().toLowerCase().startsWith("v=spf1");
}

function isDmarc(record: DnsRecord): boolean {
  return record.type === "TXT" && record.value.trim().toLowerCase().startsWith("v=dmarc1");
}

function validateRecord(record: DnsRecord): void {
  if (!record.name || !record.value || !DNS_RECORD_TYPES.has(record.type) || !Number.isInteger(record.ttl) || record.ttl <= 0) fail("invalid_record");
}

function validateEvidence(id: string, capturedAt: string): void {
  if (!id || Number.isNaN(Date.parse(capturedAt))) fail("invalid_evidence");
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value);
}

function valuesOf(records: readonly DnsRecord[]): string {
  return records.map((record) => record.value).sort(compareText).join(" | ");
}

function sameValues(actual: readonly DnsRecord[], expected: readonly string[]): boolean {
  return valuesOf(actual) === [...expected].sort(compareText).join(" | ");
}

function providerPurpose(record: PostboxRecord): string {
  switch (record.purpose) {
    case "domain-verification": return "Postbox domain verification";
    case "dkim": return "Postbox DKIM";
    case "custom-mail-from": return "Postbox custom MAIL FROM";
    case "spf": return "Postbox SPF authorization";
  }
}

function validatePostbox(postbox: PostboxHandoffInput): void {
  validateEvidence(postbox.evidence.id, postbox.evidence.capturedAt);
  if (postbox.evidence.status !== "verified") fail("unverified_provider_value");

  const counts = new Map<string, number>();
  const evidence = new Set(postbox.evidence.records.map(exactRecordId));
  for (const record of postbox.records) {
    validateRecord(record);
    counts.set(record.purpose, (counts.get(record.purpose) ?? 0) + 1);
    if (!evidence.has(exactRecordId(record))) fail("unverified_provider_value");
  }

  if (counts.get("domain-verification") !== 1 || !counts.get("dkim") || !counts.get("custom-mail-from") || counts.get("spf") !== 1) {
    fail("incomplete_postbox_evidence");
  }
}

function validateUniqueTargetRrsets(records: readonly DnsRecord[]): void {
  const seen = new Set<string>();
  for (const record of records) {
    const key = rrsetId(record);
    if (seen.has(key)) fail("duplicate_owner_type_conflict");
    seen.add(key);
  }
}

function parseSpf(value: string): { mechanisms: string[]; terminal: string } {
  const parts = value.trim().split(/\s+/);
  const terminal = parts.at(-1)?.toLowerCase();
  if (parts[0]?.toLowerCase() !== "v=spf1" || !terminal || !/^[+?~-]all$/.test(terminal)) fail("invalid_spf_record");
  const mechanisms = parts.slice(1, -1);
  if (mechanisms.some((part) => /^[+?~-]?all$/i.test(part))) fail("invalid_spf_record");
  return { mechanisms, terminal };
}

function mergeSpf(currentValue: string, providerValue: string): string {
  const current = parseSpf(currentValue);
  const provider = parseSpf(providerValue);
  const mechanisms = [...new Set([...current.mechanisms, ...provider.mechanisms])];
  return ["v=spf1", ...mechanisms, current.terminal].join(" ");
}

function findRule(rules: readonly DnsMergeRule[], record: Pick<DnsRecord, "name" | "type">): DnsMergeRule | undefined {
  const matching = rules.filter((rule) => rule.name === record.name && rule.type === record.type);
  if (matching.length > 1) fail("duplicate_merge_rule");
  return matching[0];
}

function recordFor(
  desired: DnsRecord,
  purpose: string,
  verification: string,
  current: readonly DnsRecord[],
  rules: readonly DnsMergeRule[],
): DnsHandoffRecord {
  const rrset = current.filter((record) => rrsetId(record) === rrsetId(desired));
  const currentValue = rrset.length ? valuesOf(rrset) : null;
  const exact = rrset.length === 1 && rrset[0]?.value === desired.value;

  if (!rrset.length || desired.type === "TXT") {
    return { ...desired, purpose, currentValue, action: exact ? "keep" : "add", verification, rollback: exact ? "no DNS change" : "remove the added record" };
  }
  if (exact) return { ...desired, purpose, currentValue, action: "keep", verification, rollback: "no DNS change" };

  const rule = findRule(rules, desired);
  if (!rule || rule.kind !== "replace-record" || !sameValues(rrset, rule.currentValues)) {
    fail("destructive_replacement_requires_merge_rule");
  }
  return { ...desired, purpose, currentValue, action: "replace", verification: `${verification}; explicit merge rule ${rule.id}`, rollback: "restore the current value" };
}

export function buildDnsHandoff(input: DnsHandoffInput): DnsHandoff {
  if (!isCalendarDate(input.asOf)) fail("invalid_date");
  if (!input.currentZone) fail("missing_current_zone");
  if (!input.edge || !input.postbox) fail("missing_required_evidence");
  if (isIP(input.edge.ipv4) !== 4 || (input.edge.ipv6 && isIP(input.edge.ipv6) !== 6)) fail("unresolved_edge_ip");
  validateEvidence(input.edge.evidence.id, input.edge.evidence.capturedAt);
  if (input.edge.evidence.ipv4 !== input.edge.ipv4 || (input.edge.ipv6 && input.edge.evidence.ipv6 !== input.edge.ipv6)) {
    fail("unverified_edge_ip");
  }
  input.currentZone.forEach(validateRecord);
  validatePostbox(input.postbox);

  const rules = input.mergeRules ?? [];
  const edgeRecords: DnsRecord[] = [
    { name: VBTECH_DOMAIN, type: "A", value: input.edge.ipv4, ttl: MIGRATION_TTL },
    { name: VBTECH_WWW_DOMAIN, type: "CNAME", value: `${VBTECH_DOMAIN}.`, ttl: MIGRATION_TTL },
  ];
  if (input.edge.ipv6) edgeRecords.push({ name: VBTECH_DOMAIN, type: "AAAA", value: input.edge.ipv6, ttl: MIGRATION_TTL });

  const providerRecords = input.postbox.records.filter((record) => record.purpose !== "spf");
  validateUniqueTargetRrsets([...edgeRecords, ...providerRecords]);

  const records: DnsHandoffRecord[] = [
    ...edgeRecords.map((record) => recordFor(record, record.type === "A" ? "v-b.tech edge IPv4" : record.type === "AAAA" ? "v-b.tech edge IPv6" : "www canonical alias", `approved edge inventory ${input.edge!.evidence.id}`, input.currentZone!, rules)),
    ...providerRecords.map((record) => recordFor(record, providerPurpose(record), `verified Postbox evidence ${input.postbox!.evidence.id}`, input.currentZone!, rules)),
  ];

  const providerSpf = input.postbox.records.find((record) => record.purpose === "spf")!;
  const currentSpf = input.currentZone.filter(isSpf);
  if (currentSpf.length > 1) fail("multiple_spf_records");
  if (!currentSpf.length) {
    records.push(recordFor(providerSpf, providerPurpose(providerSpf), `verified Postbox evidence ${input.postbox.evidence.id}`, input.currentZone, rules));
  } else {
    const rule = findRule(rules, providerSpf);
    if (!rule || rule.kind !== "append-spf-mechanism" || rule.currentValue !== currentSpf[0]?.value || rule.providerValue !== providerSpf.value) {
      fail("spf_merge_rule_required");
    }
    records.push({
      ...providerSpf,
      value: mergeSpf(rule.currentValue, rule.providerValue),
      purpose: "merged SPF authorization",
      currentValue: currentSpf[0].value,
      action: "merge",
      verification: `verified Postbox evidence ${input.postbox.evidence.id}; explicit merge rule ${rule.id}`,
      rollback: "restore the current value",
    });
  }

  const outputIds = new Set(records.map(exactRecordId));
  for (const record of input.currentZone.filter((record) => record.type === "MX" || (record.type === "TXT" && !isSpf(record) && !isDmarc(record)))) {
    if (outputIds.has(exactRecordId(record))) continue;
    records.push({
      ...record,
      purpose: record.type === "MX" ? "preserved existing MX" : "preserved unrelated TXT",
      currentValue: record.value,
      action: "keep",
      verification: "supplied current-zone export",
      rollback: "no DNS change",
    });
  }

  const dmarc = input.currentZone.filter(isDmarc);
  if (dmarc.length > 1) fail("duplicate_owner_type_conflict");
  if (dmarc[0]) {
    records.push({
      ...dmarc[0],
      purpose: "review existing DMARC",
      currentValue: dmarc[0].value,
      action: "review",
      verification: "supplied current-zone export; no DMARC mutation is proposed",
      rollback: "no DNS change",
    });
  }

  return Object.freeze({
    asOf: input.asOf,
    records: Object.freeze(records.sort((left, right) => compareText(exactRecordId(left), exactRecordId(right)))),
  });
}

function markdownCell(value: string | number | null): string {
  return value === null ? "—" : String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function renderMarkdownHandoff(handoff: DnsHandoff): string {
  const header = "| Name | Type | Value | TTL | Purpose | Current value | Action | Verification | Rollback |";
  const divider = "| --- | --- | --- | ---: | --- | --- | --- | --- | --- |";
  const rows = handoff.records.map((record) => [record.name, record.type, record.value, record.ttl, record.purpose, record.currentValue, record.action, record.verification, record.rollback]
    .map(markdownCell)
    .join(" | "));
  return [`# v-b.tech external DNS handoff — ${handoff.asOf}`, "", header, divider, ...rows.map((row) => `| ${row} |`), ""].join("\n");
}

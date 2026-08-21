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

export type { DnsHandoff, DnsHandoffInput, DnsHandoffRecord, DnsMergeRule, DnsRecord, DnsRecordType } from "./record-schema.js";

const MIGRATION_TTL = 300;
const DNS_RECORD_TYPES = new Set<DnsRecordType>(["A", "AAAA", "CNAME", "MX", "TXT"]);

function fail(code: string): never { throw new Error(`dns_handoff_${code}`); }
function exactRecordId(record: Pick<DnsRecord, "name" | "type" | "value">): string { return `${record.name}\u0000${record.type}\u0000${record.value}`; }
function rrsetId(record: Pick<DnsRecord, "name" | "type">): string { return `${record.name}\u0000${record.type}`; }
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function isSpf(record: DnsRecord): boolean { return record.type === "TXT" && record.value.trim().toLowerCase().startsWith("v=spf1"); }
function isDmarc(record: DnsRecord): boolean { return record.type === "TXT" && record.value.trim().toLowerCase().startsWith("v=dmarc1"); }
function isOwnedByVbtech(name: string): boolean { return name === VBTECH_DOMAIN || name.endsWith(`.${VBTECH_DOMAIN}`); }

function validateRecord(record: DnsRecord): void {
  if (!record.name || !isOwnedByVbtech(record.name) || !record.value || /[\r\n\0]/.test(record.value) || !DNS_RECORD_TYPES.has(record.type) || !Number.isInteger(record.ttl) || record.ttl <= 0) fail("invalid_record");
}
function validateEvidence(id: string, capturedAt: string): void { if (!id || Number.isNaN(Date.parse(capturedAt))) fail("invalid_evidence"); }
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value);
}
function valuesOf(records: readonly DnsRecord[]): string { return records.map((record) => record.value).sort(compareText).join(" | "); }
function ownerValuesOf(records: readonly DnsRecord[]): string { return records.map((record) => `${record.type} ${record.value}`).sort(compareText).join(" | "); }
function sameValues(actual: readonly DnsRecord[], expected: readonly string[]): boolean { return valuesOf(actual) === [...expected].sort(compareText).join(" | "); }
function sameOwnerRecords(actual: readonly DnsRecord[], expected: readonly { type: DnsRecordType; value: string }[]): boolean { return ownerValuesOf(actual) === expected.map((record) => `${record.type} ${record.value}`).sort(compareText).join(" | "); }
function shellQuote(value: string): string { return `'${value.replaceAll("'", "'\"'\"'")}'`; }
function verificationCommand(record: DnsRecord): string { return `dig +noall +answer ${shellQuote(record.name)} ${shellQuote(record.type)}`; }

function providerPurpose(record: PostboxRecord): string {
  switch (record.purpose) {
    case "domain-verification": return "Postbox domain verification";
    case "dkim": return "Postbox DKIM";
    case "custom-mail-from": return "Postbox custom MAIL FROM";
    case "spf": return "Postbox SPF authorization";
  }
}
function requiresAbsoluteTarget(value: string): boolean { return /^[A-Za-z0-9_.-]+\.$/.test(value); }
function isMxValue(value: string): boolean { return /^\d+\s+[A-Za-z0-9_.-]+\.$/.test(value); }
function parseSpf(value: string, failureCode = "invalid_spf_record"): { mechanisms: string[]; terminal: string } {
  const parts = value.trim().split(/\s+/);
  const terminal = parts.at(-1)?.toLowerCase();
  if (parts[0]?.toLowerCase() !== "v=spf1" || !terminal || !/^[+?~-]all$/.test(terminal)) fail(failureCode);
  const mechanisms = parts.slice(1, -1);
  if (mechanisms.some((part) => /^[+?~-]?all$/i.test(part))) fail(failureCode);
  return { mechanisms, terminal };
}
function validatePostboxRecord(record: PostboxRecord): void {
  validateRecord(record);
  switch (record.purpose) {
    case "domain-verification":
      if ((record.type !== "TXT" && record.type !== "CNAME") || record.type === "CNAME" && !requiresAbsoluteTarget(record.value)) fail("invalid_postbox_record");
      return;
    case "dkim":
      if (!record.name.includes("._domainkey.") || record.type !== "CNAME" && record.type !== "TXT" || record.type === "CNAME" && !requiresAbsoluteTarget(record.value) || record.type === "TXT" && !/^v=DKIM1(?:;|\s|$)/i.test(record.value)) fail("invalid_postbox_record");
      return;
    case "custom-mail-from":
      if (record.type !== "MX" || record.name === VBTECH_DOMAIN || !isMxValue(record.value)) fail("invalid_postbox_record");
      return;
    case "spf":
      if (record.type !== "TXT") fail("invalid_postbox_record");
      parseSpf(record.value, "invalid_postbox_record");
      return;
  }
}
function validatePostbox(postbox: PostboxHandoffInput): void {
  validateEvidence(postbox.evidence.id, postbox.evidence.capturedAt);
  if (postbox.evidence.status !== "verified") fail("unverified_provider_value");
  const counts = new Map<string, number>();
  const evidence = new Set(postbox.evidence.records.map(exactRecordId));
  for (const record of postbox.records) {
    validatePostboxRecord(record);
    counts.set(record.purpose, (counts.get(record.purpose) ?? 0) + 1);
    if (!evidence.has(exactRecordId(record))) fail("unverified_provider_value");
  }
  if (counts.get("domain-verification") !== 1 || !counts.get("dkim") || !counts.get("custom-mail-from") || counts.get("spf") !== 1) fail("incomplete_postbox_evidence");
}
function validateUniqueTargetRrsets(records: readonly DnsRecord[]): void {
  const seen = new Set<string>();
  for (const record of records) {
    const key = rrsetId(record);
    if (seen.has(key)) fail("duplicate_owner_type_conflict");
    seen.add(key);
  }
}
function mergeSpf(currentValue: string, providerValue: string): string {
  const current = parseSpf(currentValue);
  const provider = parseSpf(providerValue);
  return ["v=spf1", ...new Set([...current.mechanisms, ...provider.mechanisms]), current.terminal].join(" ");
}
function findRule(rules: readonly DnsMergeRule[], record: Pick<DnsRecord, "name" | "type">): DnsMergeRule | undefined {
  const matching = rules.filter((rule) => rule.name === record.name && rule.type === record.type);
  if (matching.length > 1) fail("duplicate_merge_rule");
  return matching[0];
}

interface RecordPlan { readonly record: DnsHandoffRecord; readonly replacedCurrent: readonly DnsRecord[]; }
function row(desired: DnsRecord, purpose: string, currentValue: string | null, action: DnsHandoffAction, verification: string, rollback: string, mergeRule: string | null = null, rollbackValue: string | null = currentValue): DnsHandoffRecord {
  return { ...desired, purpose, currentValue, action, mergeRule, verification, verificationCommand: verificationCommand(desired), rollback, rollbackValue };
}
function recordFor(desired: DnsRecord, purpose: string, verification: string, current: readonly DnsRecord[], rules: readonly DnsMergeRule[]): RecordPlan {
  const owner = current.filter((record) => record.name === desired.name);
  const rrset = owner.filter((record) => record.type === desired.type);
  const currentValue = rrset.length ? valuesOf(rrset) : null;
  const exact = rrset.length === 1 && rrset[0]?.value === desired.value;
  const cnameConflict = owner.some((record) => record.type === "CNAME") || desired.type === "CNAME" && owner.some((record) => record.type !== "CNAME");
  if (cnameConflict && !(exact && owner.length === 1 && owner[0]?.type === "CNAME")) {
    const rule = findRule(rules, desired);
    if (!rule || rule.kind !== "replace-cname-owner-records" || !sameOwnerRecords(owner, rule.currentRecords)) fail("cname_owner_replacement_required");
    const ownerValue = ownerValuesOf(owner);
    return { record: row(desired, purpose, ownerValue, "replace", `${verification}; explicit replacement rule ${rule.id}`, "restore the rollback value", rule.id, ownerValue), replacedCurrent: owner };
  }
  if (!rrset.length || desired.type === "TXT") return { record: row(desired, purpose, currentValue, exact ? "keep" : "add", verification, exact ? "no DNS change" : "remove the added record", null, exact ? currentValue : null), replacedCurrent: [] };
  if (exact) return { record: row(desired, purpose, currentValue, "keep", verification, "no DNS change"), replacedCurrent: [] };
  const rule = findRule(rules, desired);
  if (!rule || rule.kind !== "replace-record" || !sameValues(rrset, rule.currentValues)) fail("destructive_replacement_requires_merge_rule");
  return { record: row(desired, purpose, currentValue, "replace", `${verification}; explicit replacement rule ${rule.id}`, "restore the rollback value", rule.id), replacedCurrent: rrset };
}
function preservedCurrentRecord(record: DnsRecord): DnsHandoffRecord {
  const reviewedDmarc = isDmarc(record);
  const purpose = reviewedDmarc ? "review existing DMARC" : record.type === "MX" ? "preserved existing MX" : record.type === "TXT" ? "preserved unrelated TXT" : `preserved existing ${record.type}`;
  return row(record, purpose, record.value, reviewedDmarc ? "review" : "keep", reviewedDmarc ? "supplied current-zone export; no DMARC mutation is proposed" : "supplied current-zone export", "no DNS change", null, record.value);
}

export function buildDnsHandoff(input: DnsHandoffInput): DnsHandoff {
  if (!isCalendarDate(input.asOf)) fail("invalid_date");
  if (!input.currentZone) fail("missing_current_zone");
  if (!input.edge || !input.postbox) fail("missing_required_evidence");
  if (isIP(input.edge.ipv4) !== 4 || input.edge.ipv6 && isIP(input.edge.ipv6) !== 6) fail("unresolved_edge_ip");
  validateEvidence(input.edge.evidence.id, input.edge.evidence.capturedAt);
  if (input.edge.evidence.ipv4 !== input.edge.ipv4 || input.edge.ipv6 && input.edge.evidence.ipv6 !== input.edge.ipv6) fail("unverified_edge_ip");
  input.currentZone.forEach(validateRecord);
  validatePostbox(input.postbox);
  const rules = input.mergeRules ?? [];
  const edgeRecords: DnsRecord[] = [{ name: VBTECH_DOMAIN, type: "A", value: input.edge.ipv4, ttl: MIGRATION_TTL }, { name: VBTECH_WWW_DOMAIN, type: "CNAME", value: `${VBTECH_DOMAIN}.`, ttl: MIGRATION_TTL }];
  if (input.edge.ipv6) edgeRecords.push({ name: VBTECH_DOMAIN, type: "AAAA", value: input.edge.ipv6, ttl: MIGRATION_TTL });
  const providerRecords = input.postbox.records.filter((record) => record.purpose !== "spf");
  validateUniqueTargetRrsets([...edgeRecords, ...providerRecords]);
  const plans = [...edgeRecords.map((record) => recordFor(record, record.type === "A" ? "v-b.tech edge IPv4" : record.type === "AAAA" ? "v-b.tech edge IPv6" : "www canonical alias", `approved edge inventory ${input.edge!.evidence.id}`, input.currentZone!, rules)), ...providerRecords.map((record) => recordFor(record, providerPurpose(record), `verified Postbox evidence ${input.postbox!.evidence.id}`, input.currentZone!, rules))];
  const records = plans.map((plan) => plan.record);
  const handledCurrent = new Set(plans.flatMap((plan) => plan.replacedCurrent.map(exactRecordId)));
  const providerSpf = input.postbox.records.find((record) => record.purpose === "spf")!;
  const currentSpf = input.currentZone.filter((record) => record.name === providerSpf.name && isSpf(record));
  if (currentSpf.length > 1) fail("multiple_spf_records");
  if (!currentSpf.length) {
    const plan = recordFor(providerSpf, providerPurpose(providerSpf), `verified Postbox evidence ${input.postbox.evidence.id}`, input.currentZone, rules);
    records.push(plan.record);
    plan.replacedCurrent.forEach((record) => handledCurrent.add(exactRecordId(record)));
  } else {
    const rule = findRule(rules, providerSpf);
    if (!rule || rule.kind !== "append-spf-mechanism" || rule.currentValue !== currentSpf[0]?.value || rule.providerValue !== providerSpf.value) fail("spf_merge_rule_required");
    records.push(row({ ...providerSpf, value: mergeSpf(rule.currentValue, rule.providerValue) }, "merged SPF authorization", currentSpf[0].value, "merge", `verified Postbox evidence ${input.postbox.evidence.id}; explicit merge rule ${rule.id}`, "restore the rollback value", rule.id, currentSpf[0].value));
    handledCurrent.add(exactRecordId(currentSpf[0]));
  }
  const outputIds = new Set(records.map(exactRecordId));
  for (const record of input.currentZone) {
    const key = exactRecordId(record);
    if (handledCurrent.has(key) || outputIds.has(key)) continue;
    records.push(preservedCurrentRecord(record));
    outputIds.add(key);
  }
  return Object.freeze({ asOf: input.asOf, records: Object.freeze(records.sort((left, right) => compareText(exactRecordId(left), exactRecordId(right)))) });
}
function markdownCell(value: string | number | null): string { return value === null ? "—" : String(value).replaceAll("|", "\\|").replaceAll("\n", " "); }
export function renderMarkdownHandoff(handoff: DnsHandoff): string {
  const header = "| Name | Type | Value | TTL | Purpose | Current value | Action | Replacement or merge rule | Verification | Verification command | Rollback | Rollback value |";
  const divider = "| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |";
  const rows = handoff.records.map((record) => [record.name, record.type, record.value, record.ttl, record.purpose, record.currentValue, record.action, record.mergeRule, record.verification, record.verificationCommand, record.rollback, record.rollbackValue].map(markdownCell).join(" | "));
  return [`# v-b.tech external DNS handoff — ${handoff.asOf}`, "", header, divider, ...rows.map((value) => `| ${value} |`), ""].join("\n");
}

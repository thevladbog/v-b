import { readFile, writeFile } from "node:fs/promises";
import { buildDnsHandoff, renderMarkdownHandoff } from "./build-handoff.js";
import type {
  DnsHandoffInput,
  DnsMergeRule,
  DnsRecord,
  DnsRecordType,
  PostboxRecord,
} from "./record-schema.js";

const recordTypes = new Set<DnsRecordType>(["A", "AAAA", "CNAME", "MX", "TXT"]);
const purposes = new Set<PostboxRecord["purpose"]>(["domain-verification", "dkim", "custom-mail-from", "spf"]);

function fail(code: string): never { throw new Error(`dns_handoff_${code}`); }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_input"); return value as Record<string, unknown>; }
function string(value: unknown): string { if (typeof value !== "string") fail("invalid_input"); return value; }
function integer(value: unknown): number { if (!Number.isInteger(value)) fail("invalid_input"); return value as number; }
function array(value: unknown): unknown[] { if (!Array.isArray(value)) fail("invalid_input"); return value; }
function optionalString(value: unknown): string | undefined { if (value === undefined) return undefined; return string(value); }
function optionalNonEmptyString(value: unknown): string | undefined { const parsed = optionalString(value); if (parsed === "") fail("invalid_input"); return parsed; }
function record(value: unknown): DnsRecord {
  const source = object(value);
  const type = string(source.type) as DnsRecordType;
  if (!recordTypes.has(type)) fail("invalid_input");
  return { name: string(source.name), type, value: string(source.value), ttl: integer(source.ttl) };
}
function postboxRecord(value: unknown): PostboxRecord {
  const source = object(value);
  const purpose = string(source.purpose) as PostboxRecord["purpose"];
  if (!purposes.has(purpose)) fail("invalid_input");
  return { ...record(source), purpose };
}
function mergeRule(value: unknown): DnsMergeRule {
  const source = object(value);
  const id = string(source.id);
  const name = string(source.name);
  const kind = string(source.kind);
  const type = string(source.type) as DnsRecordType;
  if (!recordTypes.has(type)) fail("invalid_input");
  const currentOwnerRecords = (sourceValue: unknown) => array(sourceValue).map((item) => {
    const current = object(item);
    const currentType = string(current.type) as DnsRecordType;
    if (!recordTypes.has(currentType)) fail("invalid_input");
    return { type: currentType, value: string(current.value), ttl: integer(current.ttl) };
  });
  if (kind === "replace-record") return {
    id,
    kind,
    name,
    type,
    currentValues: array(source.currentValues).map(string),
    ...(source.currentRecords === undefined ? {} : { currentRecords: currentOwnerRecords(source.currentRecords) }),
  };
  if (kind === "replace-cname-owner-records") return { id, kind, name, type, currentRecords: currentOwnerRecords(source.currentRecords) };
  if (kind === "append-spf-mechanism" && type === "TXT") return { id, kind, name, type, currentValue: string(source.currentValue), providerValue: string(source.providerValue) };
  fail("invalid_input");
}

export function parseDnsHandoffInput(value: unknown): DnsHandoffInput {
  const source = object(value);
  const edge = object(source.edge);
  const edgeEvidence = object(edge.evidence);
  const postbox = object(source.postbox);
  const postboxEvidence = object(postbox.evidence);
  const status = string(postboxEvidence.status);
  if (status !== "verified" && status !== "pending" && status !== "failed") fail("invalid_input");
  return {
    asOf: string(source.asOf),
    currentZone: array(source.currentZone).map(record),
    edge: {
      ipv4: string(edge.ipv4),
      ipv6: optionalNonEmptyString(edge.ipv6),
      evidence: { id: string(edgeEvidence.id), capturedAt: string(edgeEvidence.capturedAt), ipv4: string(edgeEvidence.ipv4), ipv6: optionalNonEmptyString(edgeEvidence.ipv6), migrationTtl: integer(edgeEvidence.migrationTtl), normalTtl: integer(edgeEvidence.normalTtl) },
    },
    postbox: {
      customMailFrom: string(postbox.customMailFrom) as "configured" | "not-configured",
      records: array(postbox.records).map(postboxRecord),
      evidence: { id: string(postboxEvidence.id), capturedAt: string(postboxEvidence.capturedAt), status, customMailFrom: string(postboxEvidence.customMailFrom) as "configured" | "not-configured", records: array(postboxEvidence.records).map(postboxRecord) },
    },
    mergeRules: source.mergeRules === undefined ? [] : array(source.mergeRules).map(mergeRule),
  };
}

export async function runDnsHandoffCli(argumentsList: readonly string[]): Promise<void> {
  if (argumentsList.length !== 2) fail("invalid_cli_arguments");
  const [inputPath, outputPath] = argumentsList;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(inputPath!, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) fail("invalid_json");
    throw error;
  }
  const markdown = renderMarkdownHandoff(buildDnsHandoff(parseDnsHandoffInput(parsed)));
  await writeFile(outputPath!, markdown, { encoding: "utf8", flag: "wx" });
}

if (typeof require !== "undefined" && require.main === module) {
  runDnsHandoffCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "dns_handoff_cli_failed"}\n`);
    process.exitCode = 1;
  });
}

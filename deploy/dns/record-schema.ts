export const VBTECH_DOMAIN = "v-b.tech";
export const VBTECH_WWW_DOMAIN = "www.v-b.tech";

export type DnsRecordType = "A" | "AAAA" | "CNAME" | "MX" | "TXT";

export interface DnsRecord {
  readonly name: string;
  readonly type: DnsRecordType;
  readonly value: string;
  readonly ttl: number;
}

export type PostboxRecordPurpose = "dkim" | "custom-mail-from" | "spf";

export interface PostboxRecord extends DnsRecord {
  readonly purpose: PostboxRecordPurpose;
}

export interface EvidenceReference {
  readonly id: string;
  readonly capturedAt: string;
}

export interface EdgeInventoryEvidence extends EvidenceReference {
  readonly ipv4: string;
  /** Omit when IPv6 is not selected; the empty string is invalid. */
  readonly ipv6?: string;
  readonly migrationTtl: number;
  readonly normalTtl: number;
}

export interface EdgeInventory {
  readonly ipv4: string;
  /** Omit when IPv6 is not selected; the empty string is invalid. */
  readonly ipv6?: string;
  readonly evidence: EdgeInventoryEvidence;
}

export interface PostboxVerificationEvidence extends EvidenceReference {
  readonly status: "verified" | "pending" | "failed";
  readonly customMailFrom: "configured" | "not-configured";
  readonly records: readonly PostboxRecord[];
}

export interface PostboxHandoffInput {
  readonly customMailFrom: "configured" | "not-configured";
  readonly evidence: PostboxVerificationEvidence;
  readonly records: readonly PostboxRecord[];
}

export interface ReplaceRecordMergeRule {
  readonly id: string;
  readonly kind: "replace-record";
  readonly name: string;
  readonly type: DnsRecordType;
  readonly currentValues: readonly string[];
  readonly currentRecords?: readonly CurrentOwnerRecord[];
}

export interface CurrentOwnerRecord {
  readonly type: DnsRecordType;
  readonly value: string;
  readonly ttl: number;
}

export interface ReplaceCnameOwnerRecordsRule {
  readonly id: string;
  readonly kind: "replace-cname-owner-records";
  readonly name: string;
  readonly type: DnsRecordType;
  readonly currentRecords: readonly CurrentOwnerRecord[];
}

export interface AppendSpfMechanismMergeRule {
  readonly id: string;
  readonly kind: "append-spf-mechanism";
  readonly name: string;
  readonly type: "TXT";
  readonly currentValue: string;
  readonly providerValue: string;
}

export type DnsMergeRule = ReplaceRecordMergeRule | ReplaceCnameOwnerRecordsRule | AppendSpfMechanismMergeRule;

export interface DnsHandoffInput {
  readonly asOf: string;
  readonly currentZone?: readonly DnsRecord[];
  readonly edge?: EdgeInventory;
  readonly postbox?: PostboxHandoffInput;
  readonly mergeRules?: readonly DnsMergeRule[];
}

export type DnsHandoffAction = "add" | "keep" | "merge" | "replace" | "review" | "update";

export interface DnsHandoffRecord extends DnsRecord {
  readonly purpose: string;
  readonly currentValue: string | null;
  readonly currentTtl: number | null;
  readonly normalTtl: number | null;
  readonly action: DnsHandoffAction;
  readonly mergeRule: string | null;
  readonly verification: string;
  readonly verificationCommand: string;
  readonly rollback: string;
  readonly rollbackValue: string | null;
  readonly rollbackTtl: number | null;
  /** Exact supplied owner data when a row keeps, merges, or replaces an RRset. */
  readonly currentRecords: readonly CurrentOwnerRecord[];
  /** Exact local rollback data, including every value and TTL. */
  readonly rollbackRecords: readonly CurrentOwnerRecord[];
}

export interface DnsHandoff {
  readonly asOf: string;
  readonly records: readonly DnsHandoffRecord[];
}

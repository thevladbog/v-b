export const VBTECH_DOMAIN = "v-b.tech";
export const VBTECH_WWW_DOMAIN = "www.v-b.tech";

export type DnsRecordType = "A" | "AAAA" | "CNAME" | "MX" | "TXT";

export interface DnsRecord {
  readonly name: string;
  readonly type: DnsRecordType;
  readonly value: string;
  readonly ttl: number;
}

export type PostboxRecordPurpose = "domain-verification" | "dkim" | "custom-mail-from" | "spf";

export interface PostboxRecord extends DnsRecord {
  readonly purpose: PostboxRecordPurpose;
}

export interface EvidenceReference {
  readonly id: string;
  readonly capturedAt: string;
}

export interface EdgeInventoryEvidence extends EvidenceReference {
  readonly ipv4: string;
  readonly ipv6?: string;
}

export interface EdgeInventory {
  readonly ipv4: string;
  readonly ipv6?: string;
  readonly evidence: EdgeInventoryEvidence;
}

export interface PostboxVerificationEvidence extends EvidenceReference {
  readonly status: "verified" | "pending" | "failed";
  readonly records: readonly DnsRecord[];
}

export interface PostboxHandoffInput {
  readonly evidence: PostboxVerificationEvidence;
  readonly records: readonly PostboxRecord[];
}

export interface ReplaceRecordMergeRule {
  readonly id: string;
  readonly kind: "replace-record";
  readonly name: string;
  readonly type: DnsRecordType;
  readonly currentValues: readonly string[];
}

export interface AppendSpfMechanismMergeRule {
  readonly id: string;
  readonly kind: "append-spf-mechanism";
  readonly name: string;
  readonly type: "TXT";
  readonly currentValue: string;
  readonly providerValue: string;
}

export type DnsMergeRule = ReplaceRecordMergeRule | AppendSpfMechanismMergeRule;

export interface DnsHandoffInput {
  readonly asOf: string;
  readonly currentZone?: readonly DnsRecord[];
  readonly edge?: EdgeInventory;
  readonly postbox?: PostboxHandoffInput;
  readonly mergeRules?: readonly DnsMergeRule[];
}

export type DnsHandoffAction = "add" | "keep" | "merge" | "replace" | "review";

export interface DnsHandoffRecord extends DnsRecord {
  readonly purpose: string;
  readonly currentValue: string | null;
  readonly action: DnsHandoffAction;
  readonly verification: string;
  readonly rollback: string;
}

export interface DnsHandoff {
  readonly asOf: string;
  readonly records: readonly DnsHandoffRecord[];
}

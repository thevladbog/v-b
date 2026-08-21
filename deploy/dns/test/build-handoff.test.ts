import { describe, expect, it } from "vitest";
import { buildDnsHandoff, renderMarkdownHandoff, type DnsHandoffInput } from "../build-handoff.js";

const currentZone = [
  { name: "v-b.tech", type: "MX", value: "10 inbound.example.test.", ttl: 3_600 },
  { name: "v-b.tech", type: "TXT", value: "google-site-verification=unrelated", ttl: 3_600 },
  { name: "v-b.tech", type: "TXT", value: "v=spf1 mx ~all", ttl: 3_600 },
  { name: "_dmarc.v-b.tech", type: "TXT", value: "v=DMARC1; p=none", ttl: 3_600 },
] as const;

const postboxRecords = [
  {
    name: "postbox-verify.v-b.tech",
    type: "TXT",
    value: "verification-token-from-supplied-evidence",
    ttl: 300,
    purpose: "domain-verification",
  },
  {
    name: "postbox._domainkey.v-b.tech",
    type: "CNAME",
    value: "dkim-target.from-supplied-evidence.test.",
    ttl: 300,
    purpose: "dkim",
  },
  {
    name: "bounce.v-b.tech",
    type: "MX",
    value: "10 mail-from.from-supplied-evidence.test.",
    ttl: 300,
    purpose: "custom-mail-from",
  },
  {
    name: "v-b.tech",
    type: "TXT",
    value: "v=spf1 include:postbox.from-supplied-evidence.test -all",
    ttl: 300,
    purpose: "spf",
  },
] as const;

const handoffInput = (overrides: Partial<DnsHandoffInput> = {}): DnsHandoffInput => ({
  asOf: "2026-08-21",
  currentZone,
  edge: {
    ipv4: "198.51.100.24",
    ipv6: "2001:db8::24",
    evidence: {
      id: "edge-inventory-2026-08-21",
      capturedAt: "2026-08-21T12:00:00.000Z",
      ipv4: "198.51.100.24",
      ipv6: "2001:db8::24",
    },
  },
  postbox: {
    evidence: {
      id: "postbox-verification-2026-08-21",
      capturedAt: "2026-08-21T12:01:00.000Z",
      status: "verified",
      records: postboxRecords,
    },
    records: postboxRecords,
  },
  mergeRules: [
    {
      id: "merge-existing-spf-with-postbox",
      kind: "append-spf-mechanism",
      name: "v-b.tech",
      type: "TXT",
      currentValue: "v=spf1 mx ~all",
      providerValue: "v=spf1 include:postbox.from-supplied-evidence.test -all",
    },
  ],
  ...overrides,
});

describe("external DNS handoff builder", () => {
  // Catches a release handoff that publishes the site without the supplied edge inventory,
  // www alias, or an explicit record table/rollback path.
  it("creates the approved apex, optional IPv6, and www records from evidence", () => {
    const handoff = buildDnsHandoff(handoffInput());

    expect(handoff.asOf).toBe("2026-08-21");
    expect(handoff.records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "v-b.tech",
        type: "A",
        value: "198.51.100.24",
        ttl: 300,
        action: "add",
        purpose: "v-b.tech edge IPv4",
        verification: "approved edge inventory edge-inventory-2026-08-21",
        rollback: "remove the added record",
      }),
      expect.objectContaining({ name: "v-b.tech", type: "AAAA", value: "2001:db8::24", action: "add" }),
      expect.objectContaining({ name: "www.v-b.tech", type: "CNAME", value: "v-b.tech.", action: "add" }),
    ]));
    expect(renderMarkdownHandoff(handoff)).toContain("| Name | Type | Value | TTL | Purpose | Current value | Action | Verification | Rollback |");
  });

  // Catches a provider handoff that drops a verified Postbox requirement or emits it without
  // the exact evidence identity that backs its value.
  it("includes verified Postbox domain, DKIM, MAIL FROM, and one merged SPF record", () => {
    const handoff = buildDnsHandoff(handoffInput());

    expect(handoff.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "postbox-verify.v-b.tech", purpose: "Postbox domain verification", action: "add" }),
      expect.objectContaining({ name: "postbox._domainkey.v-b.tech", purpose: "Postbox DKIM", action: "add" }),
      expect.objectContaining({ name: "bounce.v-b.tech", type: "MX", purpose: "Postbox custom MAIL FROM", action: "add" }),
      expect.objectContaining({
        name: "v-b.tech",
        type: "TXT",
        value: "v=spf1 mx include:postbox.from-supplied-evidence.test ~all",
        action: "merge",
        purpose: "merged SPF authorization",
        currentValue: "v=spf1 mx ~all",
      }),
    ]));
    expect(handoff.records.filter((record) => record.type === "TXT" && record.value.toLowerCase().startsWith("v=spf1"))).toHaveLength(1);
  });

  // Catches a generator that silently removes mail routing, unrelated provider text, or the
  // existing DMARC policy while assembling a new authentication handoff.
  it("preserves MX and unrelated TXT records and marks the current DMARC policy for review", () => {
    const handoff = buildDnsHandoff(handoffInput());

    expect(handoff.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "v-b.tech", type: "MX", value: "10 inbound.example.test.", action: "keep", purpose: "preserved existing MX" }),
      expect.objectContaining({ name: "v-b.tech", type: "TXT", value: "google-site-verification=unrelated", action: "keep", purpose: "preserved unrelated TXT" }),
      expect.objectContaining({ name: "_dmarc.v-b.tech", type: "TXT", value: "v=DMARC1; p=none", action: "review", purpose: "review existing DMARC" }),
    ]));
  });

  // Catches a generator that turns incomplete inventory into an implicit live lookup or uses an
  // unresolved edge address in a release-time record sheet.
  it.each([
    ["invalid sheet date", handoffInput({ asOf: "2026-99-99" })],
    ["missing current zone", handoffInput({ currentZone: undefined })],
    ["unresolved edge IPv4", handoffInput({ edge: { evidence: { id: "edge", capturedAt: "2026-08-21T12:00:00.000Z", ipv4: "not-an-ip" }, ipv4: "not-an-ip" } })],
  ])("fails closed for %s", (_label, input) => {
    expect(() => buildDnsHandoff(input)).toThrow(/dns_handoff_/);
  });

  // Catches an arbitrary routable address being attributed to an approved inventory ID without
  // appearing in the inventory evidence itself.
  it("rejects an edge IP that is not backed by its supplied inventory evidence", () => {
    const input = handoffInput({
      edge: {
        ipv4: "198.51.100.24",
        evidence: {
          id: "edge-inventory-2026-08-21",
          capturedAt: "2026-08-21T12:00:00.000Z",
          ipv4: "198.51.100.25",
        },
      },
    });

    expect(() => buildDnsHandoff(input)).toThrow("dns_handoff_unverified_edge_ip");
  });

  // Catches accepting record values that were not included in the operator-supplied provider
  // verification output, including a provider output that is merely pending.
  it("rejects unverified Postbox values", () => {
    const input = handoffInput({
      postbox: {
        records: postboxRecords,
        evidence: {
          id: "postbox-verification-pending",
          capturedAt: "2026-08-21T12:01:00.000Z",
          status: "pending",
          records: postboxRecords,
        },
      },
    });

    expect(() => buildDnsHandoff(input)).toThrow("dns_handoff_unverified_provider_value");
  });

  // Catches one unstable RRset being output twice, a destructive replacement without an explicit
  // reviewed rule, or two SPF TXT records that receivers may select unpredictably.
  it.each([
    ["duplicate target owner/type", handoffInput({ postbox: { evidence: { id: "postbox", capturedAt: "2026-08-21T12:01:00.000Z", status: "verified", records: [...postboxRecords, { ...postboxRecords[0], value: "second-value" }] }, records: [...postboxRecords, { ...postboxRecords[0], value: "second-value" }] } })],
    ["destructive apex replacement", handoffInput({ currentZone: [...currentZone, { name: "v-b.tech", type: "A", value: "198.51.100.1", ttl: 3_600 }] })],
    ["two current SPF records", handoffInput({ currentZone: [...currentZone, { name: "v-b.tech", type: "TXT", value: "v=spf1 include:second.example.test -all", ttl: 3_600 }] })],
  ])("rejects %s", (_label, input) => {
    expect(() => buildDnsHandoff(input)).toThrow(/dns_handoff_/);
  });
});

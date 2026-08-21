import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDnsHandoff, renderMarkdownHandoff, type DnsHandoffInput, type DnsMergeRule } from "../build-handoff.js";

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
        mergeRule: null,
        verificationCommand: "dig +noall +answer 'v-b.tech' 'A'",
        rollbackValue: null,
      }),
      expect.objectContaining({ name: "v-b.tech", type: "AAAA", value: "2001:db8::24", action: "add" }),
      expect.objectContaining({ name: "www.v-b.tech", type: "CNAME", value: "v-b.tech.", action: "add" }),
    ]));
    expect(renderMarkdownHandoff(handoff)).toContain("| Name | Type | Value | TTL | Purpose | Current value | Action | Replacement or merge rule | Verification | Verification command | Rollback | Rollback value |");
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
        mergeRule: "merge-existing-spf-with-postbox",
        rollbackValue: "v=spf1 mx ~all",
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

  // Catches a CNAME handoff that would coexist with an existing address record instead of
  // replacing the complete owner data through an explicitly reviewed owner-level rule.
  it("rejects a cross-type CNAME conflict unless the exact current owner data is approved", () => {
    const conflicting = handoffInput({
      currentZone: [...currentZone, { name: "www.v-b.tech", type: "A", value: "198.51.100.88", ttl: 3_600 }],
    });
    expect(() => buildDnsHandoff(conflicting)).toThrow("dns_handoff_cname_owner_replacement_required");

    const reviewed = buildDnsHandoff({
      ...conflicting,
      mergeRules: [
        ...conflicting.mergeRules!,
        {
          id: "replace-old-www-addresses",
          kind: "replace-cname-owner-records",
          name: "www.v-b.tech",
          type: "CNAME",
          currentRecords: [{ type: "A", value: "198.51.100.88" }],
        } satisfies DnsMergeRule,
      ],
    });
    expect(reviewed.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "www.v-b.tech", type: "CNAME", action: "replace", mergeRule: "replace-old-www-addresses", rollbackValue: "A 198.51.100.88" }),
    ]));
    expect(reviewed.records).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "www.v-b.tech", type: "A", value: "198.51.100.88" }),
    ]));
  });

  // Catches zone-wide SPF discovery that merges a custom MAIL FROM policy into an unrelated
  // apex policy instead of applying the single-SPF rule at the provider record's owner.
  it("keeps an apex SPF while adding the distinct custom MAIL FROM owner SPF", () => {
    const bounceSpf = { ...postboxRecords[3], name: "bounce.v-b.tech" };
    const records = [...postboxRecords.slice(0, 3), bounceSpf];
    const handoff = buildDnsHandoff(handoffInput({
      postbox: {
        records,
        evidence: {
          id: "postbox-bounce-spf",
          capturedAt: "2026-08-21T12:01:00.000Z",
          status: "verified",
          records,
        },
      },
      mergeRules: [],
    }));

    expect(handoff.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "v-b.tech", type: "TXT", value: "v=spf1 mx ~all", action: "keep" }),
      expect.objectContaining({ name: "bounce.v-b.tech", type: "TXT", value: bounceSpf.value, action: "add" }),
    ]));
    expect(handoff.records.filter((record) => record.type === "TXT" && record.value.toLowerCase().startsWith("v=spf1"))).toHaveLength(2);
  });

  // Catches allowing two SPF TXT values at the same MAIL FROM owner while an unrelated apex SPF
  // exists in the same zone.
  it("rejects two SPF records at the provider SPF owner only", () => {
    const bounceSpf = { ...postboxRecords[3], name: "bounce.v-b.tech" };
    const records = [...postboxRecords.slice(0, 3), bounceSpf];
    const input = handoffInput({
      currentZone: [...currentZone, { name: "bounce.v-b.tech", type: "TXT", value: "v=spf1 include:old-bounce.example.test -all", ttl: 3_600 }, { name: "bounce.v-b.tech", type: "TXT", value: "v=spf1 include:second-bounce.example.test -all", ttl: 3_600 }],
      postbox: { records, evidence: { id: "postbox-bounce-spf", capturedAt: "2026-08-21T12:01:00.000Z", status: "verified", records } },
      mergeRules: [],
    });
    expect(() => buildDnsHandoff(input)).toThrow("dns_handoff_multiple_spf_records");
  });

  // Catches invisibly dropping existing DKIM/CNAME records because only MX and TXT were copied
  // into the operator table.
  it("keeps unrelated existing CNAME DKIM records visible exactly once", () => {
    const handoff = buildDnsHandoff(handoffInput({
      currentZone: [...currentZone, { name: "legacy._domainkey.v-b.tech", type: "CNAME", value: "legacy-dkim.example.test.", ttl: 3_600 }],
    }));
    expect(handoff.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "legacy._domainkey.v-b.tech", type: "CNAME", value: "legacy-dkim.example.test.", action: "keep", purpose: "preserved existing CNAME" }),
    ]));
    expect(handoff.records.filter((record) => record.name === "legacy._domainkey.v-b.tech" && record.type === "CNAME")).toHaveLength(1);
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

  // Catches purpose labels that allow a provider record to be interpreted as the wrong DNS
  // mechanism, or a malformed SPF record to bypass parsing when no current SPF exists.
  it.each([
    ["verification MX", { ...postboxRecords[0], type: "MX", value: "10 verification.example.test." }],
    ["DKIM TXT without a DKIM declaration", { ...postboxRecords[1], type: "TXT", value: "not-a-dkim-record" }],
    ["MAIL FROM TXT", { ...postboxRecords[2], type: "TXT", value: "not-an-mx-record" }],
    ["malformed provider SPF", { ...postboxRecords[3], value: "include:postbox.example.test" }],
  ] as const)("rejects Postbox purpose/type mismatch: %s", (_label, replacement) => {
    const records = postboxRecords.map((record) => record.purpose === replacement.purpose ? replacement : record);
    const input = handoffInput({
      postbox: { records, evidence: { id: "invalid-postbox-shape", capturedAt: "2026-08-21T12:01:00.000Z", status: "verified", records } },
    });
    expect(() => buildDnsHandoff(input)).toThrow(/dns_handoff_invalid_postbox_record/);
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

  // Catches a release process that cannot turn a supplied JSON evidence bundle into the exact
  // dated review artifact, or accepts malformed input while doing so.
  it("runs the local JSON CLI without network access and rejects malformed input", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vbtech-dns-handoff-"));
    const inputPath = join(directory, "input.json");
    const outputPath = join(directory, "2026-08-21-vbtech-dns-handoff.md");
    try {
      await writeFile(inputPath, JSON.stringify(handoffInput()), "utf8");
      const { runDnsHandoffCli } = await import("../cli.js");
      await expect(runDnsHandoffCli([inputPath, outputPath])).resolves.toBeUndefined();
      await expect(readFile(outputPath, "utf8")).resolves.toContain("# v-b.tech external DNS handoff — 2026-08-21");

      await writeFile(inputPath, "{ malformed", "utf8");
      await expect(runDnsHandoffCli([inputPath, join(directory, "malformed.md")])).rejects.toThrow("dns_handoff_invalid_json");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

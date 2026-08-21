import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { buildDnsHandoff, renderMarkdownHandoff, type DnsHandoffInput, type DnsMergeRule } from "../build-handoff.js";
import { parseDnsHandoffInput } from "../cli.js";

const execFileAsync = promisify(execFile);

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
      migrationTtl: 300,
      normalTtl: 3_600,
    },
  },
  postbox: {
    customMailFrom: "configured",
    evidence: {
      id: "postbox-verification-2026-08-21",
      capturedAt: "2026-08-21T12:01:00.000Z",
      status: "verified",
      customMailFrom: "configured",
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

const configuredPostbox = (records: NonNullable<DnsHandoffInput["postbox"]>["records"], id: string, status: "verified" | "pending" | "failed" = "verified") => ({
  customMailFrom: "configured" as const,
  records,
  evidence: { id, capturedAt: "2026-08-21T12:01:00.000Z", status, customMailFrom: "configured" as const, records },
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
    expect(renderMarkdownHandoff(handoff)).toContain("| Name | Type | Value | Target / apply TTL | Normal / restore TTL | Purpose | Current value | Current TTL | Current RRset (value + TTL) | Action | Replacement or merge rule | Verification | Verification command | Rollback | Rollback value | Rollback TTL | Rollback RRset (value + TTL) |");
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
          currentRecords: [{ type: "A", value: "198.51.100.88", ttl: 3_600 }],
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
      postbox: configuredPostbox(records, "postbox-bounce-spf"),
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
      postbox: configuredPostbox(records, "postbox-bounce-spf"),
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
    ["unresolved edge IPv4", handoffInput({ edge: { evidence: { id: "edge", capturedAt: "2026-08-21T12:00:00.000Z", ipv4: "not-an-ip", migrationTtl: 300, normalTtl: 3_600 }, ipv4: "not-an-ip" } })],
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
      postbox: configuredPostbox(postboxRecords, "postbox-verification-pending", "pending"),
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
      postbox: configuredPostbox(records, "invalid-postbox-shape"),
    });
    expect(() => buildDnsHandoff(input)).toThrow(/dns_handoff_invalid_postbox_record/);
  });

  // Catches one unstable RRset being output twice, a destructive replacement without an explicit
  // reviewed rule, or two SPF TXT records that receivers may select unpredictably.
  it.each([
    ["duplicate target owner/type", handoffInput({ postbox: configuredPostbox([...postboxRecords, { ...postboxRecords[0], value: "second-value" }], "postbox") })],
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

  // Catches accepting only a subset of the provider's verified requirements, such as silently
  // dropping one of several DKIM selectors.
  it("requires an exact Postbox evidence multiset including every DKIM record", () => {
    const secondDkim = { ...postboxRecords[1], name: "postbox2._domainkey.v-b.tech", value: "dkim2-target.from-supplied-evidence.test." };
    const evidenceRecords = [...postboxRecords, secondDkim];
    const input = handoffInput({
      postbox: { ...configuredPostbox(postboxRecords, "postbox-two-dkim"), evidence: { ...configuredPostbox(postboxRecords, "postbox-two-dkim").evidence, records: evidenceRecords } },
    } as unknown as DnsHandoffInput);
    expect(() => buildDnsHandoff(input)).toThrow("dns_handoff_postbox_evidence_mismatch");
  });

  // Catches replacing a provider TXT DKIM selector by appending a second TXT value rather than
  // requiring an exact destructive RRset rule with values and TTLs.
  it("requires a full TXT RRset replacement rule for an occupied DKIM selector", () => {
    const dkimTxt = { ...postboxRecords[1], type: "TXT", value: "v=DKIM1; k=rsa; p=new-key" };
    const records = [postboxRecords[0], dkimTxt, postboxRecords[2], postboxRecords[3]];
    const currentDkim = { name: dkimTxt.name, type: "TXT", value: "v=DKIM1; k=rsa; p=old-key", ttl: 3_600 };
    const input = handoffInput({ currentZone: [...currentZone, currentDkim], postbox: configuredPostbox(records, "postbox-txt-dkim") } as unknown as DnsHandoffInput);
    expect(() => buildDnsHandoff(input)).toThrow("dns_handoff_destructive_replacement_requires_merge_rule");

    expect(() => buildDnsHandoff({
      ...input,
      mergeRules: [...input.mergeRules!, {
        id: "replace-old-dkim-txt-without-rrset",
        kind: "replace-record",
        name: dkimTxt.name,
        type: "TXT",
        currentValues: [currentDkim.value],
      } satisfies DnsMergeRule],
    })).toThrow("dns_handoff_destructive_replacement_requires_merge_rule");

    const reviewed = buildDnsHandoff({
      ...input,
      mergeRules: [...input.mergeRules!, {
        id: "replace-old-dkim-txt",
        kind: "replace-record",
        name: dkimTxt.name,
        type: "TXT",
        currentValues: [currentDkim.value],
        currentRecords: [{ type: "TXT", value: currentDkim.value, ttl: currentDkim.ttl }],
      } satisfies DnsMergeRule],
    });
    expect(reviewed.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: dkimTxt.name, type: "TXT", action: "replace", rollbackTtl: 3_600, rollbackRecords: [{ type: "TXT", value: currentDkim.value, ttl: 3_600 }] }),
    ]));
  });

  // Catches treating a matching A value as an unchanged record when its current TTL differs from
  // evidence-backed migration TTL, or hiding the current TTL needed for exact rollback.
  it("uses approved edge TTL evidence and preserves the actual TTL on an A TTL update", () => {
    const input = handoffInput({
      edge: { ipv4: "198.51.100.24", evidence: { id: "edge-ttl", capturedAt: "2026-08-21T12:00:00.000Z", ipv4: "198.51.100.24", migrationTtl: 120, normalTtl: 3_600 } },
      currentZone: [...currentZone, { name: "v-b.tech", type: "A", value: "198.51.100.24", ttl: 900 }],
    } as unknown as DnsHandoffInput);
    const matchingRows = buildDnsHandoff(input).records.filter((record) => record.name === "v-b.tech" && record.type === "A");
    expect(matchingRows).toHaveLength(1);
    const [row] = matchingRows;
    expect(row).toMatchObject({ action: "update", ttl: 120, currentTtl: 900, rollbackTtl: 900, normalTtl: 3_600 });
  });

  // Catches treating an equal provider value as unchanged when its current TTL differs from the
  // verified Postbox target TTL, which previously discarded the evidence-backed 300-second TTL.
  it("emits a Postbox TTL update with distinct current, target, normal, and rollback TTLs", () => {
    const currentDkim = { name: postboxRecords[1].name, type: "CNAME" as const, value: postboxRecords[1].value, ttl: 3_600 };
    const handoff = buildDnsHandoff(handoffInput({ currentZone: [...currentZone, currentDkim] }));
    const matchingRows = handoff.records.filter((record) => record.name === currentDkim.name && record.type === "CNAME");
    expect(matchingRows).toHaveLength(1);
    const [row] = matchingRows;
    expect(row).toMatchObject({ action: "update", ttl: 300, currentTtl: 3_600, normalTtl: 300, rollbackTtl: 3_600 });
    expect(renderMarkdownHandoff(handoff)).toContain("Target / apply TTL");
  });

  // Catches weak rule bookkeeping and delimiter-concatenated equality that can accept a different
  // RRset than the operator approved.
  it.each([
    ["blank rule ID", [{ ...handoffInput().mergeRules![0], id: "" }]],
    ["duplicate rule ID", [handoffInput().mergeRules![0], { id: "merge-existing-spf-with-postbox", kind: "replace-record", name: "www.v-b.tech", type: "CNAME", currentValues: [] }]],
    ["unused rule", [...handoffInput().mergeRules!, { id: "unused", kind: "replace-record", name: "unused.v-b.tech", type: "CNAME", currentValues: ["old-target.example.test."] }]],
  ])("rejects %s", (_label, mergeRules) => {
    expect(() => buildDnsHandoff(handoffInput({ mergeRules } as Partial<DnsHandoffInput>))).toThrow(/dns_handoff_(invalid|duplicate|unused)_merge_rule/);
  });

  // Catches accepting a configured MAIL FROM record set when Postbox has explicitly verified that
  // custom MAIL FROM is not configured, or requiring records when it is not configured.
  it("permits no custom MAIL FROM records only when Postbox verifies it as not configured", () => {
    const records = [postboxRecords[0], postboxRecords[1], postboxRecords[3]];
    const input = handoffInput({ postbox: { customMailFrom: "not-configured", records, evidence: { id: "postbox-no-mail-from", capturedAt: "2026-08-21T12:01:00.000Z", status: "verified", customMailFrom: "not-configured", records } } } as unknown as DnsHandoffInput);
    expect(() => buildDnsHandoff(input)).not.toThrow();
  });

  it.each([
    ["configured without records", "configured", [postboxRecords[0], postboxRecords[1], postboxRecords[3]]],
    ["not configured with records", "not-configured", postboxRecords],
  ] as const)("rejects %s", (_label, customMailFrom, records) => {
    const input = handoffInput({ postbox: { customMailFrom, records, evidence: { id: "postbox-mail-from-state", capturedAt: "2026-08-21T12:01:00.000Z", status: "verified", customMailFrom, records } } } as unknown as DnsHandoffInput);
    expect(() => buildDnsHandoff(input)).toThrow("dns_handoff_invalid_custom_mail_from_state");
  });

  // Catches a selected IPv6 value that was not present in the attached edge evidence, including
  // stale evidence IPv6 when the release input intentionally selects none.
  it.each([
    ["selected IPv6 differs", { ipv4: "198.51.100.24", ipv6: "2001:db8::25", evidence: { ...handoffInput().edge!.evidence, ipv6: "2001:db8::24" } }],
    ["evidence has unselected IPv6", { ipv4: "198.51.100.24", ipv6: undefined, evidence: handoffInput().edge!.evidence }],
  ])("rejects %s", (_label, edge) => {
    expect(() => buildDnsHandoff(handoffInput({ edge }))).toThrow("dns_handoff_unverified_edge_ip");
  });

  // Catches empty-string IPv6 values bypassing optional-value truthiness checks in both the pure
  // builder and local JSON entry point.
  it("rejects empty IPv6 in builder input and CLI JSON", () => {
    const input = handoffInput({ edge: { ipv4: "198.51.100.24", ipv6: "", evidence: { ...handoffInput().edge!.evidence, ipv6: "" } } } as unknown as DnsHandoffInput);
    expect(() => buildDnsHandoff(input)).toThrow("dns_handoff_unresolved_edge_ip");
    expect(() => parseDnsHandoffInput(input)).toThrow("dns_handoff_invalid_input");
  });

  // Catches treating a provider record with an unverified TTL as equivalent to the evidence.
  it("requires the provider TTL to match its verified evidence", () => {
    const records = postboxRecords.map((record) => record.purpose === "dkim" ? { ...record, ttl: 600 } : record);
    const configured = configuredPostbox(records, "postbox-ttl-mismatch");
    expect(() => buildDnsHandoff(handoffInput({
      postbox: { ...configured, evidence: { ...configured.evidence, records: postboxRecords } },
    }))).toThrow("dns_handoff_postbox_evidence_mismatch");
  });

  // Catches delimiter-joined comparison accepting a different RRset and a pipe splitting a
  // rendered table cell.
  it("compares replacement values structurally and escapes Markdown cells", () => {
    const currentA = [
      { name: "v-b.tech", type: "A" as const, value: "one | two", ttl: 3_600 },
      { name: "v-b.tech", type: "A" as const, value: "three", ttl: 3_600 },
    ];
    expect(() => buildDnsHandoff(handoffInput({
      currentZone: [...currentZone, ...currentA],
      mergeRules: [...handoffInput().mergeRules!, { id: "wrong-delimited-values", kind: "replace-record", name: "v-b.tech", type: "A", currentValues: ["one", "two | three"] }],
    }))).toThrow("dns_handoff_destructive_replacement_requires_merge_rule");

    const markdown = renderMarkdownHandoff(buildDnsHandoff(handoffInput({
      currentZone: [...currentZone, { name: "v-b.tech", type: "TXT", value: "safe | preserved", ttl: 3_600 }],
    })));
    expect(markdown).toContain("safe \\| preserved");
  });

  // Catches drift between the documented pinned bundle invocation and the local entry point, as
  // well as an accidental overwrite of an already-reviewed artifact.
  it("runs the documented bundled CLI and refuses an existing output artifact", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vbtech-dns-bundle-"));
    const inputPath = join(directory, "input.json");
    const outputPath = join(directory, "2026-08-21-vbtech-dns-handoff.md");
    const bundlePath = join(directory, "vbtech-dns-handoff.cjs");
    const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
    try {
      await writeFile(inputPath, JSON.stringify(handoffInput()), "utf8");
      await execFileAsync("corepack", ["pnpm", "exec", "esbuild", "deploy/dns/cli.ts", "--bundle", "--platform=node", "--format=cjs", `--outfile=${bundlePath}`], { cwd: repositoryRoot });
      await execFileAsync(process.execPath, [bundlePath, inputPath, outputPath]);
      await expect(readFile(outputPath, "utf8")).resolves.toContain("# v-b.tech external DNS handoff — 2026-08-21");
      await expect(execFileAsync(process.execPath, [bundlePath, inputPath, outputPath])).rejects.toMatchObject({ stderr: expect.stringContaining("EEXIST") });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  }, 120_000);

  // Catches prefix-recognition of malformed policies and unsafe owners/Markdown data.
  it.each([
    ["malformed SPF version", { name: "v-b.tech", type: "TXT", value: "v=spf10 include:bad.example -all", ttl: 300 }],
    ["malformed DMARC version", { name: "_dmarc.v-b.tech", type: "TXT", value: "v=DMARC10; p=none", ttl: 300 }],
    ["unsafe owner", { name: "bad owner.v-b.tech", type: "TXT", value: "safe", ttl: 300 }],
  ] as const)("rejects %s", (_label, record) => {
    expect(() => buildDnsHandoff(handoffInput({ currentZone: [...currentZone, record] }))).toThrow(/dns_handoff_invalid_record/);
  });

  // Catches syntactically in-zone names that exceed DNS label limits or contain an empty label.
  it.each([
    ["64-character owner label", `${"a".repeat(64)}.v-b.tech`],
    ["empty owner label", "bad..v-b.tech"],
  ])("rejects %s", (_label, name) => {
    expect(() => buildDnsHandoff(handoffInput({ currentZone: [...currentZone, { name, type: "TXT", value: "safe", ttl: 300 }] }))).toThrow("dns_handoff_invalid_record");
  });

  // Catches raw HTML-like record content being interpreted by the rendered operator sheet.
  it("renders HTML-like record content literally", () => {
    const markdown = renderMarkdownHandoff(buildDnsHandoff(handoffInput({
      currentZone: [...currentZone, { name: "v-b.tech", type: "TXT", value: "literal <br> & safe", ttl: 3_600 }],
    })));
    expect(markdown).toContain("literal &lt;br&gt; &amp; safe");
    expect(markdown).not.toContain("literal <br> & safe");
  });
});

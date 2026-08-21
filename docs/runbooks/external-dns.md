# External DNS handoff for v-b.tech

## Scope and approval boundary

`deploy/dns/build-handoff.ts` and `deploy/dns/cli.ts` are local, deterministic record-sheet tools. They have no DNS client, do not resolve names, and do not create, update, or delete provider records. A generated sheet is an approval artifact, not permission to make a DNS change.

Do not create `docs/reviews/YYYY-MM-DD-vbtech-dns-handoff.md` until all of the following are available for the same planned release:

1. A read-only export of the complete current `v-b.tech` zone.
2. An approved edge-IP inventory that identifies the IPv4 address and, only if applicable, IPv6 address for the existing Caddy edge.
3. The exact Postbox domain-verification output, including its status, verification record, DKIM records, custom MAIL FROM records, and SPF instruction.
4. A separate explicit approval to apply the reviewed record sheet at the external DNS provider.

Never substitute an example, a remembered provider value, a lookup result, or a value copied from another domain. Exact DNS and mail-authentication values are release-time evidence and must not be committed before the approval gate.

## 1. Assemble read-only evidence

Export the whole zone from the external provider without changing any records. Preserve the original export with its capture time. Its typed `currentZone` input must include every relevant A, AAAA, CNAME, MX, and TXT record, including unrelated TXT records and every existing SPF/DMARC policy.

Record the approved edge inventory as `edge.evidence`; it must have a stable evidence ID, capture timestamp, exact `ipv4` (plus optional `ipv6`), and evidence-backed positive `migrationTtl` and `normalTtl` values. Copy only those same addresses into `edge.ipv4` and `edge.ipv6`; IPv6 must be absent from both places or match exactly, and an empty string is invalid. The builder rejects an address or TTL plan that is not backed by the supplied inventory evidence.

Copy every Postbox value directly from the supplied verification output into both `postbox.records` and `postbox.evidence.records`, preserving owner, type, value, TTL, purpose, and multiplicity exactly. Mark the evidence `verified` only after the supplied output reports that status. Set `postbox.customMailFrom` and `postbox.evidence.customMailFrom` to the same explicit state: `configured` requires the exact custom MAIL FROM record(s); `not-configured` permits none. Associate each required record with one of these purposes:

- `domain-verification`
- `dkim`
- `custom-mail-from`
- `spf`

The builder rejects pending/failed Postbox output, a subset of verified requirements (including a missing DKIM selector), a mismatched TTL, and any record value that does not appear exactly in the supplied verified evidence.

## 2. State every deliberate replacement or SPF merge

The normal result is additive. If an existing A, AAAA, CNAME, or other non-TXT RRset would be replaced, add a `replace-record` merge rule that names the exact owner/type and every current value. The builder rejects the sheet when that rule does not match the current-zone export exactly. Rule IDs must be nonblank and unique; every supplied rule must be used by exactly one unambiguous row.

A CNAME is stricter: it cannot coexist with any other owner data. If a desired CNAME has any current record at the same owner, use a `replace-cname-owner-records` rule. Its `currentRecords` must list the exact type/value/TTL tuple for every current record at that owner; a missing or extra record fails the build. The resulting row contains the rule ID and complete rollback RRset.

For an occupied provider TXT DKIM selector, use `replace-record` with both `currentValues` and `currentRecords`. `currentRecords` must list the complete current TXT RRset as exact type/value/TTL tuples. A TXT DKIM record is never added beside an occupied selector; without this explicit destructive rule the build fails closed.

If the zone already has one SPF TXT record at the same owner as the Postbox SPF record, add an `append-spf-mechanism` merge rule that repeats the exact current SPF value and the exact Postbox SPF value. The builder preserves the current terminal policy and adds only the provider mechanisms. It refuses two current SPF records at that owner; SPF records at other owners are preserved unchanged. The operator must confirm one SPF policy per owner and exactly one Postbox SPF action at the provider-specified SPF owner; preserved SPF rows at other owners are expected, not conflicts.

Do not write a merge rule to "clean up" MX, unrelated TXT, or DMARC. The handoff preserves existing MX and unrelated TXT records. Existing DMARC is emitted only as a `review` row; no DMARC replacement is proposed.

## 3. Generate and review the local sheet

Create a local JSON input with the `DnsHandoffInput` shape: `asOf`, complete `currentZone`, edge address plus matching `edge.evidence` (including `migrationTtl` and `normalTtl`), Postbox records plus exact `postbox.evidence` and explicit custom-MAIL-FROM state, and any explicit `mergeRules`. A replacement rule's `currentRecords` entries have `{ "type", "value", "ttl" }`. The CLI rejects malformed JSON/shape, unsafe owner/value data, absent evidence, and an existing output file. It never opens the network.

Use only the repository-pinned compiler and this exact local generation sequence; replace the two path arguments with the release-time local evidence file and new dated review path:

```bash
corepack pnpm exec esbuild deploy/dns/cli.ts --bundle --platform=node --format=cjs --outfile=/tmp/vbtech-dns-handoff.cjs
node /tmp/vbtech-dns-handoff.cjs /absolute/path/to/current-release-evidence.json /absolute/path/to/docs/reviews/YYYY-MM-DD-vbtech-dns-handoff.md
```

The output path is created with exclusive-write semantics: choose a new dated artifact rather than overwriting an existing approval sheet. The rendered table distinguishes `Current TTL`, `Target / apply TTL`, `Normal / restore TTL`, and `Rollback TTL`, alongside exact current/rollback RRsets. For edge records, target is the evidence-backed migration TTL and normal is the evidence-backed post-propagation TTL. For a Postbox record, its verified TTL is both the target and normal TTL; a different current TTL produces an `update` row rather than a false `keep`. The generated `dig` command quotes each DNS argument and never interpolates a record value into a shell command.

Before requesting DNS approval, confirm all of these in the generated table:

1. `v-b.tech` has the approved IPv4 A record; AAAA appears only when the approved inventory contains IPv6.
2. `www.v-b.tech` is a CNAME to `v-b.tech.`.
3. Every Postbox verification, DKIM, custom MAIL FROM, and SPF value cites the supplied evidence ID.
4. At the Postbox-specified SPF owner there is exactly one Postbox SPF action, either an evidence-backed add or an explicit merge; each DNS owner has at most one SPF policy. Preserved SPF rows at other owners remain visible.
5. Existing MX and unrelated TXT rows have action `keep`.
6. Existing DMARC has action `review` and no proposed replacement.
7. Every `replace` or `merge` row has an explicit rule ID, row-specific read-only verification command, and concrete rollback value/TTL/RRset; every `update` row has distinct target/current/normal/rollback TTLs where applicable.

Run the local contract check before presenting the sheet:

```bash
corepack pnpm --filter @vbtech/contracts exec vitest --root ../.. run deploy/dns/test/build-handoff.test.ts
```

The root package currently does not own a Vitest binary, so the command intentionally selects the repository-pinned workspace copy while keeping the repository root as Vitest's root. Do not use a network-installed runner for release evidence.

## 4. Apply only after separate approval

After the owner approves the exact dated sheet, an authorized DNS operator applies only its `add`, `update`, `replace`, and `merge` rows at the external provider. The operator must not remove `keep` rows or alter a `review` row.

Use the table's evidence-backed `Target / apply TTL` for each changed row. Do not alter unrelated records to make the sheet easier to apply. Record the provider change time and retain the pre-change export with the approved handoff.

## 5. Verify propagation and TLS

After the provider change, run the approved row-specific read-only verification command for every changed row and compare the answer with its name/type/value/TTL. Verify both the apex and `www` resolution paths before browser testing.

Then verify Caddy TLS against the public canonical host: the certificate chain must be valid for `v-b.tech`, `www` must follow the reviewed canonical behavior, and the expected release header/routes must resolve. This is a verification step only; it does not authorize public-form activation.

Once propagation is stable, restore the evidence-backed `Normal / restore TTL` where it differs from the target TTL using another explicit provider change and record that action separately.

## 6. Roll back a failed DNS change

If any approved record does not propagate as reviewed, restore the pre-change values and TTLs from the sheet's `Rollback value`, `Rollback TTL`, `Rollback RRset`, and `Rollback` columns. Remove only records whose approved action was `add`; restore the complete captured owner data for a CNAME replacement, the complete captured RRset for `replace`, and the original one SPF value and TTL for `merge`.

Do not remove existing MX, unrelated TXT, or DMARC to roll back the website. Re-run authoritative read-only checks after rollback and record the result in the dated review artifact.

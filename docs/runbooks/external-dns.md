# External DNS handoff for v-b.tech

## Scope and approval boundary

`deploy/dns/build-handoff.ts` is a local, deterministic record-sheet builder. It has no DNS client, does not resolve names, and does not create, update, or delete provider records. A generated sheet is an approval artifact, not permission to make a DNS change.

Do not create `docs/reviews/YYYY-MM-DD-vbtech-dns-handoff.md` until all of the following are available for the same planned release:

1. A read-only export of the complete current `v-b.tech` zone.
2. An approved edge-IP inventory that identifies the IPv4 address and, only if applicable, IPv6 address for the existing Caddy edge.
3. The exact Postbox domain-verification output, including its status, verification record, DKIM records, custom MAIL FROM records, and SPF instruction.
4. A separate explicit approval to apply the reviewed record sheet at the external DNS provider.

Never substitute an example, a remembered provider value, a lookup result, or a value copied from another domain. Exact DNS and mail-authentication values are release-time evidence and must not be committed before the approval gate.

## 1. Assemble read-only evidence

Export the whole zone from the external provider without changing any records. Preserve the original export with its capture time. Its typed `currentZone` input must include every relevant A, AAAA, CNAME, MX, and TXT record, including unrelated TXT records and every existing SPF/DMARC policy.

Record the approved edge inventory as `edge.evidence`; the inventory must have a stable evidence ID, capture timestamp, and exact `ipv4` (plus optional `ipv6`) values. Copy only those same addresses into `edge.ipv4` and `edge.ipv6`; the builder rejects an address that does not appear in its supplied inventory evidence.

Copy every Postbox value directly from the supplied verification output into both `postbox.records` and `postbox.evidence.records`. Mark the evidence `verified` only after the supplied output reports that status. Associate each required record with one of these purposes:

- `domain-verification`
- `dkim`
- `custom-mail-from`
- `spf`

The builder rejects pending/failed Postbox output and rejects any record value that does not appear exactly in the supplied verified evidence.

## 2. State every deliberate replacement or SPF merge

The normal result is additive. If an existing A, AAAA, CNAME, or other non-TXT RRset would be replaced, add a `replace-record` merge rule that names the exact owner/type and every current value. The builder rejects the sheet when that rule does not match the current-zone export exactly.

If the zone already has one SPF TXT record, add an `append-spf-mechanism` merge rule that repeats the exact current SPF value and the exact Postbox SPF value. The builder preserves the current terminal policy and adds only the provider mechanisms. It refuses two current SPF records and never emits two SPF records.

Do not write a merge rule to "clean up" MX, unrelated TXT, or DMARC. The handoff preserves existing MX and unrelated TXT records. Existing DMARC is emitted only as a `review` row; no DMARC replacement is proposed.

## 3. Generate and review the local sheet

Call `buildDnsHandoff(input)` with the dated evidence object and pass the result to `renderMarkdownHandoff(handoff)`. Save the rendered output as `docs/reviews/YYYY-MM-DD-vbtech-dns-handoff.md`, outside this pre-release change set. The table contains the required name, type, value, TTL, purpose, current value, action, verification, and rollback columns.

Before requesting DNS approval, confirm all of these in the generated table:

1. `v-b.tech` has the approved IPv4 A record; AAAA appears only when the approved inventory contains IPv6.
2. `www.v-b.tech` is a CNAME to `v-b.tech.`.
3. Every Postbox verification, DKIM, custom MAIL FROM, and SPF value cites the supplied evidence ID.
4. There is exactly one SPF row and it is either an evidence-backed add or an explicit merge.
5. Existing MX and unrelated TXT rows have action `keep`.
6. Existing DMARC has action `review` and no proposed replacement.
7. Every `replace` or `merge` row has a concrete rollback that restores its captured current value.

Run the local contract check before presenting the sheet:

```bash
corepack pnpm --filter @vbtech/contracts exec vitest --root ../.. run deploy/dns/test/build-handoff.test.ts
```

The root package currently does not own a Vitest binary, so the command intentionally selects the repository-pinned workspace copy while keeping the repository root as Vitest's root. Do not use a network-installed runner for release evidence.

## 4. Apply only after separate approval

After the owner approves the exact dated sheet, an authorized DNS operator applies only its `add`, `replace`, and `merge` rows at the external provider. The operator must not remove `keep` rows or alter a `review` row.

Use the provider's shortest safe migration TTL for changed records as shown in the approved sheet. Do not alter unrelated records to make the sheet easier to apply. Record the provider change time and retain the pre-change export with the approved handoff.

## 5. Verify propagation and TLS

After the provider change, use read-only authoritative DNS queries to compare every changed owner/type/value/TTL with the approved sheet. Verify both the apex and `www` resolution paths before browser testing.

Then verify Caddy TLS against the public canonical host: the certificate chain must be valid for `v-b.tech`, `www` must follow the reviewed canonical behavior, and the expected release header/routes must resolve. This is a verification step only; it does not authorize public-form activation.

Once propagation is stable, restore the normal approved TTL using another explicit provider change and record that action separately.

## 6. Roll back a failed DNS change

If any approved record does not propagate as reviewed, restore the pre-change values from the sheet's `Current value` and `Rollback` columns. Remove only records whose approved action was `add`; restore the complete captured RRset for `replace` and the original one SPF value for `merge`.

Do not remove existing MX, unrelated TXT, or DMARC to roll back the website. Re-run authoritative read-only checks after rollback and record the result in the dated review artifact.

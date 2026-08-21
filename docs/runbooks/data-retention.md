# v-b.tech contact data-retention runbook

## Policy boundary

The hourly `vbtech-contact-worker` both drains the outbox and runs `runContactRetention`. Successful delivery and terminal failure normally erase encrypted visitor fields atomically. The repair pass erases any remaining terminal payload after 24 hours, in batches of at most 100. Terminal metadata is deleted after 30 days, also in bounded batches, followed by deletion of orphaned request hashes.

The business mailbox is a separate system and lifecycle. Enquiry correspondence is retained for no more than one year after last substantive contact unless a separate documented legal basis with an owner, scope, start date, review date, and evidence ID authorizes longer retention. A generic possibility of future business is not a basis.

Do not invent live resource IDs. Use named release-time evidence placeholders for the exact database, worker trigger, mailbox, review month, and approval records. Never store credentials, personal content, mail bodies, encryption material, or provider response content in retention evidence. Routine evidence is metadata-only and aggregated wherever possible.

## Monthly evidence packet

The operations owner creates one immutable, access-controlled packet each calendar month. It contains:

1. review period, UTC capture time, operator, policy revision, runtime release SHA, database evidence ID, worker/trigger evidence IDs, and business mailbox evidence ID;
2. the last 30 days of bounded `contact_retention`/`contact_timer` telemetry counts by stage/status, with no visitor fields;
3. aggregate database counts from the query below and the query/result checksum;
4. mailbox review totals: reviewed, retained within one year, removed, and retained under separate legal basis;
5. each exception's opaque case evidence ID, last substantive contact date, decision, owner, next review date, and separate legal-basis evidence ID when applicable;
6. failures, bounded recovery taken, second-check result, and reviewer sign-off.

Evidence never includes database connection details, public enquiry UUIDs, message IDs tied to individuals, address/phone/handle fields, ciphertext, rendered correspondence, captcha material, or free-form notes.

## Terminal payload and metadata review

Use a credential broker or local PostgreSQL service entry bound to a dedicated read-only audit role. The service entry name is itself taken from the database evidence record; no connection URL appears in the command. Confirm separately in the provider control plane that the role can read only the `vbtech_contact` audit surface and cannot write.

The expected invariant is zero terminal rows retaining encrypted fields beyond the 24-hour repair window, zero terminal outbox rows beyond the 30-day metadata window, and zero orphan request-hash rows. Nonzero results are incidents, not permission for an unreviewed delete or replay. The hourly cleanup may require several passes because every mutation is bounded to 100 rows.

### Command: Capture aggregate terminal-retention invariants

- Target/resource: production `vbtech_contact` database tables `email_outbox` and `contact_requests` through the approved read-only audit service
- Classification: **READ-ONLY**
- Expected output: one CSV row of aggregate counts with all three violation columns equal to zero and no personal values
- Bounded failure branch: stop evidence sign-off, retain only counts and timestamps, allow one scheduled worker pass, then recheck once and escalate if nonzero

```bash
set -euo pipefail
: "${VBTECH_READONLY_PGSERVICE_EVIDENCE:?set from the database inventory}"
: "${VBTECH_RETENTION_AS_OF_EVIDENCE:?set to the approved UTC review timestamp}"
[[ "$VBTECH_READONLY_PGSERVICE_EVIDENCE" =~ ^[a-zA-Z0-9_.-]{1,64}$ ]]
[[ "$VBTECH_RETENTION_AS_OF_EVIDENCE" == *T*Z ]]
psql "service=$VBTECH_READONLY_PGSERVICE_EVIDENCE" -X --set=ON_ERROR_STOP=1 --set=as_of="$VBTECH_RETENTION_AS_OF_EVIDENCE" --csv <<'SQL'
WITH outbox AS (
  SELECT
    count(*) FILTER (
      WHERE (delivered_at IS NOT NULL OR failed_at IS NOT NULL)
        AND COALESCE(delivered_at, failed_at) <= :'as_of'::timestamptz - interval '24 hours'
        AND payload_ciphertext IS NOT NULL
    ) AS terminal_payload_violations,
    count(*) FILTER (
      WHERE (delivered_at IS NOT NULL OR failed_at IS NOT NULL)
        AND COALESCE(delivered_at, failed_at) <= :'as_of'::timestamptz - interval '30 days'
    ) AS terminal_metadata_violations
  FROM email_outbox
), requests AS (
  SELECT count(*) AS orphan_request_hash_violations
  FROM contact_requests AS request
  WHERE NOT EXISTS (
    SELECT 1 FROM email_outbox AS job
    WHERE job.public_request_id = request.public_request_id
  )
)
SELECT outbox.terminal_payload_violations,
       outbox.terminal_metadata_violations,
       requests.orphan_request_hash_violations
FROM outbox CROSS JOIN requests;
SQL
```

If the first result is nonzero, check only worker/timer metadata: invocation count, bounded stage/status, release SHA, and failure class. Do not inspect encrypted values. If the worker did not run, repair the trigger through a separately approved runtime change and record its audit ID. If it did run, open an application incident against the exact release and preserve aggregate proof.

If the second or third result is nonzero after one scheduled pass, first determine whether more than 100 rows were due. Permit normal hourly bounded passes; do not launch concurrent cleanup or manual SQL deletion. A forced worker invocation, job replay, row correction, or deletion is a separate mutating operation requiring explicit incident approval and a target count ceiling.

## Business mailbox monthly review

The mailbox owner reviews the exact approved `hello@v-b.tech` production mailbox in its provider interface using a metadata-only index. For each enquiry thread:

1. determine the last substantive contact date from the thread timeline without copying correspondence into the evidence packet;
2. calculate the ordinary expiry as that date plus one calendar year;
3. if the review time is before expiry, record `retain-until` with the date;
4. if the review time is on or after expiry, remove the thread from inbox, archive, sent, spam, and trash during the approved monthly deletion window;
5. retain beyond expiry only when a separate documented legal basis names the opaque case evidence ID, legal basis, exact scope, owner, approval date, and next review date;
6. verify removal using provider totals/search metadata and record only counts and provider audit evidence IDs.

Mailbox removal is **MUTATING** and the monthly approval must name the mailbox, review cutoff, maximum thread count, operator, and rollback limitations. Do not export messages as a convenience copy. If mailbox search is incomplete, deletion scope exceeds the approved ceiling, a legal-hold decision is ambiguous, or the provider cannot verify trash expiry, stop and escalate the affected opaque case IDs; do not bulk-delete.

## Completion and escalation

The monthly packet passes only when database violation counts are zero after bounded recovery, every mailbox thread has a disposition, every beyond-one-year retention has its own current legal-basis record, removed items are verified absent according to provider behavior, and a second operator signs the metadata-only summary.

Missed monthly review, content-bearing evidence, uncertain mailbox scope, disabled worker/trigger, repeated cleanup backlog, or an overdue legal-basis review is an incident. Preserve the minimum metadata necessary to investigate and follow `rollback.md` if public intake must be disabled; do not change DNS or expose personal data to diagnose retention.

# Task 7 fix round 2 independent re-review

**Review range:** `f41151194f61a0dcca6d50bedac73d1fba37e498..21b56f689a32f3c17eca7c5be19f14e1c7c456f3`

**Scope:** only the remaining Important finding from `task-7-rereview-1.md`, plus any new Critical/Important regression in the fix range. The actual diff, updated tests, runbook, acceptance report, implementation report, ledger, generated manifest/PNGs, and applicable Playwright visual/configuration guidance were reviewed. No source file was edited and no local service was started or restarted.

## Verdict

**Clean for the scoped Critical/Important review.** The remaining Important finding is fixed, and the fix introduces no new Critical or Important breakage. Two documentation precision issues remain Minor and are listed separately below.

## Critical findings

None.

## Important findings

None.

## Remaining Important finding — fixed

### Bounded streaming before JSON parsing

- `tools/browser/email-acceptance/capture.ts:126-166` validates any declared content length, streams at most 1,048,576 bytes, cancels when the streamed total crosses the ceiling, performs fatal UTF-8 decoding only after the byte-bounded read, and only then calls `JSON.parse`.
- `tools/browser/email-acceptance/capture.ts:219-225` routes every Mailpit JSON fetch through that reader. There is no remaining `response.json()` path in the generator.

### HTML and text character/byte ceilings

- `tools/browser/email-acceptance/capture.ts:13-17,118-194` defines and enforces separate Unicode-code-point and UTF-8 byte ceilings: HTML 32,768/65,536 and text 8,192/16,384.
- `tools/browser/email-acceptance/capture.ts:237-260` applies those checks immediately after every message-detail response, before browser rendering. `tools/browser/email-acceptance/capture.ts:551-563` reuses the same measurements for each manifest record.

### Pre-screenshot document bounds and bounded PNGs before write

- `tools/browser/email-acceptance/capture.ts:376-412` measures maximum viewport/client/scroll dimensions and rejects captures above 1,440×2,048 or sheets above 1,280×4,096 before invoking screenshot.
- `tools/browser/email-acceptance/capture.ts:414-441` checks PNG signature/IHDR, actual IHDR dimensions, and bytes in memory. Capture PNGs are limited to 524,288 bytes; the sheet is limited to 4,194,304 bytes.
- The capture path measures first at `tools/browser/email-acceptance/capture.ts:575`, screenshots into memory at `:576-580`, validates/matches dimensions at `:581-584`, checks cumulative bytes at `:585-586`, and writes only at `:588`.
- The sheet path follows the same order at `tools/browser/email-acceptance/capture.ts:511-518`.

This closes the prior full-page expansion/disk-output gap: an oversized DOM is rejected before screenshot allocation, and a PNG that violates dimensions or bytes is rejected before filesystem write.

### Aggregate evidence, stable manifest, and failure cleanup

- `tools/browser/email-acceptance/capture.ts:443-450` enforces the 8,388,608-byte total.
- Capture bytes are accumulated before each write; capture plus sheet bytes are checked before the sheet write; `tools/browser/email-acceptance/capture.ts:632-645` then reaches a stable fixed-point total including the serialized manifest and checks it before writing the manifest.
- `tools/browser/email-acceptance/capture.ts:452-463,539-647` removes the exact evidence directory before generation and removes every partial artifact on a caught failure. The complete cleanup test passed in an isolated temporary checkout and left that checkout's evidence directory absent.

This is fail-clean rather than preservation of an older successful run: a failed replacement intentionally leaves no evidence that could be mistaken for current acceptance. The runbook describes that behavior accurately.

### Manifest measurements and actual generated evidence

- `tools/browser/email-acceptance/capture.ts:70-113` defines actual content, document, image, file, sheet, limits, and total-byte fields. Capture records are populated at `:589-609`; sheet measurements at `:519-527`.
- `tools/browser/tests/email-acceptance.spec.ts:28-67` checks every actual record against the committed limits, requires image/document equality, reparses the written manifest, requires it to equal the returned result, and recomputes the exact aggregate including manifest bytes.
- Independent audit of the ignored evidence found exactly 32 capture PNGs, one sheet, and one manifest. All 33 PNG hashes, IHDR dimensions, and byte counts matched their records. Manifest SHA-256 is `56fb097de27c49c7c5b8aefbfc5065c256effd9f4cc91f6db2019c69036a86c5`; sheet SHA-256 is `4222140c1eab3486cef607919c52ed9627ca15034474603ee2e018182c7fd1d0`.
- Declared and independently summed total are both 2,085,570 bytes, below 8,388,608. Actual maximum height is 1,402, maximum PNG bytes is 74,652, and the sheet is 1,120×3,026 / 396,659 bytes. All are within their ceilings. The manifest still reports four kinds, 32 captures, minimum contrast 4.93, and zero external requests.

### Focused tests and mutation sensitivity

- `tools/browser/tests/email-acceptance-bounds.spec.ts:7-20` owns literal expected limits independently from the implementation exports; `:52-139` exercises relaxed JSON, body, document, capture, aggregate, and sheet boundaries. If an internal check is relaxed while the exported/documented contract stays unchanged, those six over-limit tests stop throwing and fail. The export-contract and cleanup tests are deliberately unaffected, matching the reported six-fail/two-pass mutation result.
- All eight focused boundary tests passed in an isolated temporary checkout, including the destructive cleanup regression. The temporary checkout was removed afterward.
- Seven non-destructive boundary tests also passed in the review worktree. The initial Chromium launch failed only because the filesystem sandbox denied the macOS rendezvous port; the exact focused command passed outside that sandbox.
- Browser TypeScript checking passed before the isolated dependency setup; lockfile-pinned dependencies were restored afterward and no tracked file changed.

The real Mailpit generator test was not rerun because the documented services had already been removed and recreating them was unnecessary for this scoped finding. Its generated output was independently audited as above.

## Canonical isolation and cleanup — unchanged and accepted

- `tools/browser/email.playwright.config.ts:3-14` collects exactly the eight boundary tests plus the one real-message generator test.
- `tools/browser/playwright.config.ts:8-12` excludes the complete `email-acceptance*.spec.ts` family. Default collection remained 106 ordinary tests in two files and collected no opt-in email test.
- `docs/runbooks/contact-delivery.md:114-121` still requires `docker compose ... down -v --remove-orphans` and an empty final listing. No compose/source change in this round weakened service isolation or cleanup.

## Minor documentation precision notes

### 1. The reported “largest capture” combines maxima from different files

`docs/reviews/contact-pipeline-local-acceptance.md:79`, `docs/runbooks/contact-delivery.md:89`, and `.superpowers/sdd/2026-08-20-vbtech-contact-pipeline/task-7-report.md:107` describe a largest capture as `1280×1402` and 74,652 bytes. No single capture has those values. The maximum height belongs to a 390×1402 mobile RU text capture; the maximum byte count belongs to `ru-notification-text-desktop-light.png` at 1280×1234 / 74,652 bytes. State these as independent maxima, or name the actual files.

### 2. The acceptance report attributes content measurements to the contact sheet

`docs/reviews/contact-pipeline-local-acceptance.md:79` says every capture “and the sheet” records content characters/UTF-8 bytes. Capture records do; the contact-sheet record at `tools/browser/email-acceptance/capture.ts:92-100` correctly records document/image dimensions, file bytes, and hash, but no content character/byte fields. Narrow the sentence to the 32 capture records and describe the sheet fields separately.

These inaccuracies do not weaken the implemented ceilings or the actual evidence and are not Critical/Important blockers.

## Focused verification performed

- Complete isolated boundary suite — PASS, 8/8.
- Non-destructive boundary subset in review checkout — PASS, 7/7.
- Browser TypeScript check — PASS.
- Email Playwright collection — 9 tests in 2 files.
- Canonical Playwright collection — 106 tests in 2 files; no email-acceptance test.
- Actual ignored evidence audit — exact 32+sheet+manifest set; hashes/dimensions/bytes and aggregate match; all limits satisfied.
- `git diff --check` — PASS.
- Final tracked worktree status before this report — clean.

## Final verdict

**Clean: zero Critical and zero Important findings remain in scope.** The bounded generator now fails closed across Mailpit input, body size, browser layout, PNG dimensions/bytes, cumulative output including the stable manifest, contact-sheet output, and partial-generation cleanup. The two Minor prose corrections should be made for exact artifact reporting but do not block Task 7 acceptance.

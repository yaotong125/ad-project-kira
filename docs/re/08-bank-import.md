# Slice 8: Bank statement import (`/{slug}/import`)

Reverse engineered from lejar.ai on 2026-11-22, read-only, on the user's test entity. No statement was uploaded to Lejar.

Sources:
- `/import` HTML and screenshot;
- the ImportFlow chunk `41vyteosd4-yz`: detectStatementBankAction, analyseUploadAction, categoriseChunkAction, confirmMatchesAction, bulkApproveAction, settleStatementLineAction, undo/delete actions;
- Lejar's in-app help article "Importing bank statements" (chunk `0-eyswk7vufsj`);
- 238 `bankImport.*` strings and the `bank-import` / `match-bank` guided-flow texts.

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar

- **Page:**
  - "Import bank statements", with the subtitle "{entity} · upload one or several CSV/PDF statements, review the categorised drafts, record each in one batch".
  - A card with "Statement files: CSV or PDF, pick one or several", "Choose files" (CSV, PDF, PNG, JPEG, WebP) and "Add a bank account" ("Import to a specific bank account (e.g. Maybank · 1234…) instead of the generic Cash and Bank Balances").
  - A "Recent statement uploads" list with Re-run and Delete.
- **Flow:**
  1. "Detecting banks…".
  2. A table with File / Bank (Maybank, CIMB and Public Bank for CSV and PDF; AmBank, RHB, OCBC, Hong Leong, Alliance and Bank Islam for PDF only) / Cash or bank account.
  3. "Process N statements", which runs "Statement n of total".
  4. "Categorising batch n of total".
  5. Lines matching an existing entry ("Confirm N matches", "Reconciled N entries. No new entries recorded.").
  6. "Review N draft entries": Date, Description, Amount (IN/OUT), Contra account (AI suggestion), Confidence, Reasoning, and Actions (Record / Edit / Delete).
  7. "Approve all with a category", then "Record N entries".
  8. Skipped lines, and Next statement / Finish.
- **Not built in Kira yet:**
  - "already imported" warnings with Undo import / Remove duplicates;
  - settling a line against an open invoice or bill ("Record as receipt against INV…"), customer credit, and WHT remittances.
- **Lejar's help article:**
  - It has a dedicated parser for each bank's PDF e-statement, plus CSV for Maybank, CIMB and Public Bank. Scans or photos are refused unless they read cleanly.
  - Statement dates must fall in open periods.
- **Learn section 4:** "Kira read the statement and recorded the lines in your books."
- **Tour markers:** `data-flow` import-upload / import-review / import-approve, then reconcile-setup on /reconcile.

## Kira's build

- **Migrations:**
  - `20261122000700_bank_import.sql`:
    - tables `bank_statements` and `bank_statement_lines` (draft / recorded / matched / skipped / duplicate);
    - functions `create_bank_account` (300-1101, 300-1102 … under 300-1100), `save_bank_statement` (lines already recorded for the same account, date, amount, direction and description become **duplicate**), `save_line_suggestions`, `update_statement_line`, `record_statement_lines`, `confirm_statement_matches`, `delete_bank_statement`;
    - CSV is now allowed in the Storage bucket.
  - `…0710`: `register_source_document`, which stores a file without an inbox draft.
  - **Recording a line:** in = Dr bank / Cr category, out = Dr category / Cr bank, each line as its own journal entry (source `bank`). Lines in a closed period fail and stay drafts. Learn section 4 is checked.
- **Reading (assumed):**
  - **CSV:** Kira's own column-detecting parser (`csv.ts`): header row with date + description + debit/credit or amount, Malaysian day-first dates, "1,234.50", "(12.00)", "12.00 DR", and a running balance.
  - **PDF and photos:** Claude Opus 5.5 reads the lines (`ai.ts`, structured output). Unreadable statements are refused with Lejar's scan wording.
  - Lejar's per-bank PDF parsers could not be copied: there were no real statements to study.
- **Categorising:** Claude, 40 lines per call, effort low. It returns the account code, confidence and reasoning. A suggestion below 60% shows "Low confidence. Check the category." (the threshold is Kira's).
- **Matches:** journal lines on the same bank account with the same amount and direction within 7 days that came from somewhere other than an import. Confirming one links the line and records nothing new.
- **UI:** `upload-flow.tsx` (upload, detect, add bank account, process) and `review-flow.tsx` (categorise, match, edit, skip, record, queue).

## Verified (2026-11-22, real Supabase project, fake Claude endpoint, temporary user deleted afterwards)

- **Tour:** Learn Start section 4 showed "IMPORT A BANK STATEMENT · 1 OF 4".
- **Upload:** "Maybank · 1234" was added (300-1101). A Maybank-style CSV and a CIMB PDF were detected as MAYBANK and CIMB, and "Process 2 statements" ran.
- **Statement 1 (CSV):**
  - 1 parser warning (the "Balance B/F" row).
  - CASH DEPOSIT 250.00 matched a manual entry 1 day apart → confirmed.
  - 3 drafts were categorised (TNB → Utilities 95%, Petronas → Motor vehicle 50% "Low confidence", service charge → Bank Charges 90%) and recorded.
- **Statement 2 (PDF, read by AI):** 2 lines categorised. One amount was edited (marked "edited, differs from the statement"), then both were recorded.
- **Re-upload:** the same CSV gave "4 lines of this statement are already in your books".
- **Learn:** section 4 was checked.
- **Ledger:** balanced (Dr 2,579.40 = Cr 2,579.40), with the bank account moving exactly by the statement lines.
- **Bugs found and fixed:** the review didn't re-categorise when moving to the next statement (the component is now keyed per statement), plus a test-harness fix.

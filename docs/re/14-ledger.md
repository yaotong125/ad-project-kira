# Slice 14: Ledger

Reverse engineered from lejar.ai on 2026-11-22, read-only.
- The ledger page `/{slug}/ledger` on the user's test entity Kira Test Sdn Bhd (empty books): page HTML (`b0-ledger.html`), client chunks (`246kkikeeb2eh` for `PeriodRangeSelect`, `CloseOrReopen`, `TieOutPanel`, `LedgerSectionTabs`, `HideVoidedToggle`, `ReverseEntryButton`, `VoidEntryButton`), and help articles `"ledger"` and `"periods"`.
- REA browser target discovery against the signed-in debugging Chrome (`http://127.0.0.1:9222`, Evidence `ev_19672b4b8ad5dc45b1e6f70058168ed8b854d877ef760a755728275492462c55` / `ev_f0c7465c8fcc6a7aba31875e2a1ff029d9cc549641df4574b513daa1128708d8`).
- Populated entries, sub-ledger tie-out warnings, reversal detail page (`/ledger/entries/[id]`), and trial balance PDF layout were inferred from Lejar's client bundle and Server Action signatures (no entries were posted on the user's Lejar test entity).

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar

- **Header (`/{slug}/ledger`):**
  - Title `Ledger`, subtitle `{org} · period dd/mm/yyyy → dd/mm/yyyy` with dotted-underline hover hint (`TermHint`) on `period`, and `"Learn about this page"` help toggle.
  - `PeriodRangeSelect`: two `<select>` controls (`Opening period`, `Closing period`) pushing `?fromPeriodId=` and `?toPeriodId=`, showing `(closed)` on closed periods, with a spinner (`Loading…`) and `Updated` status notice.
  - `CloseOrReopen`: shows `Period dd/mm/yyyy to dd/mm/yyyy` + status chip (`open` / `closing` / `closed`) and `Close period` or `Reopen period` (which opens an inline `"Reason (required)"` input, `Confirm reopen`, and `Cancel`).
  - Sub-ledger check (`TieOutPanel`): shown when closing finds receivable/payable differences between the general ledger and open invoices/bills; lists each account's ledger balance, sub-ledger balance, difference, `"Fix receivables"` / `"Fix payables"` link, and (when override is permitted) `"Reason to close anyway (required)"` + `"Close anyway"`.
- **Setup banner:** `"Setup is not finished yet. Open Finish setup on the dashboard to see what is left."` → `/{slug}#finish-setup` when SSM/SST/TIN are missing and setup is not hidden.
- **Stats strip (`data-testid="ledger-stats"`):** 3 cards — `TOTAL DEBITS` (`As of YYYY-MM-DD`), `TOTAL CREDITS` (`As of YYYY-MM-DD`), and `POSTED ENTRIES` (`Trial balance is balanced` or `Trial balance is out by …`).
- **Tabs (`LedgerSectionTabs`, roving tabindex with ArrowLeft/ArrowRight/Home/End):**
  - **Trial balance:** `as of YYYY-MM-DD`, `Download CSV`, `Download PDF` (`/{slug}/ledger/trial-balance/pdf?periodId=`), table with `Code`, `Account`, `Debit` (hover hint), `Credit` (hover hint), empty text `"No entries yet."`, and `Totals` row with `Balanced` / `Out of balance` chip.
  - **Entries (with count badge):** `"In this period"`, `"Do not display voided transactions"` checkbox persisted via cookie, empty state `"No entries posted yet"`, table of entries with `Reverse` (date + reason, then `"Reversal posted on … · View the reversal"` linking to `/{slug}/ledger/entries/{id}`) and `Void` (`"Voiding removes this entry from all books and reports. It cannot be undone."` + reason).

## Kira's build

- **Routes:**
  - `src/app/[org]/ledger/page.tsx` — replaces "coming soon" (added `"ledger"` to `BUILT_PATHS` in `src/shared/shell/nav.ts`).
  - `src/app/[org]/ledger/entries/[id]/page.tsx` — journal entry detail page with lines, totals, source document link, reversal links, void reason, and inline Reverse/Void actions for open manual entries.
  - `src/app/[org]/ledger/trial-balance/pdf/route.ts` — authenticated GET route streaming a two-column A4 trial balance PDF (`src/features/ledger/pdf.ts`).
- **Feature files (`src/features/ledger/`):**
  - `load.ts`: `loadPeriods`, `resolveRange` (defaults to the period containing today in MY time; **Assumed** over Lejar's latest period, which is often empty), `trialBalance` (via `Ledger.load`), `loadEntries` (up to 300 entries in range, with `kira_hide_voided` cookie), `sourceHref`, `SOURCE_LABEL`.
  - `actions.ts`: `closePeriodAction`, `reopenPeriodAction`, `reverseEntryAction`, `voidEntryAction` mapped to Lejar's error copy.
  - `controls.tsx`: `PeriodRangeSelect`, `CloseOrReopen`, `TieOutPanel`, `LedgerTabs`, `HideVoidedToggle`, `ReverseEntryButton`, `VoidEntryButton`.
  - `ledger-page.tsx`: server component rendering header, setup banner, stats strip, and both tab panels.
  - `pdf.ts`: `trialBalancePdf` using `pdf-lib` (Code, Account, Debit RM, Credit RM, balanced totals, Kira mark).
- **Shared refactor & journal list update:**
  - Extracted `src/features/books/doc-info.ts` (`documentInfo`) from dashboard so both Dashboard and Ledger resolve customer/supplier names and invoice/bill numbers consistently.
  - Updated `src/features/journal/` list to include `reversal` entries, show `Void` / `Reversed` chips, and link entry numbers to `/ledger/entries/[id]`.
- **Database (`supabase/migrations/20261122001200_ledger.sql`):**
  - Extended `journal_entries.source` check constraint with `'reversal'`; added `voided_at`, `voided_by`, `void_reason`, `reversal_of`, `reversed_by`.
  - Added `voided_journal_lines` (voiding moves lines out of `journal_lines` so all existing ledger/report queries exclude voided entries automatically while keeping audit lines intact) and `period_events` (audit log of closes, overrides, and reopens).
  - Added RPCs: `org_for_admin` (owner/admin role check), `ledger_tie_out` (compares AR/AP general ledger vs open invoices/bills as of period end in sen), `close_period` (enforces chronological closing + tie-out with optional override reason), `reopen_period` (enforces reverse-chronological reopening + required reason + unlocked fiscal year), `reverse_journal_entry` (manual entries only; posts opposite `JV` on date ≥ original), `void_journal_entry` (manual entries in open, unreconciled periods only).
  - **Assumed:** Kira has no multi-currency FX revaluation yet, so `close_period` runs the AR/AP tie-out without FX revaluation. Document-backed entries (invoices, bills, receipts, payments) must be voided from their own pages so document statuses remain accurate.

## Verified (2026-11-22, real Supabase project, temporary user deleted afterwards)

- **Empty entity:** period header `01/11/2026 → 31/12/2026`, 6 bi-monthly periods in dropdown, stats `RM0.00` / `RM0.00` / `0` (`Trial balance is balanced`), setup banner visible, empty Trial balance `"No entries yet."`.
- **Populated books** (2 manual JVs: RM1,000 consulting + RM250 direct Trade Receivables; 1 invoice RM500):
  - Stats `RM1,750.00` / `RM1,750.00` / `3`; Trial balance lists `300-0200 Trade Receivables RM750.00`, `300-0900 Cash and Bank Balances RM1,000.00`, `600-0000 Revenue RM1,750.00`.
  - **Reversal:** reversed `JV-202611-001` on `2026-11-15` → posted `JV-202611-003` (`Reversal of JV-202611-001: Client cancelled`), `"View the reversal"` opens `/ledger/entries/{id}` with flipped debit/credit lines and link back to `JV-202611-001`.
  - **Sequential closing & sub-ledger tie-out:** attempting to close Nov–Dec first is blocked (`"Close the earlier period 01/01/2026 to 28/02/2026 first. Periods close in order."`); after closing Jan–Oct, closing Nov–Dec detects the RM250 AR mismatch (`ledger RM750.00, sub-ledger RM500.00, difference RM250.00`) and displays `TieOutPanel` with `"Fix receivables"` and `"Close anyway"`.
  - **Void manual entry & hide-voided toggle:** voiding `JV-202611-002` hides it by default; unchecking `"Do not display voided transactions"` reveals it with strikethrough amount, `Void` chip, and void reason; Trial balance drops cleanly to `RM500.00` / `RM500.00`.
  - **Close & lock enforcement:** Nov–Dec now closes cleanly (`Period closed.`, chip `closed`); posting a new journal entry dated `2026-11-20` is rejected (`"That date is in a closed period or before your books start. Pick a date inside your open books."`).
  - **Exports & reopen:** Trial balance PDF returns `200 application/pdf` (1,598 bytes); CSV downloads `300-0200` + `600-0000` + balanced totals; reopening without reason shows `"Reopen requires a reason."`; reopening with reason restores `open` status.
- **Interactive clicking/hovering UI audit (browser subagent + visual screenshot review):**
  - Verified hover tooltips (`period`, `Debit`, `Credit`), `"Learn about this page"` expand/collapse, tab switching, table row hover highlights, hide-voided toggle, entry detail navigation, and inline Reopen form with zero console or API errors.
  - Fixed header wrapping & alignment found during visual/browser audit: fixed-width `w-48` period selects, non-crushing flex-wrap header layout when `TieOutPanel` or `"Learn about this page"` opens, `whitespace-nowrap` on period date ranges and entry codes, left-aligned mobile `CloseOrReopen` controls, and explicit `aria-label` attributes on reason inputs.

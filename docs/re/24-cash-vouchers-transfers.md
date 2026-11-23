# Slice 24: Official receipts, Payment vouchers & Bank transfers

Reverse engineered from lejar.ai on 2026-11-23, read-only.
- Extracted all `receipts.or.*`, `vouchers.*`, and `transfers.*` strings from Lejar's i18n chunk (`0sbs3p0t4lr74.js`) and the in-app help articles `"official-receipts"`, `"expenses"`, and `"bank-transfers"` from `0-eyswk7vufsj.js`.

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar (i18n bundle + help articles)

- **Official receipts (`/{slug}/official-receipts`):** Money received straight into cash or bank with no customer invoice behind it (e.g., walk-in cash sales).
  - Form: `Received from`, `Receipt number`, `Date`, `Deposit to` (cash/bank account), `Lines` (any active account differing from the cash account, optional description, amount > 0), live `Total`, `Notes`.
  - Posts Dr cash/bank account, Cr each line account.
  - Editing voids the original entry and posts a new entry (`"Editing this entry voids the original and posts a new one. The change is recorded in the ledger history."`).
  - Register columns: `Date`, `Receipt no.`, `Received from`, `Notes`, `Amount`, `Status` (`Recorded` / `Voided`), `Actions` (`Edit`, `Void`).
- **Payment vouchers (`/{slug}/expenses`):** Money paid straight from cash or bank with no supplier bill behind it (e.g., petrol, parking, tolls, Grab, Touch 'n Go, small on-the-spot purchases).
  - Shared voucher architecture: `Pay to`, `Voucher number`, `Date`, `Paid from` (cash/bank account), `Lines` (any active account, not only expenses), live `Total`, `Notes`.
  - Posts Dr each line account, Cr cash/bank account.
  - Editing voids the original and posts a new entry; voiding posts a reversal on the void date (or voucher date if later).
- **Bank transfers (`/{slug}/banking/transfers` and `/banking/transfers/[id]`):** Move money between two different active bank or cash accounts, with an optional bank fee.
  - Form: `From account`, `To account` (must be two different active bank/cash accounts), `Amount (MYR)`, `Transfer date`, `Reference` (optional), `Bank charges (MYR)` (optional; taken from source account and debited to Bank Charges expense account).
  - Posts 1 journal entry: Dr destination (`amount`), Dr Bank Charges (`fee`, if > 0), Cr source (`amount + fee`).
  - List columns: `Number`, `Date`, `From`, `To`, `Amount`, `Bank charges`, `Status` (`Recorded` / `Void`).
  - Detail page: `All transfers` back link, From, To, Date, Amount, Bank charges, Reference, Status, `View journal entry`, and `Void` panel (`Reason for voiding`, `Void date` — reversal dated on `max(void_date, transfer_date)`).
  - Automatically appears as one line on each account in Bank Reconciliation.

## Kira's build

- **Routes:**
  - `src/app/[org]/official-receipts/page.tsx` (`VouchersPage kind="official_receipt"`).
  - `src/app/[org]/expenses/page.tsx` (`VouchersPage kind="payment_voucher"`).
  - `src/app/[org]/banking/transfers/page.tsx` (`TransfersListPage`) and `src/app/[org]/banking/transfers/[id]/page.tsx` (`TransferDetailPage`).
  - Added `"official-receipts"`, `"expenses"`, and `"banking"` to `BUILT_PATHS` in `src/shared/shell/nav.ts` (completing 100% of Purchases and Banking sidebar groups).
- **Feature modules:**
  - `src/features/vouchers/` (`types.ts`, `load.ts`, `actions.ts`, `vouchers-client.tsx`, `vouchers-page.tsx`).
  - `src/features/transfers/` (`types.ts`, `load.ts`, `actions.ts`, `transfers-client.tsx`, `transfers-page.tsx`).
  - Updated `src/features/ledger/load.ts` (`SOURCE_LABEL`, `sourceHref`) and `src/features/books/doc-info.ts` so official receipts, payment vouchers, and transfers display properly in Ledger and Dashboard Activity Feed.
- **Database (`supabase/migrations/20261122002200_cash_vouchers_transfers.sql`):**
  - Widened `journal_entries_source_check` with `'official_receipt'`, `'payment_voucher'`, and `'transfer'`.
  - Added `cash_vouchers`, `cash_voucher_lines`, `bank_transfers` with RLS read policies.
  - Added `next_cash_doc_number` (`OR-YYYYMM-NNN`, `PV-YYYYMM-NNN`, `TRF-YYYYMM-NNN`), `record_cash_voucher` (supports both new recording and Lejar's void-original-and-repost editing), `void_cash_voucher`, `record_bank_transfer` (finds `900-0600` or any active Bank Charges expense account for fees), and `void_bank_transfer`.
  - **Assumed:** MYR-only (foreign currency transfers and WHT remittance panel are deferred since Kira is single-currency MYR).

## Verified (2026-11-23, real Supabase project, temporary user deleted afterwards)

- **Official receipts:** Recorded `OR-202611-001` (`RM450.00`, `Walk-in Customer`), edited it to `RM500.00` → confirmed `OR-202611-001` marked `Voided` (`Amended`) and `OR-202611-002` (`RM500.00`, `Recorded`) posted with linked ledger entry.
- **Payment vouchers:** Recorded 2-line voucher `PV-202611-001` (`Petronas Station`, `RM80.00` petrol + `RM15.00` parking = `RM95.00`) from Petty Cash `300-1000`.
- **Bank transfers:** Confirmed same-account transfer (`300-0900` → `300-0900`) is blocked (`"Pick two different accounts for a transfer."`); recorded `TRF-202611-001` (`RM200.00` + `RM2.00` fee) and `TRF-202611-002` (`RM50.00`); voided `TRF-202611-001` on its detail page with reversal entry link.
- **Trial Balance:** Balanced at `RM545.00` debits = `RM545.00` credits (`300-0900` `RM450.00`, `800-1500` `RM80.00`, `800-1400` `RM15.00` Dr = `600-0100` `RM500.00`, `300-1000` `RM45.00` Cr).
- **Interactive clicking/hovering browser audit:** Verified help toggles, live `Total` calculation, `"Show voided"` toggle, edit amber banner & prefilled 2 lines, row/button hover highlights, ledger entry links, and transfer detail/back navigation with 0 console errors and 0 HTTP `>= 400` responses.

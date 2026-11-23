# Slice 23: Recurring invoices & recurring bills

Reverse engineered from lejar.ai on 2026-11-23, read-only.
- Extracted all EN and BM `recurring.invoices.*` and `recurring.bills.*` strings from Lejar's i18n chunk (`0sbs3p0t4lr74.js`) and the full in-app help articles `"recurring-invoices"` and `"recurring-bills"` from `0-eyswk7vufsj.js`.
- Verified with REA (`capture_browser_scenario`, Evidence `ev_7d38ca2d07a2075a34bf201ec0468add56789fe8012e908cc8d49f99a7467e8b` / `ev_06de8c68130f1b509cc7418c8a92ae1f2c12e743cc0b50238ab760c57294105f`) that unauthenticated requests to Lejar's demo company redirect to `/login?next=...`, so page layout was assembled from Lejar's exact i18n strings, error rules, and established list/form conventions.

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar (i18n bundle + help articles)

- **Two routes:** `/{slug}/recurring-invoices` ("Recurring invoices · scheduled customer invoices") and `/{slug}/recurring-bills` ("Recurring bills · scheduled supplier bills").
- **Stats strip (3 cards):** `Active templates`, `Next run` (`None scheduled` when empty), `Generated this month` (`From the recent run ledger`).
- **Setup card (`Set up a recurring invoice / bill`):**
  - Template name* (2–120 chars), Customer / Supplier* (search or type a new name), Frequency (`Weekly`, `Monthly`, `Quarterly`, `Yearly`), Every (whole number 1–36 periods), Start date*, End date (optional, `>= start`), Occurrences limit (optional, 1–999), Due-date offset in days (0–365), Number prefix* (`Invoice/Bill number = prefix + date`), Auto-record checkbox (`Record automatically`), Lines (description, active revenue account for invoices or expense/asset account for bills, amount, tax: `No SST`, `SST 6%`, `SST 8%`, `Sales tax 5%`, `Sales tax 10%`, `Exempt`), Notes (copied onto every generated document).
  - **Prefix uniqueness rules:**
    - Recurring invoices: unique prefix per organization (`"Each recurring invoice needs its own prefix: the invoice number is the prefix plus the date, so two templates sharing one would clash on the same day."`).
    - Recurring bills: unique prefix per `(organization, supplier)`.
- **Generate due now card (`Generate due invoices / bills`):**
  - `"Generates every invoice/bill due on or before today across this organization. Re-running is safe: an occurrence already generated is never invoiced/billed twice."`
  - Result format: `"Evaluated {templates}: generated {invoices/bills}{recorded}."`
- **Templates table:** `Template`, `Customer / Supplier`, `Frequency`, `Next run`, `Amount / run`, `Recording` (`Auto-record` / `Draft`), `Status` (`Active` / `Paused` / `Completed` / `Cancelled`), `Controls` (`Pause`, `Resume`, `Cancel` with strict Active ↔ Paused → Cancelled transitions).
- **Recent runs table:** `Scheduled date`, `Template`, `Invoice / Bill` (`View invoice` / `View bill`), `Status` (`Recorded` / `Draft` / `Failed`), `Detail` (document number or failure reason).

## Kira's build

- **Routes:**
  - `src/app/[org]/recurring-invoices/page.tsx` and `src/app/[org]/recurring-bills/page.tsx` (added `"recurring-invoices"` and `"recurring-bills"` to `BUILT_PATHS` in `src/shared/shell/nav.ts`).
- **Feature files (`src/features/recurring/`):**
  - `types.ts`, `copy.ts` (full EN & BM copy from Lejar's bundle), `load.ts`, `actions.ts`, `recurring-client.tsx`, `recurring-page.tsx`.
- **Draft bill review & posting (`src/features/supplier-notes/`):**
  - Added `DraftBillControls` (`Record bill` and `Delete draft`) on `/{slug}/bills/[id]` when a bill is in `'draft'` status (so recurring bills generated with `auto_record = false` can be reviewed and recorded to the ledger).
- **Database (`supabase/migrations/20261122002100_recurring.sql`):**
  - Widened `invoice_lines_tax_code_check` to accept `'exempt'` (matching `bill_lines` and quotes/notes).
  - Added `recurring_templates` (with partial unique prefix indexes matching Lejar's per-org invoice and per-supplier bill rules), `recurring_template_lines`, and `recurring_runs` (with partial unique index on `(template_id, scheduled_on)` for succeeded runs to guarantee idempotency while allowing retries after fixing failed runs).
  - Added `recurring_next_date` (anchored to `start_date` so month-end dates do not drift), `create_recurring_template`, `set_recurring_status`, `generate_due_recurring` (reuses `save_invoice_draft` + `post_invoice` for invoices and inserts draft bills + `post_draft_bill` for bills; isolates per-occurrence errors into `'failed'` run rows), `record_draft_bill`, and `delete_draft_bill`.
  - **Assumed:** Kira generates due documents on demand via `"Generate due now"` (a daily background cron job calling `generate_due_recurring` can be scheduled later in production without schema changes).

## Verified (2026-11-23, real Supabase project, temporary user deleted afterwards)

- **Recurring invoices (`/{slug}/recurring-invoices`):**
  - Created `"Monthly retainer - Acme"` (`RET-`, monthly from `2026-10-23`, limit 2, auto-record ON, RM1,000 + SST 8% = RM1,080) and verified duplicate prefix `RET-` is refused with Lejar's exact `prefixWhy` message.
  - Created `"Quarterly maintenance"` (`MNT-`, quarterly from `2026-11-23`, auto-record OFF, RM500 Exempt).
  - `"Generate due now"` returned `"Evaluated 2 templates: generated 3 invoices, 2 recorded."` (`RET-2026-10-23` Recorded, `RET-2026-11-23` Recorded, `MNT-2026-11-23` Draft); template 1 moved to `Completed` (`2 / 2 runs`), template 2 advanced `Next run` to `2027-02-23`.
  - Re-clicking `"Generate due now"` returned `"Evaluated 0 templates: generated 0 invoices."` (idempotent).
  - Verified `Pause` → `Paused` → `Resume` → `Active` → `Cancel` → `Cancelled` and `"View invoice"` navigation to `RET-2026-10-23`.
- **Recurring bills (`/{slug}/recurring-bills`):**
  - Created `"Monthly office rent"` (`RENT-`, auto-record ON, RM3,000) and `"Cloud hosting"` (`CLD-`, auto-record OFF, RM200 + SST 8% = RM216).
  - `"Generate due now"` returned `"Evaluated 2 templates: generated 2 bills, 1 recorded."`.
  - Opened draft bill `CLD-2026-11-23` via `"View bill"`, clicked `"Record bill"`, and confirmed status moved from `Draft` to `Awaiting payment` with a posted journal entry.
- **Ledger tie-out:** Trial balance on `/{slug}/ledger` balanced at `RM5,376.00` debits = `RM5,376.00` credits (`2 × RM1,080 + RM3,000 + RM216`).
- **Interactive clicking/hovering browser audit:** Verified help box expand/collapse, live `"Total / run"` calculator (`RM100 + SST 8% = RM108.00`), `"Add line"` / `"Remove"`, row and button hover states, and `"View invoice"` / `"View bill"` navigation with zero console errors, zero HTTP `>= 400` responses, and no layout/clipping issues.

# Slice 16: SST-02 returns

Reverse engineered from lejar.ai on 2026-11-22. All views were read-only; nothing was submitted on Lejar.
- **Live pages:** opened in the signed-in debugging Chrome (`127.0.0.1:9222`, scratchpad `pw/look.js`):
  - `/{slug}/sst` and `/{slug}/settings/sst` on the user's test entity, Kira Test Sdn Bhd (no SST data).
  - `/sst` for several periods and `/sst/deemed` on Lejar's read-only demo company, Selat Coffee Roasters Sdn Bhd, which has real service-tax invoices.
- **Client strings:** `sst.deemed.*`, `dashboard.sst.*`, `pageTitle.sst`, `shared.void.taxLock` and `chat.turn.tool.get_sst_02_return`, from the i18n chunk.
- **Rules:** the in-app help article `sst` ("SST returns (SST-02)", chunk `0-eyswk7vufsj.js`) and the glossary term `sst-02`.
- **Page text:** the main `/sst` page is a server component, so its English text only appears in the rendered HTML. The Malay text is Kira's own translation.

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar

### `/{slug}/sst` (SST-02 returns)
- **Header:**
  - The title is `SST-02 returns`.
  - The subtitle reads `{legal name} · SST no. {number}`, or `· no SST number on file`, followed by `· what is SST-02?`.
  - "what is SST-02?" is a TermHint for the glossary term `sst-02`: "The Sales and Service Tax return that SST-registered Malaysian businesses file with Customs every two months…".
  - A `Learn about this page` button opens help article `sst`.
- **Layout:** a 200px left column (`PERIODS`) next to the return.
- **Period list:**
  - Unconfigured, the list shows the bookkeeping periods with uuid ids, labelled `2026-11 → 2026-12`.
  - Configured, ids are `periodId=2026-11-01_2026-12-31` and labels are `Nov-Dec 2026`.
  - The list runs newest first and covers the fiscal years in the books. The selected period is styled `bg-brand-soft text-brand-ink`.
- **Period card:**
  - Eyebrow `CURRENT PERIOD` or `PAST PERIOD`.
  - Heading `SST-02 · 2026-05-01 → 2026-06-30`.
  - The line "Filing due {date}, the last day of the month following period end (Service Tax Regulations 2018, Reg 12)."
  - Three cells: `OUTPUT TAX`, `BASIS` (a fixed sentence) and `NET SST PAYABLE` (on a brand-soft background).
- **Output tax by type and rate:**
  - One row per type and rate, e.g. `Service tax 6% | RM114,059.00 (taxable value) | RM6,843.54`.
  - A footer row `Total output tax`.
  - The empty state is "No taxed invoices, notes or payments received in this period. A nil return is still due."
- **Documents behind the figure:**
  - The explanation reads: "Service tax on a payment is the payment's share… A voided invoice or payment shows as a negative line on its void date."
  - Each row is `date | Invoice INV-… (link) | Service 6% | RM…`.
  - An invoice with two rates gets two rows.
- **Ledger reconciliation:**
  - Seen only on the demo's current period, which had a gap.
  - The text reads: "The SST output account for this period, from invoices, notes and service tax moves only (payments to Customs left out), against the return." It is followed by a `Deemed payments` link.
  - Rows:
    - `SST output account (…)`
    - `Output tax on this return`
    - A gap row, `Gap window: invoices dated from 1 Nov 2026 with service tax booked on the invoice date (1)`
- **Rules from help article `sst`:**
  - Sales tax counts in the period of the invoice date.
  - Service tax counts when paid, in proportion to each payment.
  - A deposit's share counts when the credit is applied.
  - An invoice still unpaid after 12 months counts on the day after those 12 months. A debit note has its own 12 months.
  - Invoices dated before 1 Nov 2026 keep service tax on the invoice date.
  - No input tax is deducted, and a payment to Customs does not change the return.

### `/{slug}/sst/deemed?periodId=…` (Deemed payments)
- **Header and notes:**
  - The title is `Deemed payments`, followed by the explanation from `sst.deemed.sub` and a link back to `SST-02 returns`.
  - The note `sst.deemed.laterNote` sits above a `Taxable periods` list.
  - The empty state is "No service invoice reached its 12-month date in this period."
- **Columns** (strings only; the demo had no rows): Invoice, Customer, Invoice date, Deemed paid on, Moved to SST output on, Tax moved.
- **Row states:** `Not moved yet`, `Waiting to be recorded`, `In SST output since the invoice date`.
- **Void notes:**
  - "Voided on {date}. The SST-02 return for the period of the void date takes the deemed tax back."
  - "The void takes back {amount} in this period."
- **Totals:** `Total deemed tax`, or "Total deemed tax, less the tax that voids in this period take back".
- **Unknown period:** shows `sst.deemed.notFound`.

### Settings → Tax & e-Invois → SST filing (`/{slug}/settings/sst`)
- **Header:** subtitle `SST filing periods · {entity}`, with sub-tabs `SST filing` and `e-Invois`.
- **SST-02 filing periods:**
  - Explanation, citing Sales Tax Act 2018 s.25(1) and Service Tax Act 2018 s.25(1).
  - `Filing cadence` options: `Bi-monthly (default -- most SST-02 registrants)`, `Monthly (DG-approved variation)`, `Quarterly (Low-Value Goods registrants)`.
  - `SST registration date`, with the hint "Optional. Bounds your first taxable period…".
  - A preview line: "Based on your financial year end, your SST-02 periods are: Jan-Feb 2026, …".
  - A `Save SST filing settings` button.
- **Deferred service tax account:**
  - Shows `400-1700 · Deferred SST on unpaid invoices`.
  - Notes that "Only invoices and service tax releases post to this account; a manual journal is refused."
- **Tax lock date:**
  - Explanatory text.
  - A date input whose `max` is yesterday.
  - A `Save lock date` button, disabled until the date changes.
  - Related string `shared.void.taxLock`: "{kind} is on an SST-02 return you filed (locked to {date}), so the void date must be after it."

## Built in Kira

- **Database** (migration `20261122001400_sst.sql`):
  - New `organizations` columns: `sst_cadence` (null means bookkeeping periods), `sst_registered_on` and `sst_locked_until`.
  - Journal source `sst`.
  - Table `sst_deemed_moves`, with RLS read access for members.
  - `record_deemed_sst(slug)`:
    - Moves each overdue open invoice's unreleased service tax with Dr 400-1700 / Cr 400-1300.
    - Posts on the legal day, or on today when that day is closed or locked.
  - `void_invoice` now also takes back deemed tax: Dr 400-1300 / Cr 400-1700.
  - Trigger `guard_sst_lines` on `journal_lines` rejects two cases:
    - Any line to 400-1700 that does not come from an invoice, receipt, void or deemed move (`deferred_sst_account`).
    - Invoice, receipt, void or deemed lines on 400-1300 or 400-1700 dated on or before the tax lock (`tax_locked`).
  - Owner-only functions `set_sst_filing` and `set_sst_lock`.
- **Code** (`src/features/sst/`):
  - `periods.ts`: cadence periods anchored on the financial year end, the bookkeeping fallback, the filing due date and the settings preview.
  - `load.ts`: the return (sales, payment-basis service, deemed, voids), the ledger reconciliation and the deemed list.
  - Pages: `sst-page.tsx`, `deemed-page.tsx`, `settings-page.tsx` and `settings-form.tsx`, plus `actions.ts`.
  - Routes `/[org]/sst`, `/[org]/sst/deemed` and `/[org]/settings/sst`.
  - `settings/settings-header.tsx` is now shared by Profile and SST filing.
- **Ask Kira:** new tool `get_sst_02_return` (Lejar's name), using `Books.sst02Return`.
- **Sidebar:** SST is marked built.

## Where Kira differs (Assumed)
- **Service tax basis:** Kira uses the payment basis for every date. Lejar's "before 1 Nov 2026 stays on the invoice date" is Lejar's own switch-over date. Kira's books have posted service tax to Deferred SST from the start, so the return and ledger always agree, and there is no "gap window" row.
- **Missing documents:** Kira has no credit or debit notes, deposits or customer credit yet. Those lines, and "notes" in the copy, are left out.
- **Recording deemed moves:** Lejar records them in the background. Kira records them when an owner, admin or member opens `/sst` or `/sst/deemed`. Viewers see a `Deemed payments waiting to be recorded (n)` row in the reconciliation instead.
- **Ledger reconciliation:** always shown, so the Deemed payments link always has a home. A `Difference` row appears only when the account and the return disagree.
- **Period ids and labels:**
  - Both modes use `start_end` ids.
  - Kira adds an `Upcoming period` eyebrow for future periods and a `Locked to {date}.` note on locked periods.
  - Lejar's `Learn about this page` button is not built, because Kira has no help articles yet.
- **Payment rows:** labelled `Payment received · INV-…` and link to the invoice, since receipts have no detail page.
- **Void rows:** labelled `Void · …`, shown negative on the void date.
- **Negative totals:** the net figure can go negative when a deemed payment is voided in a later period. That is the amount the period takes back.
- **Tax lock date limit:** the database accepts today at the latest, while the date input caps it at yesterday, as Lejar's does.

## Verified (2026-11-22)
- **End-to-end test** (`pw/e2e16.js`, temporary @example.com user, books from 2020):
  - Unconfigured periods and the nil return show.
  - Settings preview, including the monthly preview, and save work.
  - **Invoice A:** 6% service tax, dated 2025-10-01, unpaid. It is deemed paid on 2026-10-02 and appears in Sep-Oct 2026 as RM60.
  - **Invoice B:** RM540 with 8% service tax. A RM270 part payment releases RM20 on a RM250 taxable value.
  - **Invoice C:** 10% sales tax, giving RM20.
  - Nov-Dec 2026 totals RM40, and the reconciliation matches.
  - Voiding A on 2026-11-15 adds a -RM60 line to Nov-Dec, and the deemed page shows the void note.
  - A bad `periodId` shows the not-found message.
  - With the tax lock at 2026-10-31, an invoice dated 2026-10-20 is refused with the tax-lock message, and the period shows `Locked to`.
  - The trial balance balances: 400-1300 is RM40 and 400-1700 is RM20, B's unpaid share.
- **Direct SQL checks:**
  - A manual line to 400-1700 is refused.
  - A manual payment to Customs on 400-1300 inside the lock is allowed.
  - A receipt line inside the lock is refused; one after the lock is allowed.
- **Regressions:**
  - The payments test (`e2e12`) passes: receipts, payments and voiding a receipt.
  - The invoices test (`e2e7`) passes: record, then void.
  - Both stopped at their final upload step only because the test file was not supplied.
- Typecheck, lint and build are clean.

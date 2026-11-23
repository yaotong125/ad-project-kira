# Slice 18: Credit, debit and refund notes (sales)

Reverse engineered from lejar.ai on 2026-11-23. Everything was viewed read-only; no note was created on Lejar.
- **Pages viewed:**
  - `/{slug}/notes` (list and "Issue a note" panel) on the user's test entity, Kira Test Sdn Bhd.
  - On Lejar's read-only demo company (Selat Coffee Roasters):
    - the list;
    - the three note details (CN-2026-001, DN-2026-001, RN-2026-001);
    - the invoice INV-2026-002 that carries a credit note;
    - `/notes/new?invoiceId=…&kind=credit|refund`.
- **Text strings:** every `notes.*` string, English and Malay, from Lejar's text bundle. They are generated into `src/features/notes/copy-data.ts` with "Lejar" replaced by "Kira".
- **Help article:** `credit-notes`, which covers the supplier side; the customer side lives on the invoice.

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar

**List page (`/notes`):**
- **Header:**
  - Title: `Credit / debit notes`.
  - Subtitle: `{org} · credit / debit / refund notes · {n} notes`.
  - A `New note` button opens an `Issue a note` panel with a `Close` button.
  - The panel asks for `Original invoice` (search) and `Kind`, then `Continue`.
  - With no recorded invoices, the panel says "A note can only be issued against a recorded invoice".
- **Table columns:** Kind, Number (link), Date, Invoice (link), Status (`Recorded`), MyInvois (`Not submitted`), Total.
- **Empty state:** "No notes yet / Issue your first credit, debit, or refund note above."

**New note form (`/notes/new?invoiceId=&kind=`):**
- **Top:**
  - A `Back to invoice {n}` link.
  - Title `Issue a note`, subtitle `Against invoice {n}`.
  - `Creditable balance: RM…`. On the demo this was the invoice total minus the earlier credit note, even though the invoice was fully paid.
- **Fields:**
  - Kind select.
  - Note number, read-only, `CN-202611-001`, with "Assigned when saved. Use my own number".
  - Note date (required).
  - Reason (required, placeholder "Why this note is being issued").
  - For refund notes, the bank account (hint "The money-out leg").
- **Lines:** each line has a price-book item or Freehand, a description, an account (default `600-0000 · Revenue`), qty, amount and tax.
  - Tax options: No SST, SST 6%, SST 8%, Sales tax 5%, Sales tax 10%, Exempt.
  - `Add line`, `Remove`, then `Save note`.
- **Lifecycle:** the note is saved as a draft. Recording it ("Record note") posts the journal entry and locks the lines.

**Note detail:**
- **Header and summary:**
  - `Back to notes`, title `{Kind} {number}` with a `Recorded` chip, and `Against invoice {n}`.
  - A card showing Note date, Currency, Total and Reason, plus `Bank account (money-out)` for refunds, and Journal entry `View entry`.
- **Lines table:** #, Description, Account, Tax, Amount, Tax.
- **MyInvois box:** `Ledger only`, with an explanation.
- **Void panel:** "Voiding reverses this note on the void date and keeps the record. A void note stays void."
- **The demo's three notes:**

  | Note | Line | Tax | Amount | Tax amount | Total |
  |---|---|---|---|---|---|
  | Credit note | Credit: House filter blend - quality adjustment | SST 6% | 300.00 | 18.00 | 318 |
  | Debit note | Debit: Additional espresso-machine servicing time | SST 8% | 250.00 | 20.00 | 270 |
  | Refund note | Refund: overpayment on January order | SST 6% | 200.00 | 12.00 | 212 (paid from a bank account) |

**Invoice detail:**
- A `Credited` chip next to the status.
- `Customer credit RM318.00` when the invoice was already paid. Lejar turns a credit note on a paid invoice into customer credit.
- A `Credit / debit / refund notes` table, with links `Issue credit note`, `Issue debit note` and `Issue refund note`.

**SST (help article `sst`):** a debit note has its own 12 months for deemed payment, and a void or credit note dated in a later period counts in that period's SST-02 return.

## Built in Kira

**Migration `20261122001600_sales_notes.sql`:**
- **Tables:** `sales_notes` and `sales_note_lines`.
- **New invoice columns:** `notes_credit`, `notes_debit`, `notes_refund`, `service_adjust`, and a generated `amount_due` (total + debit notes − credit notes − paid).
- **Functions:**
  - `save_sales_note`: drafts.
  - `record_sales_note`, which posts:

    | Kind | Debit | Credit |
    |---|---|---|
    | Credit note | Line accounts and tax | The invoice's receivable account |
    | Debit note | The receivable account | Line accounts, sales tax to 400-1300, service tax to deferred 400-1700 |
    | Refund note | Line accounts and tax | The bank account |

    Service tax that a credit or refund note takes back comes out of 400-1700 while the invoice's service tax is still deferred, and out of 400-1300 for the part already released. That released part is what reduces the SST-02 return.
  - `void_sales_note`: a draft simply becomes void; a recorded note is reversed on its void date. A debit note that has been paid cannot be voided.
  - `check_note_limits`: Lejar's creditable balance, plus Kira's limits:
    - Credit note: no more than the amount still owed.
    - Refund note: no more than was paid and not yet refunded.
- **Updated functions:**
  - `record_receipt_core` works from `amount_due` and the service tax after notes. `refresh_invoice_status` sets paid or open.
  - `void_receipt` refuses when a refund depends on the receipt.
  - `void_invoice` refuses invoices that carry notes.
  - `record_deemed_sst` counts the service tax after notes.
  - The `guard_sst_lines` checks (tax lock, Deferred SST account) also apply to notes.
  - The `ledger_tie_out` AR subledger includes notes.

**App:**
- **Notes pages:** `src/features/notes/*` (list with picker, form, detail with Record and Void), with routes `/notes`, `/notes/new` and `/notes/[id]`.
- **Invoice detail:** a notes section, a `Credited` chip, and "owed" now comes from `amount_due`.
- **Balances:** "amount due" in the invoices list, dashboard, payments received and bank import now includes notes.
- **SST-02 return:**
  - Credit and refund notes count negative and debit notes positive, on the note date (sales tax, and released service tax).
  - Voided notes reverse on their void date.
  - Rows link to the note.
- **Ledger:** source labels `Credit / debit note` and `Deemed SST`.

## Where Kira differs (Assumed)
- **No customer credit yet:** a credit note can only take what is still owed. For money already received, the error points to a refund note instead.
- **No price book:** lines are freehand. Amounts are before tax.
- **MyInvois:** every note is `Ledger only` and `Not submitted`, because e-Invois is not built.
- **Debit notes and deemed payment:**
  - A debit note's service tax joins the invoice's deferred tax and the invoice's own 12-month deemed date.
  - Lejar gives a debit note its own 12 months; Kira does not yet.
  - Its released share on payment is split by the invoice's own rates.
- **Void panel:** Kira asks for a reason and a void date. Lejar's "Void on today instead" shortcut is not built.

## Verified (2026-11-23)
- **End-to-end test** (`pw/e2e18.js`, temporary @example.com user). Invoice A was RM1,000 + 8% service tax; invoice B was RM200 + 10% sales tax.
  - **Empty states:** the empty list and the picker's "no recorded invoices" message showed.
  - **Credit note on A:** "Issue credit note" from invoice A opened the form with a creditable balance of RM1,080. CN RM100 + 8 was saved then recorded. A then showed `Open · Credited`, with RM972 owed.
  - **Receipt on A:** the receipt amount pre-filled RM972. Once recorded, the invoice was paid.
  - **Second credit note on A:** refused with the "no customer credit yet" message.
  - **Refund note on A:** RN RM50 + 4 paid out of 300-0900.
  - **Debit note on B:** DN RM50 + 5 sales tax took B's balance owed to RM275.
  - **Return before the void:** the SST-02 return showed RM93 (20 + 5 + 72 − 4), and the reconciliation matched.
  - **Voiding the debit note:**
    - Without a reason it was refused.
    - With a reason on 2026-11-20, B went back to RM220.
    - The return became RM88, with the void line at −5.
    - Service tax 8% showed a value of RM850 and tax of RM68.
  - **Final state:**
    - The list showed RN Recorded, DN Void and CN Recorded.
    - The trial balance balanced: AR 220, bank 918, 400-1300 88, revenue 1,050, and 400-1700 at 0.
- **Direct SQL check:** the AR tie-out difference was 0 on 2026-11-04, 2026-11-11 and 2026-11-30. Invoice A ended with service tax 68, all released, and amount due 0.
- **Regressions:**
  - SST (`e2e16`) produced the same figures.
  - Payments (`e2e12`) produced the same results up to its CSV upload step, which needs a file argument.
- Typecheck, lint and build are clean.

# Slice 19: Customer credit and deposits

Reverse engineered from lejar.ai on 2026-11-23. No credit was created on Lejar; the evidence is Lejar's text strings (English and Malay) plus what the demo company showed:
- **Receipt form:** `receipts.form.extraCredit`, `extraCreditFor`, `creditKept`, `applyCredit`, `keepCredit`, `sstNote`, `statement`.
- **Receipt errors:** `receipts.error.nameCustomer`.
- **Prepayment on a customer:** `contacts.prepay.*`.
- **Invoice page:** `invoices.detail.customerCredit`, `applyCredit`, `creditApplied(.on)`, `applied`, `undone`.
- **Help article `sst`:** "A deposit carries no SST: its share counts when you apply the credit to an invoice."
- **Demo invoice INV-2026-002:** paid in full, with a credit note shown as `Customer credit RM318.00` (slice 18).

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar (from the strings)
- **Receipt overpayment:**
  - Typing more than an invoice owes shows "MYR {amount} is more than the invoice owes. Lejar keeps it as customer credit for {name}. You can apply it to another invoice after you save."
  - If the invoices belong to several customers, it says Lejar "cannot tell whose credit it is".
  - After saving, it shows "Receipt recorded. MYR {amount} … kept it as customer credit", with buttons `Apply MYR {amount} to {number}` and `Keep as credit`.
- **Receipt with no invoice:** from a bank-statement line, "record it with no invoice to keep it as customer credit". It must name the customer (`nameCustomer`).
- **Prepayment on the customer** (`contacts.prepay.*`):
  - A `Receive a prepayment` button opens a form with Date, Received into, Amount (MYR) and Reference (Optional).
  - The form notes that Lejar "posts no SST and sends no e-invoice for a deposit".
  - The submit button is `Record prepayment`, and the done message is "Prepayment recorded and kept as customer credit."
- **Invoice page:**
  - A `Customer credit` amount, and `Apply credit ({amount} available)`.
  - Applications appear as `Customer credit applied {date}` with status `applied` or `undone`.
- **SST:** nothing counts when credit is kept. The service tax share counts when the credit is applied to an invoice.

## Built in Kira

**Migration `20261122001700_customer_credit.sql`:**
- **Where the credit sits:** 400-1600 Customer Deposits (Assumed: Lejar's account was not observed).
- **Tracking:**
  - `customer_credit_moves` records each change: `receipt` / `note` add credit, `apply` uses it. Each move is `active`, `undone` or `void`.
  - `customer_credit_balance()` is the sum of active moves.
- **Receipts:**
  - New columns `receipts.contact_id` and `credit_amount`.
  - `record_receipt_core` keeps anything above what an invoice owes, plus `creditAmount` paid in with no invoice (prepayment), as credit: Cr 400-1600, with no SST.
  - Credit needs a customer; without one it raises `name_customer`.
  - `void_receipt` refuses with `credit_used` when the credit has already been spent.
- **Invoices:**
  - New columns `credit_applied` and `notes_credit_excess`.
  - `amount_due` = total + debit notes − credit notes + excess kept as credit − paid − credit applied.
- **Applying and undoing:**
  - `apply_customer_credit` posts Dr 400-1600, Cr the receivable account, and releases the invoice's service-tax share like a payment (shared `service_release_for`). The journal source is `credit`.
  - `undo_credit_application` reverses the application on the given date and gives the credit back.
- **Credit notes:**
  - A credit note bigger than what is still owed puts the rest into customer credit (Cr 400-1600), as Lejar does. The `credit_exceeds_due` limit from slice 18 is gone.
  - Voiding a note whose credit has been spent raises `credit_used`.
  - The refund limit now counts credit applied.
- **Other updated functions:**
  - `void_invoice` also refuses an invoice that has credit applied.
  - `guard_sst_lines` treats `credit` as an SST source.
  - `ledger_tie_out` nets credit applied, and the part of a credit note that went to 400-1600, out of what invoices owe.

**App:**
- **Receipt form (`src/features/payments`):**
  - Overpaying an invoice is allowed and shows the `extraCreditFor` hint plus the SST note.
  - After saving, the list shows `creditKept`, and the receipt row shows "Customer credit RM…".
- **Contact page** (customers only; `src/features/credit/*`): a Customer credit panel with the balance, the history (receipt / prepayment / credit note / applied / undone) and `Receive a prepayment`.
- **Invoice page:** `Apply credit (RM… available)` applies as much as both sides allow, dated today. Each `Customer credit applied {date}` line has an `Undo`.
- **SST-02:** credit applications count their service-tax share on the application date, and undos reverse on the undo date.
- **Ledger:** source label `Customer credit`.

## Where Kira differs (Assumed)
- **Account:** customer credit sits in 400-1600 Customer Deposits rather than as a credit balance in receivables.
- **Applying credit:** "Apply credit" always applies the most it can, dated today. Kira has no amount or date picker, and no post-save `Apply MYR … to …` prompt yet; the credit stays on the contact until applied from an invoice.
- **No cash refund of credit yet:** a refund note only refunds against an invoice's payments.
- **No customer statement of account yet.**

## Verified (2026-11-23)
- **End-to-end test** (`pw/e2e19.js`, temporary @example.com user):
  - **Receipt overpayment:** invoice A was RM500 + 8% = RM540. A receipt of RM600 showed the extra-credit hint. Afterwards the list showed "MYR 60.00 … kept it as customer credit", and the receipt row showed "Customer credit RM60.00".
  - **Prepayment:** the contact page showed RM60. A RM200 prepayment (DEP-001) took it to RM260.
  - **Apply and undo:** invoice B was RM1,000 + 6% = RM1,060.
    - `Apply credit (RM260.00 available)` brought B's balance owed to RM800.
    - Undo returned it to RM1,060 (the line shows `undone`), and applying again brought it back to RM800.
  - **Credit note on paid A:** RM100 + 8 became RM108 of customer credit. The contact's balance was RM108, with the full history.
  - **SST-02 return:** RM46.72 = 40 − 8 + 14.72 − 14.72 + 14.72, and it matches the ledger.
  - **Trial balance:** AR 800, bank 800, 400-1300 46.72, 400-1600 108, 400-1700 45.28, revenue 1,400. It balances.
- **Direct SQL check:** the AR tie-out difference was 0 on 2026-11-06, 2026-11-21 and 2026-11-30.
- **Regressions:**
  - Notes (`e2e18`) gave the same figures. A credit note on a paid invoice is now saved instead of refused, which is the intended change.
  - SST (`e2e16`) was unchanged.
- Typecheck, lint and build are clean.

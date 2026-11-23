# Slice 12: Payments received and payments made

Reverse engineered from lejar.ai on 2026-11-22, read-only.
- `/payments-received` and `/payments-made` with `?new=1` on the user's test entity, which has no open invoices or bills, so the forms showed only their empty states.
- The chunks `1hl7z1604qdt4` (recordReceiptAction, editReceiptAction), `3p44g4fs486ds` (recordPaymentAction, slip upload) and `1zdueibw-4tbz` (voidReceiptAction, credit and refund actions), plus the 242 `receipts.*` / `payments.*` strings.

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar

- **Payments received:**
  - "money received from customers · n receipts", "Record a receipt".
  - With no open invoices: "No open invoices to receive against.", plus "Raise an invoice".
  - Form: Received into (a cash or bank account), Receipt date, Reference ("cheque / transfer ref"), "Allocate to invoices" with "{amount} due" and an amount per invoice, "Bank charges (RM) · Optional fee the bank deducted", Record receipt.
  - Rules: "A receipt for one customer cannot settle another customer's invoice." Extra money can stay as customer credit.
- **Payments made:**
  - "money paid to suppliers", "Scan a payment slip".
  - Form: "Paid by an owner or staff member personally" with an owner account ("Recorded as the owner's capital… / What the company now owes them"), Paid from, Payment date, Reference, "Allocate to bills", "RM {amount} short…", Bank charges, Record payment.
- **Lists:** tabs All / Recorded / Void, "Do not display voided transactions". Columns: Date, Customer/Supplier, Reference, Bank, Status, Original, Actions. Void takes a reason and date.
- **Bank import ties in:** "Record as receipt against {number}" / "Record as payment against {number}" (settleStatementLineAction).
- **Not built in Kira yet:** foreign currency, customer credit and deposits, refunds, WHT remittance, payment slip scanning, editing receipts and payments, official receipts (OR).

## Kira's build

- **Migrations `20261122001000_payments.sql` and `…1010`:**
  - Tables `receipts` + `receipt_allocations` and `payments` + `payment_allocations`; `invoices.paid_amount` / `sst_released` and `bills.paid_amount`. Invoices and bills turn **paid** when fully settled and back to open when a receipt or payment is voided.
  - **Receipt posting:** Dr bank (received − charges), Dr 900-0600 Bank Charges, Cr each invoice's receivable account.
  - **SST on receipts:** the invoice's service tax moves from 400-1700 Deferred SST to 400-1300 SST Output Tax in proportion to the amount paid (all of what's left once the invoice is paid). This is inferred: service tax is due when payment is received.
  - **Payment posting:** Dr each bill's payable, Dr bank charges, Cr the bank, or the owner's equity or liability account when paid personally.
  - **Voids:** reverse the entry on the void date.
  - **Settling a statement line:** `settle_statement_line` records the receipt or payment for a bank import line and marks the line recorded, which clears it for reconciliation.
  - **Guards:** one customer per receipt (a trigger); recorded invoices with receipts cannot be voided ("Void the receipt first").
- **`src/features/payments/`:** `SettleForm` (one form for both sides), the void button, the shared list page, and actions.
- **Routes:** `/payments-received` (`?invoice=` pre-fills) and `/payments-made` (`?bill=`).
- **Other pages:**
  - Invoice page: "Record payment" and a Receipts table.
  - Invoices and Bills lists: outstanding net of payments; the Bills list adds Owed and **Pay** columns.
  - Bank import: settle buttons when a line equals what an open invoice or bill still owes.

## Verified (2026-11-22, real Supabase project, temporary user deleted afterwards)

- **Invoices:** INV-001 RM1,080 (SST 8%) and INV-002 RM500 recorded.
- **Receipt:**
  - "Record payment" on INV-001 pre-filled RM1,080. I added RM200 to INV-002 and RM2 bank charges; the summary read "Into bank RM1,278.00".
  - INV-001 turned Paid, and outstanding was RM300.
- **Bills:** RM300 paid from the bank with RM1 charges ("Out of bank RM301.00"), and RM120 paid personally by an owner (Amount Due to Directors). Both bills turned Paid.
- **Voiding the receipt:** both invoices were open again; receivables RM1,080; deferred SST RM80; SST output RM0.
- **Bank import:** an IN line of 500 offered "Record as receipt against INV-202611-002", which recorded and reconciled it, and INV-002 turned Paid.
- **Ledger:** balanced (5,641 = 5,641). Bank RM199, payables 0, owed to directors RM120.

# Slice 22: Supplier credit and debit notes, and the bill page

Reverse engineered from lejar.ai on 2026-11-23, read-only. No note was created on Lejar.

**Sources:**
- **Notes list:** `/bills/notes` on Lejar's demo company and on the user's test entity. Both were empty.
- **Bill page:** demo bill RB-MAINT-2026-11-19. It has a "Supplier credit / debit notes" section with the links `Record supplier credit note` and `Record supplier debit note`.
- **Note form:** `/bills/notes/new?billId=…&kind=credit` on the demo bill.
- **Strings:** all `supplierNotes.*` and `bills.detail.*` strings, in English and Malay. They are generated into `src/features/supplier-notes/copy-data.ts`, with "Lejar" changed to "Kira".
- **Help article:** `credit-notes`.

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar

**Notes list:**
- Title: `Supplier credit / debit notes`. Subtitle: `{org} · {n} notes`.
- Empty state: "When a supplier sends you a credit or debit note, open the bill it refers to and record it there."

**Bill page:**
- Status chip (`awaiting_payment`) and the supplier.
- Summary fields: Bill date, Due date, Currency, Total (MYR base), Paid, Outstanding, Journal entry.
- Notes, then a lines table.
- The supplier-notes section with its two links.
- Payments: "No payments recorded against this bill."
- Edit and Void.
- Attachments and History.
- `bills.detail.overCredit`: "Credit notes exceed this bill by {amount}…"

**Note form:**
- Header: `Back to bill {n}`, `Record a supplier credit note`, `Against bill {n}`, `Creditable balance: RM1,026.00` (the bill total).
- Kind: `Credit note (reduces what you owe)` / `Debit note (increases what you owe)`.
- Note number: `SCN-202611-001`, with "Assigned when saved." and "Use my own number".
- Note date (required) and Reason (required).
- Lines: description, account (default `700-0000 · Cost of Sales`), qty 1, amount, tax (`No tax`, …, Exempt).
- `Save note` button.

**Note detail strings:**
- Record panel: "Recording generates the journal entry and locks the note's lines. Once recorded, the note reduces / increases what you owe on this bill."
- Void panel: "Voiding this note records a reversal on the void date, so the bill goes back to what it was before the note from that date on. Earlier months stay as they are."

**Help article:**
- Use the same account and the same SST tax code as the original bill line.
- A credit note cannot be larger than the bill it is against.
- SST on a supplier bill is part of the cost.
- Cash back from a supplier is recorded separately as a receipt.

## Built in Kira

**Migration `20261122002000_supplier_notes.sql`:**
- **New columns on `bills`:** `notes_credit`, `notes_debit`, `voided_on`, `void_reason`, `void_entry_id`, and a generated `amount_due` (total + debit notes − credit notes − paid).
- **New tables:** `supplier_notes` and `supplier_note_lines`.
- **Note numbers:** `next_supplier_note_number` gives `SCN-` / `SDN-YYYYMM-NNN`.
- **`save_supplier_note`:** saves drafts. A credit note may not exceed the creditable balance (total + debit notes − credit notes). The error is `exceeds`.
- **`record_supplier_note`:** mirrors the bill's own posting.
  - Credit note: Dr the bill's payable account; Cr each line account and the SST to 400-1400, which is where `record_bill` put it.
  - Debit note: the reverse.
- **`void_supplier_note`:** a draft just closes. A recorded note gets a reversal on the void date. A debit note that is already paid cannot be voided.
- **`void_bill`:** Lejar's bill Void, for an open bill with no payments and no notes. It reverses on the void date.
- **`record_payment_core` / `void_payment`:** now work against `amount_due`. The bill status follows what is owed (`refresh_bill_status`).
- **`ledger_tie_out`:** the payables (AP) side now counts supplier notes, and drops voided bills from their void date.

**App:**
- **Pages:** `src/features/supplier-notes/*` provides the bill page `/bills/[id]`, the notes list `/bills/notes`, the form `/bills/notes/new`, and note detail `/bills/notes/[id]` with Record and Void.
- **Bills list:** bill numbers now link to the bill page. "Owed" uses `amount_due` everywhere: bills list, dashboard, payments made, bank import.
- **Ledger:** shows the note number and the bill for supplier note entries.

## Where Kira differs (Assumed)
- **Note lines:** each line starts with the bill's first line's account and tax code.
- **Debit note numbers:** `SDN-…`. Only the credit note prefix `SCN-` was seen on Lejar.
- **Not built yet:**
  - Lejar's AI Inbox route for supplier notes ("Which bill is this supplier credit note against?").
  - Bill edit, attachments, and history on the bill page.
- **Bill page labels:** the status shows as `Awaiting payment` / `Paid` / `Void`, using Lejar's `status.*` labels, instead of Lejar's raw `awaiting_payment`.

## Verified (2026-11-23)

End-to-end test `pw/e2e22.js` (temporary @example.com user):
- **Empty list:** the notes list showed Lejar's empty text.
- **Bill A** (RM1,000 + SST 8% = RM1,080):
  - The bill page showed `Awaiting payment`, Paid RM0, Outstanding RM1,080, the View entry link, and both note links.
- **Note form:** opened with a creditable balance of RM1,080.
- **Over-credit:** a RM2,000 credit note was refused with "Note total exceeds the creditable balance of RM1,080.00…".
- **Credit note** SCN-202611-001 (RM100 + 8):
  - Recorded on 700-0000 with SST 8%.
  - The bill then showed Outstanding RM972 and listed the note.
- **Payment:** pre-filled RM972; after it, the bill was `Paid` with RM0 outstanding.
- **Debit note** SDN-202611-001 (RM50):
  - Put the bill back to `Awaiting payment` with RM50 outstanding.
  - Voiding it with a reason returned the bill to `Paid` / RM0.
- **Bill B:** voided with a reason, showing `Void · Voided on 2026-11-23: Duplicate bill`.
- **Trial balance:** bank −972, SST Input Tax 72, Cost of Sales 900. Balanced, with AP at zero.
- **Direct SQL check:** the AP tie-out difference for 400-0100 was 0.
- **Regression:** the payments test (`e2e12`) gave the same results up to its CSV upload step.

Typecheck, lint and build are clean.

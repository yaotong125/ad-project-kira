# Slice 7: Sales invoices (`/{slug}/invoices`)

Reverse engineered from lejar.ai on 2026-11-22, read-only, on the user's test entity Kira Test Sdn Bhd. No invoice was created on Lejar.

Sources:
- HTML and screenshots of `/invoices` and `?new=1`;
- the form chunk `0cr-ss80p7flu` (createInvoiceAction, updateInvoiceAction, peekInvoiceNumberAction);
- the line-maths module 779754;
- the i18n bundle: 276 `invoices.*` / `shared.pricingMode.*` / `learn.result.*` strings.

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar

- **Page:**
  - Header: "{entity} · accounts receivable · n invoices".
  - Stat cards: Outstanding / Overdue / Current.
  - "Raise an invoice", open on its own while there are no invoices. Otherwise there are "Upload to AI Inbox" and "New invoice" buttons.
  - Tabs: All / Drafts / Open / Paid / Void, with counts.
  - Search: "Find an invoice — number or customer…" and "Do not display voided transactions".
  - Empty state: "No invoices yet", with "Add a customer".
- **Form:**
  - Customer combobox (type a new name to add one) and number `INV-YYYYMM-NNN` ("Assigned when saved. Use my own number").
  - 14 currencies, invoice date, due date (30d/60d/90d, seeded from the customer's terms) and "Split into instalments".
  - Prices: Exclude SST / Include SST.
  - Line columns: description, revenue account (default `600-0000 Revenue`), qty, unit price, Discount %, Discount RM, New price, Tax, plus a per-line LHDN e-Invoice classification (45 codes, "Default (org setting)").
  - Notes, "Save draft", "Save & record".
- **Tour markers:** `data-flow` invoice-customer / invoice-lines / pricing-mode / invoice-actions.
- **Maths (module 779754):**
  - The three discount fields keep each other in step. The discounted unit price is the price × (100 − %) / 100, rounded half up to the sen; the % must be above 0 and below 100.
  - The line amount is qty × discounted price.
  - Exclusive pricing: tax = amount × rate / 100.
  - Inclusive pricing: tax = amount × rate / (100 + rate).
  - SST 8% applies from 2024-03-01; earlier dates fall back to 6%.
- **Detail page (texts only):**
  - "Invoice {number}", Download PDF, Edit, Record invoice, Delete (drafts only), Void (reason and date; it reverses the entry and can be un-voided).
  - Not built in Kira yet: Record payment, Apply credit, credit/debit/refund notes, MyInvois, attachments, history, and bulk ZIP/merged PDF.
- **Learn section 3:** "Lejar recorded this invoice and its journal entry", so it checks on **record**, not on draft.

## Kira's build

- **Migration `20261122000600_invoices.sql`:**
  - Tables: `invoices` and `invoice_lines`.
  - Functions: `save_invoice` (draft or record), `record_invoice`, `delete_invoice_draft`, `void_invoice`. Numbering extends `next_doc_number('INV')`.
  - **Posting:**
    - Dr receivables: 300-0200 Trade, or 300-0400 Other for a non-trade customer.
    - Cr each line's revenue account.
    - Cr **400-1700 Deferred SST on unpaid invoices** for service tax and 400-1300 SST Output Tax for sales tax (inferred from Lejar's chart: service tax is due when paid).
  - **Void:** a reversal entry on the void date.
- **`src/features/invoices/`:**
  - The form, with the three-way discount fields and live totals (`math.ts` uses the same rounding as SQL).
  - Detail actions and the server loader.
  - 182 strings and the 45 classification codes.
- **Pages:**
  - `src/app/[org]/invoices`: list, form, AI Inbox drafts via `?aiDraft=`.
  - `[id]`: detail, and draft edit via `?edit=1`.
  - `[id]/pdf`: an A4 PDF built with `pdf-lib`.
- **Learn:** section 3 checks on recording. The tour's 3 steps point at the form.

### Assumed / left out

- **Kira's own design:** the detail page layout and the PDF design. Lejar's were not observed, because that needs an invoice on the real account.
- **Edits:** recorded invoices can't be edited yet; Lejar reverses and re-posts. They can be voided; un-void comes later.
- **Not in this slice:** MYR only (no multi-currency), no price book, instalments, exemption details or emailing invoices.
- **The org's e-Invoice default classification:** blank for now (Settings / e-Invois slice).
- **AI Inbox:** recording a drafted sales invoice also marks that inbox document recorded. As with bills, that checks Learn section 1.

## Verified (2026-11-22, real Supabase project, fake Claude endpoint, temporary user deleted afterwards)

- **Tour:** Learn → Start section 3 opened `/invoices?new=1` with "RAISE YOUR FIRST INVOICE · 1 OF 3".
- **Discounts:** a 10% discount on 500.00 → new price 450.00, RM off 50.00.
- **Totals:** 2 × 450 at SST 8% + 200 → Subtotal 1,100.00, SST 72.00, Total 1,172.00.
- **Draft, PDF, record:** saved as a draft ("Invoice INV-202611-001 created."), the PDF downloaded (200, application/pdf), and **Record invoice** made it Open.
- **Inclusive and void:** an inclusive 108.00 at 8% gave 100.00 + 8.00 included. It was recorded, then voided; "A reason is required to void an invoice." showed first.
- **Refusals and delete:** a duplicate own number was refused with Lejar's message. A draft was deleted.
- **AI Inbox:** a "Sales invoice 88%" draft opened in the invoice form pre-filled (INV-OLD-77, customer) and was recorded.
- **List:** voided invoices are hidden by default, and the search "OLD" found INV-OLD-77.
- **Learn:** section 3 was checked.
- **Ledger:** balanced (Dr 1,706.00 = Cr 1,706.00), and the void reversed its entry exactly.
- **Bug found and fixed:** a server page called a client-only helper (React #441).

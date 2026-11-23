# Slice 20: Quotes

Reverse engineered from lejar.ai on 2026-11-23, read-only. No quote was created on Lejar.

Sources:
- **Pages viewed:**
  - Lejar demo company (Selat Coffee Roasters): `/quotes` (10 quotes), plus the quote pages for:
    - QUO-2026-007 (Draft)
    - QUO-2026-010 (Converted)
    - QUO-2026-009 (Expired)
    - QUO-2026-005 (Declined)
  - User's test entity: the `/quotes?new=1` form.
- **Strings:** all `quotes.*` and the `status.*` labels, in English and Malay. They are generated into `src/features/quotes/copy-data.ts`, with "Lejar" changed to "Kira".
- **Help article `quotes`:** "Quotes: pre-sales offers".

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar

### List page
- **Header:** `Quotes`, with the subtitle `{org} · pre-sales pipeline · {n} quotes`. "pre-sales pipeline" is a hover term. There is also a `Learn about this page` link.
- **New quote:** a `New quote` button opens a `Draft a quote` panel with a `Close` button.
- **Tabs:** All, Drafts, Open, Closed, Converted, each with a count.
  - The demo showed All 9 of 10 quotes, and Closed 4 (3 expired + 1 declined), so voided quotes are not counted.
- **Filter:** a checkbox, `Do not display voided transactions`.
- **Columns:** Quote no., Customer (with initials avatar), Quote date, Expires, Status, Original (`–` for MYR), MYR base.
- **Empty state:** "No quotes yet / Draft your first customer quote with the form above.", plus `Add a customer`.

### Quote form
- **Customer:** "Search by name, TIN, or phone. Type a new name to add a customer."
- **Quote number:** `QUO-202611-001`, with "Assigned when saved." and a `Use my own number` link.
- **Currency:** MYR and 13 others.
- **Quote date (required)** and **Expiry (optional)**.
- **Split into instalments:** a checkbox.
- **Lines:** description, account (default `600-0000 · Revenue`), amount, and tax (No SST, SST 6/8%, Sales tax 5/10%, Exempt). There are `Remove` and `Add line` buttons.
- **Notes**, then `Save draft quote`.

### Quote page
- **Header:** `Back to quotes`, `Quote {number}` with a status chip, and `Download PDF`. Once sent, there is also `Email quote`.
- **Summary:** Customer, Quote date, Expires, Currency, Total (MYR base), Sent, Responded, and `Converted to invoice` with a link.
- **Lines table:** #, Description, Account, Tax, Amount (MYR), Tax (MYR).
- **Actions:**
  - Draft: Edit, `Send to customer`, Delete.
  - Converted, expired and declined quotes: Edit and Email quote.
- **History:** "No changes recorded yet."

### Rules and strings
- Steps: `Mark accepted`, `Mark declined`, `Expire`, `Void`, `Void without converting`.
- Convert to invoice:
  - Fields: invoice number, invoice date and due date.
  - "Creates a DRAFT invoice from this quote's lines. Recording it is a separate step."
- Delete: "Delete this draft? … recorded in the quote's history".
- Editing a sent quote: "Editing a sent or accepted quote is recorded in the quote's history. The quote's id and number stay the same."
- Help article: "Lejar also flips a sent quote to expired automatically once its expiry date passes", and "Void a quote at any point before it converts".
- The demo's expired quote showed Responded on the day after its expiry, so automatic expiry also sets Responded.

## Built in Kira

### Migration `20261122001800_quotes.sql`
- **Tables:** `quotes`, `quote_lines` and `quote_events` (History), all readable by entity members.
- **`next_quote_number`:** `QUO-YYYYMM-NNN`.
- **`save_quote`:**
  - Saves drafts, replacing the lines.
  - Sent and accepted quotes can be edited too. They keep their number and log an `edited` event.
  - Customer is picked by id or name; a new name creates a new customer, as invoices do.
- **`quote_transition`:**

  | Step | Allowed from |
  |---|---|
  | Send | draft |
  | Accept, Decline, Expire | sent |
  | Void | anything before converted |

  Each step sets `sent_at` or `responded_at` as it applies and logs an event.
- **`expire_due_quotes`:** runs when the list or a quote page loads. It expires sent quotes whose expiry date has passed, sets `responded_at`, and logs `expired · automatic`.
- **`delete_quote_draft`:** deletes drafts only.
- **`convert_quote`:** turns an accepted quote into an invoice draft (`save_invoice_draft`).
  - Each quote line becomes one invoice line: quantity 1, the line amount as unit price, tax-exclusive. Exempt becomes No SST.
  - The quote becomes `converted` and is linked to the invoice.
  - Nothing posts to the ledger until the invoice is recorded.

### App
- **Code:** `src/features/quotes/*`
  - `quote-form.tsx`: the form, used for new quotes and edits.
  - `controls.tsx`: the step buttons, delete confirmation and convert form.
  - `quotes-pages.tsx`: the list, quote page and edit page.
- **Routes:** `/quotes`, `/quotes/[id]`, `/quotes/[id]/edit`, and `/quotes/[id]/pdf` (A4 PDF via pdf-lib, styled like Kira's invoice PDF).
- **Nav:** `quotes` is marked built.

## Where Kira differs (Assumed)
- **Currency:** MYR only. The currency select and rate field are left out, and Original shows `–`.
- **Not built:**
  - `Email quote`, since Kira has no mail sending.
  - `Split into instalments`.
  - The customer search by TIN or phone. Kira uses a name list instead.
  - Lejar's `Learn about this page` link.
- **PDF layout:** Kira's own, since Lejar's PDF was not opened.
- **History:** shows the actions themselves (sent, edited, accepted, expired · automatic, converted · INV-…). Deleting a draft removes it together with its history.

## Verified (2026-11-23)
End-to-end test `pw/e2e20.js` (temporary @example.com user):
- **Empty list:** shows the tabs at 0.
- **Q1 created:** RM2,000 with SST 8%, plus RM500 with no SST.
  - The form total read RM2,660.
  - Saved as draft QUO-202611-001.
  - The PDF returned 200 as `application/pdf`, starting with `%PDF-`.
- **Draft edit:** changing line 2 to RM600 gave a total of RM2,760, with no history entry.
- **Send to customer:** the quote showed "Sent 2026-11-23 06:25".
- **Edit after sending:** the edit page showed the posted-edit subtitle, and History logged `edited`.
- **Mark accepted:** showed the Convert form (invoice number placeholder INV-202611-001), Edit, and `Void without converting`.
- **Convert to invoice:** created draft invoice INV-202611-001 for Hotel Seri Pagi, totalling RM2,760.
  - The quote now shows `Converted`, with Responded and a link to the invoice.
  - History reads sent, edited, accepted, `converted · INV-202611-001`.
- **Q2 (expiry 2026-11-15):** after sending and reloading, it showed `Expired` with history `expired · automatic`. It was then voided.
- **Q3 (draft):** deleted after confirmation.
- **List:** the void was hidden by default and shown with `showVoid=1`. The Converted tab showed Q1. Voided quotes are now left out of the tab counts.

Typecheck, lint and build are clean.

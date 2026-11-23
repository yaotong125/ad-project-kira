# Slice 21: Delivery orders

Reverse engineered from lejar.ai on 2026-11-23, read-only. No delivery order was created on Lejar.

Sources:
- **Demo company (Selat Coffee Roasters):** `/delivery-orders` with 3 DOs, plus the pages for DO-2026-003 (Open) and DO-2026-002 (Converted).
- **User's test entity:** `/delivery-orders?new=1`, which shows the form.
- **Strings:** all `deliveryOrders.*` strings in English and Malay, generated into `src/features/delivery-orders/copy-data.ts` with "Lejar" changed to "Kira".
- **Help article:** `delivery-orders`.

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar

**List page:**
- Header: `Delivery orders`, subtitle `{org} · goods delivered · {n} delivery orders`.
- The `Create a delivery order` form sits on the page itself. Viewers see a read-only note instead.
- Tabs: All, Open, Converted, Void, each with a count.
- Columns: DO no., Customer, DO date, Status, Original (`–` for MYR), MYR base.

**Create form:**
- Customer (search or add).
- `Delivery order number`, pre-filled `DO-202611-001`, with "Assigned when saved." and `Use my own number`.
- Currency.
- Delivery order date (required).
- Lines: price book item / Freehand, description, account (default 600-0000), qty (default 1), amount, tax.
- Notes.
- `Save delivery order` button.

**Open DO page:**
- Header `Delivery order {n}` with an `Open` chip.
- Summary: customer, DO date, Currency, Total (MYR base).
- Lines table: #, Description, Qty, Account, Tax, Amount (MYR), Tax (MYR).
- `Convert to invoice` form:
  - Invoice number (auto, or own number).
  - Invoice date (required).
  - Due date, defaulting to the invoice date + 30 days.
  - Hint: "Creates a DRAFT invoice from this delivery order's lines. Recording it is a separate step."
- Below the form: `Edit`, `Void without converting`, `Delete`.

**Converted DO page:**
- Shows `Converted to invoice` with a link to the invoice.
- No action buttons.

**Strings and help article:**
- `reopenText`: "The invoice this delivery order was converted into has been voided. Reopen the delivery order to edit it or convert it to a new invoice."
- `deleteOpenOnly`: only open DOs can be deleted.
- `edit.sub`: "Changes replace the saved delivery order."
- `invoices.detail.fromDo`: "From delivery order".
- Help article: "Each delivery order converts to exactly one invoice; there is no partial billing from a single DO".

## Built in Kira

**Migration `20261122001900_delivery_orders.sql`:**
- Tables `delivery_orders` (status open / converted / void) and `delivery_order_lines` (quantity, unit amount, amount, tax). Members can read them.
- Functions:

  | Function | What it does |
  |---|---|
  | `next_do_number` | Numbers DOs as `DO-YYYYMM-NNN`. |
  | `save_delivery_order` | Saves a new DO, or replaces an open DO. The customer is chosen by id or name; a new name creates a customer. |
  | `void_delivery_order` | Voids an open DO. |
  | `delete_delivery_order` | Deletes an open DO only. |
  | `convert_delivery_order` | Creates a draft invoice through `save_invoice_draft`, keeping each line's quantity and unit amount. |
  | `reopen_delivery_order` | Reopens a converted DO once its invoice is void, or once its draft invoice has been deleted. |

**App:**
- `src/features/delivery-orders/*`: form, actions, and the list, detail and edit pages.
- Routes: `/delivery-orders`, `/delivery-orders/[id]`, `/delivery-orders/[id]/edit`.
- **Invoice page:** now shows `From delivery order DO-…`, or `From quote QUO-…` for slice 20's quotes.

## Where Kira differs (Assumed)
- **Currency and price book:** MYR only, and lines are freehand.
- **Line amount:** the form's "amount" is the price per unit. The line total is qty × amount. Every demo DO had qty 1, so Lejar's own meaning was not observable.
- **Stock:** no inventory movement, because Kira has no inventory yet.
- **Not built:** a DO PDF (none was seen on Lejar's DO page) and `Learn about this page`.

## Verified (2026-11-23)
End-to-end test `pw/e2e21.js`, run as a temporary @example.com user:
- **Empty list:** showed the form and the tabs.
- **DO1 created:**
  - Lines 4 × RM120 with SST 6%, and 2 × RM50 with no SST.
  - Form total RM608.80, saved as DO-202611-001, Open.
- **Edit:** line 2 changed to qty 3, giving RM658.80.
- **Convert:**
  - The convert panel showed auto numbering, the invoice date, the due date and the hint.
  - The draft invoice INV-202611-001 came out "From delivery order DO-202611-001", with lines 4 × 120.00 (SST 6%) and 3 × 50.00, total RM658.80.
- **Record the invoice:** the DO showed `Converted`, linked to the invoice, with no actions.
- **Void the invoice:** the DO showed the Reopen panel. `Reopen delivery order` set it back to Open.
- **DO2:** `Void without converting` worked.
- **DO3:** deleted after confirmation.
- **List:** All 2, Open 1, Converted 0, Void 1. The Void tab showed DO2.

Typecheck, lint and build are clean.

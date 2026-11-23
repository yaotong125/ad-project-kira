# Slice 6: Contacts (`/{slug}/contacts`) and Learn's guided flows

Reverse engineered from lejar.ai on 2026-11-22, read-only, on the user's test entity Kira Test Sdn Bhd. No contact was created on Lejar.

Sources:
- page HTML and screenshots of `/contacts`, `?new=1`, `?type=customer` and `?type=supplier`;
- the contacts chunk `3-otq6om7hscp` (createContactAction, updateContactAction, toggleContactActiveAction);
- the guided-flow modules in `0rvc2nc2zdwk3` (951668 state, 963170 flows, 591054 card, 553226 placement);
- the i18n bundle: `contacts.*`, `onboarding.flow.*`, `onboarding.coach.*`.

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Contacts page (observed)

- **Header:** title "Contacts" ("Customers" / "Suppliers" for `?type=`) and "{entity} · {n} contacts".
- **"Add contact" card:** open with `?new=1`. It is also open on its own when the entity has no contacts; otherwise a "New contact" button shows.
- **Fields:**
  - Name* (min 2) and Type (Customer / Supplier / Both).
  - Classification: Trade / Non-trade, which routes to the AR/AP control accounts.
  - Tax residency: Resident / Non-resident.
  - TIN, Email, Phone, Address, Postcode, State (16 Malaysian states), SST number, City.
  - Registration number and type: BRN / NRIC / Passport / Army. NRIC is 12 digits.
  - Default payment terms in days (whole number, 0 or more).
- **Tabs:** All / Customers / Suppliers.
- **Table (from the texts):** Name, Type, TIN, Email, Phone, Terms ("{days} days"), Status (Active / Disabled), Actions (Disable / Enable), with pagination.
- **Contact page `/contacts/{id}`:** "Back to contacts", "Edit contact" (read-only "Contact details" for viewers), and "Save changes". Lejar's page also has a statement of account, customer credit and "Receive a prepayment"; Kira will add those with the sales slices.

## Learn guided flows (observed in code)

- **Starting:** Learn's "Start" stores `{flow, step: 0, section}` in sessionStorage. A card in the app frame then reads "{flow} · n of total", with the step's title and text.
- **Buttons:**
  - "Take me there" when the step's page is not open.
  - Next / Back, and Finish on the last step. Finish returns to Learn.
  - × or Escape exits.
- **Outline:** a brand-coloured outline is drawn around the `[data-flow=…]` element of the step. The card sits below it, above it when there is no room, or beside it when the element is taller than half the screen.
- **Flows:**
  - ai-inbox: inbox-drop, inbox-queue, inbox-review.
  - first-invoice: on /invoices.
  - bank-import: /import, then /reconcile.
  - add-contact: contact-form, contact-save.
  - match-bank: /reconcile.
  - ask-lejar: /chat.
  - read-pnl: /reports.
- **Learn Start links:** these confirm the paths inferred in slice 4.
- **Section 2:** "Lejar checks the section when the contact is saved."

## Kira's build

- **Migration `20261122000500_contacts.sql`:**
  - Adds Lejar's fields to `contacts`.
  - Functions: `contact_fields` (normalise and validate with Lejar's error codes), `create_contact` (also checks Learn section 2), `update_contact`, `set_contact_active`. All are role-checked.
- **`src/features/contacts/`:** form, Server Actions, Disable / Enable button and 46 Lejar strings.
- **Pages:** `src/app/[org]/contacts/page.tsx` and `[id]/page.tsx`.
- **`src/shared/guided-flow/`:** Lejar's flows, store and card, mounted in the app frame. Learn's Start opens the section's flow. The inbox already carries `inbox-drop` / `inbox-queue`.
- **Bills:** the supplier list on the bill form now leaves out disabled contacts.

### Assumed

- **Unique names:** contact names are unique per entity, ignoring case ("A contact with this name already exists."). Bills match suppliers by name.
- **Defaults:** the default Type follows `?type=`; "Contact added." / "Contact saved." confirmations.
- **Not saved on the server:** the flow step is not saved server-side. Lejar's `saveLearnFlowAction` saves it, which lets the dashboard "Resume" a flow (Dashboard slice).

## Verified (2026-11-22, real Supabase project, temporary user deleted afterwards)

- **Tours:** Learn Start 1 showed "YOUR FIRST AI DOCUMENT · 1 OF 3" on the inbox. Start 2 went to `/contacts?new=1` with "ADD A CUSTOMER OR SUPPLIER · 1 OF 2", then Next → 2 of 2.
- **Validation:** name "A", a bad email and a short NRIC each showed Lejar's errors.
- **Saving:** a customer was saved (list row: 30 days, Active). Learn section 2 was checked, and Finish returned to Learn.
- **Supplier view:** `?type=supplier&new=1` preselected Supplier, and the Suppliers tab listed only suppliers.
- **Duplicate name:** refused.
- **Disable:** the row showed Disabled / Enable, and the disabled supplier was gone from the bill form.
- **Edit:** a phone change on the contact page was saved.
- **Checks:** build, typecheck and lint pass.

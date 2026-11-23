# Slice 29: e-Invois (MyInvois)

Reverse engineered from lejar.ai on 2026-11-23, read-only.
- Extracted the `"e-invoice"` help article (`appPath: "/settings/e-invoice"`) from Lejar's help chunk (`0-eyswk7vufsj.js`) and all `invoices.myinvois.*` and `dashboard.einvoice.*` keys from `0sbs3p0t4lr74.js`.
- Wired into the existing `"e-Invois"` sub-tab link already present in `src/features/sst/settings-page.tsx` and the `"e-Invois"` item in the **Sales** sidebar group.

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar (i18n bundle + help article)

- **Settings setup (`/{slug}/settings/e-invoice`):**
  - Supplier profile checklist showing every field LHDN requires (Legal name, BRN/Registration number, TIN, Phone, MSIC code & business activity, Business address), linking to `Settings → Profile`.
  - 4-step LHDN MyTax intermediary appointment walkthrough + `"Verify appointment"` button.
- **Submissions tracker (`/{slug}/myinvois`):**
  - Tracks every recorded sales invoice with validation status (`Not submitted`, `Submitted, awaiting LHDN`, `Valid`, `Rejected`, `Cancelled`), buyer readiness checks, `Submit to MyInvois`, `Retry submission`, and cancellation within LHDN's 72-hour window.
- **Invoice detail panel (`/{slug}/invoices/[id]`):**
  - `"MyInvois (e-Invoice)"` card showing validation status, `"Fix in Settings"` when not configured, `"Submit to MyInvois"` / `"Retry submission"`, and `"Submitted and validated by LHDN"` with UUID once valid.

## Kira's build

- **Routes & Wiring:**
  - `src/app/[org]/myinvois/page.tsx` (`MyInvoisPage`) — KPI strip (`To submit`, `Valid`, `Pending`, `Needs attention`), filter tabs (`All`, `To submit`, `Valid`, `Needs attention`), buyer TIN/BRN pre-flight checks, LHDN UBL-JSON v1.1 payload preview, UUID copy, submit/retry, and 72-hour cancellation.
  - `src/app/[org]/settings/e-invoice/page.tsx` (`MyInvoisSettingsPage`) — under `Settings → Tax & e-Invois → e-Invois`, with the 6-item supplier checklist, 4-step MyTax appointment walkthrough, Sandbox/Production environment selector, and `Verify appointment` / `Disable` controls.
  - Embedded `<InvoiceMyInvoisPanel>` on recorded invoices in `src/app/[org]/invoices/[id]/page.tsx`.
  - Added `"myinvois"` to `BUILT_PATHS` in `src/shared/shell/nav.ts` (completing **100% of the Sales** sidebar group).
- **Feature module (`src/features/myinvois/`):**
  - `types.ts`, `load.ts`, `actions.ts`, `myinvois-client.tsx`, `myinvois-page.tsx`.
  - **Assumed:** Sandbox validation executes LHDN v1.1 supplier/buyer/line rules locally and assigns a sandbox UUID + Long ID immediately without calling live LHDN MyInvois HTTP endpoints (no live LHDN OAuth intermediary credentials are configured in Kira).
- **Database (`supabase/migrations/20261122002700_myinvois.sql` + `20261122002710_myinvois_array_append.sql` + `20261122002720_myinvois_uuid_fix.sql`):**
  - Added `myinvois_enabled`, `myinvois_environment`, `myinvois_verified_at` on `organizations`.
  - Added `myinvois_submissions` with RLS member read policy.
  - Added `verify_myinvois_setup`, `disable_myinvois_setup` (Owner/Admin only), `submit_invoice_myinvois` (validates supplier + buyer TIN/BRN, builds UBL-JSON v1.1 payload, records `valid` or `rejected`), and `cancel_myinvois_submission` (enforces 72-hour window & cancellation reason), each logging to `org_activity_log`.

## Verified (2026-11-23, real Supabase project, temporary user deleted afterwards)

- **Playwright E2E:**
  - Verified `Verify appointment` is blocked with exact missing fields before completing `Settings → Profile`; after saving SSM, TIN `C2584563200`, address, phone, MSIC `62010`, and business activity, `Verify appointment` enabled MyInvois (`Sandbox`).
  - Recorded 2 sales invoices: `"Missing TIN Sdn Bhd"` (no TIN/BRN) and `"Ready Buyer Sdn Bhd"` (TIN `C1122334400`, BRN `202001009999`).
  - Submitting `"Missing TIN Sdn Bhd"` recorded `Rejected` with exact LHDN error; submitting `"Ready Buyer Sdn Bhd"` validated (`Valid`) with UUID and verified UBL-JSON payload containing both supplier and buyer TINs.
  - Verified 72-hour `Cancel` → `Cancelled` → resubmission → `Valid`, and confirmed the embedded `MyInvois (e-Invoice)` card on `/{slug}/invoices/[id]`.
- **Interactive clicking/hovering browser audit:** Verified `/myinvois` KPIs, help disclosure, filter tabs, hover states, UUID copy (`Copied UUID`), UBL-JSON expand/collapse, inline Cancel/Keep, Invoice detail MyInvois card, and `/settings/e-invoice` 6 green checklist rows with 0 console errors and 0 HTTP `>= 400` responses; hid the filter tab strip scrollbar and added dynamic `aria-label` updates on toggle buttons.

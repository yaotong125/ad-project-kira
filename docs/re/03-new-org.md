# Slice 3 — Company setup (`/new-org`)

Reverse engineered from **https://lejar.ai/new-org** on 2026-11-22 with REA, in a debugging Chrome window
signed in to the user's Lejar account: DOM + screenshot of the page, the page's public JS chunks
(`NewOrgForm`, chunk module 606412, and the i18n bundle), one real "Create entity" (approved by the user:
"Kira Test Sdn Bhd"), and the resulting `/accounts` and `/periods` pages.

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Page (observed)

- Header (`h-14`, bottom border): product name → `/dashboard`; the user's email (muted) and a ghost "Sign out" button.
- `main` `max-w-3xl px-6 py-12`:
  1. Welcome box (brand colours): "Welcome to Lejar." / "One last step: tell us about your business…" (shown for the first entity).
  2. Demo card: "Not ready to set up your company?" / "Look around {demo company} first…" / **Explore the demo** (Server Action).
  3. **Create your first entity** (or "Create new entity" once you have one) + description.
  4. The form (`NewOrgForm`, a client component; `useTransition`, posts to Server Action `createOrgAction`).
- Leaving the page after editing asks "This document has unsaved changes. Leave the page and lose them?"
  (`beforeunload` + a capture-phase click handler on same-site links).

## Form fields (observed, in order)

| Field | Name | Notes |
|---|---|---|
| Legal name* | `legalName` | hint "Your workspace address is generated from this automatically." |
| Business type* | `entityType` | `sole_prop`, `partnership`, `llp`, `sdn_bhd` (default); hint changes per type + "Set once at creation; you cannot change it later." |
| (callout) | | "Freelancing or self-employed, with no company registered? Choose Sole Proprietor…" |
| Fiscal year-end* | `fiscalYearEnd` | date, default 31 Dec of the current year |
| Period cadence | `cadence` | `bimonthly` (SST-02, default), `monthly`, `quarterly` |
| Earlier records* | `pastRecordsChoice` + hidden `pastRecordsFrom` | "No, start this financial year" → `none`; "Yes, from [year]" → the first day of that year. Up to 6 earlier years, none before the 7-year record-keeping cut-off. Replaced by a note when migrating (`pastRecordsFrom=none`). |
| Business commencement date | `fiscalYearStart` | inside a `<details>`; `max` = today (Asia/Kuala_Lumpur); opens itself when invalid |
| Chart of accounts | `chartModeRadio` + hidden `chartMode` | `standard` (default) or `migrating` |
| How did you hear about us?* | `acquisitionChannel` | 15 options; the detail field's label, hint, placeholder and `required` change with the answer ("other" makes it required) |
| Anything to add? | `acquisitionDetail` | max 200 |
| Optional regulatory identifiers | `registrationType`, `ssmNumber`, `sstNumber`, `tin` | inside a `<details>`; the number's label/placeholder/hint follow the type (BRN, NRIC, PASSPORT, ARMY) |

Server validation messages (from the i18n bundle; order of checks is Kira's): legal name required / at least 2 /
at most 200; business type; fiscal year-end; cadence; chart mode; earlier records; commencement invalid / in the
future / outside "before the year-end and no more than 18 months before it"; channel required; detail required for
"other"; registration type; MyKad must be 12 digits.

## What "Create entity" did on lejar.ai (observed)

Request: multipart Server Action with the fields above. Response shape (client code): `{ ok, orgId, slug, chartMode, chatEnabled }`
or `{ ok: false, error }`; the client then opens `/{slug}/chat` (AI chat enabled on this account) or, without chat,
`/{slug}/getting-started` (`/{slug}/migrate` when migrating).

For "Kira Test Sdn Bhd", 31 Dec year-end, bimonthly, no earlier records, standard chart:
- workspace address `kira-test-sdn-bhd` (slug of the legal name);
- financial year **2026-01-01 → 2026-12-31** with **six bimonthly periods** (Jan–Feb … Nov–Dec), all open;
- `/periods` offers "Add an earlier year … Up to 6 financial years back";
- chart: **"MPERS-aligned · 107 accounts"** — saved in [data/lejar-chart-sdn-bhd.json](data/lejar-chart-sdn-bhd.json)
  (code, name, type, subtype current/non-current/cash, statement section, normal balance, cash flag, and the five
  accumulated-depreciation accounts nested under their fixed-asset accounts).

## Kira's build

- **Database** (`supabase/migrations/20261122000100_new_org.sql`): `organizations`, `organization_members`,
  `fiscal_years`, `accounting_periods`, `accounts`, `chart_template`; RLS lets members read their own entities;
  all writes go through `create_organization(p_org, p_years)` (SECURITY DEFINER, one transaction): unique slug
  (`-2`, `-3` … on clashes), owner membership, years + periods, and the chart copied from `chart_template`.
- **Server Action** `createOrgAction` validates with Lejar's messages, computes years and periods, calls the function,
  and returns `{ ok, slug, chartMode }`; the form then opens `/{slug}/getting-started` or `/{slug}/migrate`.
- **Landing**: `/post-auth` and `/dashboard` go to the user's first entity, or `/new-org` when they have none
  (inferred: a fresh Lejar account went from sign-in straight to `/new-org`).

### Inferred / assumed

- ~~Equity for the other business types inferred~~ → **observed** (user's choice): three more test entities on
  lejar.ai (Kira Test Sole Prop / Partnership / LLP, 105–106 accounts each) showed that only the equity section
  differs; the other 101 accounts are identical for all four types. Raw charts in `data/lejar-chart-{sole,part,llp}.raw.json`.
  Sole proprietor: Owner's Equity, Owner's Capital, Accumulated Profits (retained earnings), Owner's Drawings.
  Partnership: Partners' Equity, Partners' Capital Accounts, Partners' Current Accounts, Undistributed Profits,
  Partners' Drawings. LLP: as partnership but Partners' Capital Contributions. No Dividends Declared outside Sdn Bhd.
- Periods: split from the first day of the year in 1/2/3-month steps, the last ending on the year-end; matches the
  observed Sdn Bhd case. Earlier years are 12-month years back to the chosen start, each with periods.
- A long first year (commencement date) starts on that date; years before it are still allowed if chosen.
- AI chat redirect (`chatEnabled`) not built: Kira always opens getting-started / migrate.
- `/{slug}/getting-started` and `/{slug}/migrate` are placeholders that read back what was created.
- "Explore the demo" answers with Lejar's "The demo is unavailable right now…" text until a demo company exists
  (user's choice: build the read-only demo after the books slices). Kira's demo company is named
  "Kedai Kopi Kira Sdn Bhd" (Lejar's is its own "Selat Coffee Roasters Sdn Bhd"). Observed: the demo card, like the
  welcome box, only shows before the first entity.
- The SSM note is kept as Lejar wrote it, including "…Kira submits as your intermediary" (user's choice); e-invoicing
  through LHDN MyInvois is a later slice and is not built yet.
- Plan limits ("Your {plan} plan includes…") and analytics events are left out.
- Lejar keeps the page language in its user settings; Kira uses `?lang=ms` like the auth pages.

## Verified (2026-11-22)

- Date logic against Lejar's observed values (scratchpad `fiscal-check.ts`, 11 checks): earlier-year options
  2025…2020 for a 31 Dec year-end on 2026-11-22, six bimonthly periods for 2026, monthly 12 / quarterly 4,
  18-month commencement limit, non-calendar labels ("Jul 2025 - Jun 2026"), no options for 29 Feb.
- Rendered `/new-org` signed in (fake auth server): sign-in lands on `/new-org`; layout, help texts per business type
  and per "How did you hear about us?" answer.
- Migration applied to the user's Supabase project (`npm run db:migrate`). `scripts/db-verify-new-org.mjs` runs
  `create_organization()` as an existing user for each business type inside a rolled-back transaction: account counts
  match lejar.ai (Sdn Bhd 107, Sole Prop 105, Partnership 106, LLP 106), 6 periods, owner membership, 5 depreciation
  pairs, readable through RLS; anonymous calls are refused; nothing is left behind.
- Browser end to end against the real project (2026-11-22), with a temporary confirmed test user created in the
  database (`scripts/e2e-user.mjs`, no email sent): password sign-in → one-time Terms page → `/new-org` → "Kira E2E
  Trading Sdn Bhd" with earlier records from 2024 → `/kira-e2e-trading-sdn-bhd/getting-started` showing 3 years,
  18 periods, 107 accounts. Database rows checked (owner, 3 cash accounts, 5 depreciation pairs); the user and its
  entity were deleted afterwards.

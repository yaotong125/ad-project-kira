# Slice 4 — Getting started → Learn Kira (`/{slug}/learn`) and the app frame

Reverse engineered from lejar.ai on 2026-11-22 with REA in the signed-in debugging Chrome, on the user's test
entities (Kira Test Sdn Bhd: fresh state; Kira Test Sole Prop: clicks approved by the user). Sources: DOM and
screenshots, the page's client chunks (`2wqv6frgke6nb` Learn buttons, `2hpoxq_pb7spa` AppShell, `0rvc2nc2zdwk3`
nav config) and the i18n bundle (`learn.*`, `shell.*`, `inventory.ui.nav.*`).

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Routing (observed)

`/{slug}/getting-started` redirects to `/{slug}/learn`. After "Create entity", lejar.ai opens the AI chat when chat
is enabled, otherwise getting-started → Learn. Kira (no chat yet) always lands on Learn.

## Learn page (observed)

Title "Learn Lejar", "Seven short sections. Each one is a real job in your books, done one at a time.", a progress
chip "{done} of 7 checked" and "Hide Learn Lejar". Then 7 cards, in this order:

| # | Section id | Title | Start opens |
|---|---|---|---|
| 1 | receipt-to-bill | Turn a receipt into a bill | `inbox` (observed) |
| 2 | add-contact | Add a customer or supplier | `contacts?new=1` (observed; opens the form with a 2-step guided tour) |
| 3 | send-invoice | Send an invoice | `invoices?new=1` (inferred) |
| 4 | import-bank | Import a bank statement | `import` (inferred) |
| 5 | match-bank | Match the bank to your books | `reconcile` (inferred) |
| 6 | ask-lejar | Ask Lejar a question | `chat` (inferred) |
| 7 | read-pnl | Read your profit and loss | `reports#profit-and-loss` (inferred) |

States (chip class): **Open** `chip brand`, **In progress** `chip brand`, **Skipped** `chip warn`, **Locked** `chip`
(card at 70% opacity, no buttons), **Checked** (`chip pos`, inferred). The first section that is neither checked nor
skipped is the current one; all later sections are locked. Observed sequence on Kira Test Sole Prop:
fresh → Skip section 1 → 1 Skipped (keeps "Use the sample" + Start, secondary), 2 Open (Skip ghost + Start primary)
→ Start 2 → opens contacts, back on Learn 2 is "In progress" (still Skip + Start) → Hide → "Show Learn Lejar" and a
card "Learn Lejar is hidden from the dashboard. Your progress is kept." → Show (restored).

Server Actions (client chunk): `setLearnHiddenAction(orgSlug, hidden)`, `skipLearnSectionAction(orgSlug, section)`,
`startPracticeAction(orgSlug, section)` ("Use the sample": opens a private practice copy and navigates to
`/{practiceSlug}/{path}`), and a progress action on Start (`step 0, start 1`) before navigating, even on failure.
Sections become Checked only when the real job is done in the feature (texts `learn.result.*`, "What just happened").
Other texts: viewer notice, all-checked message, "Saving...", errors. The dashboard also has a small Learn card
("Next: {section}", Resume): part of the Dashboard slice.

## App frame (observed)

`AppShell`: 232px sidebar (collapsible to 56px icons; mobile drawer) with logo, entity switcher (`<details>`:
entities, "Demo"/"Practice" badges, "+ New entity", "{role} view"), Ask Lejar on top (chat enabled), then groups
from the nav config (first 3 items of a collapsible group + "N more…"; the group holding the current page opens;
only the longest matching path is active). Top bar (48px): sidebar toggle, search (Ctrl K), New menu (Invoice, Bill,
Payment voucher, Customer or supplier, Journal entry), Help menu, Notifications ("You're all caught up…"), Ask Lejar
(Ctrl J), account menu (Signed in as, Account & security, Business settings, Sign out). A trial banner shows above
the top bar ("14 days left in your Pro trial · Upgrade…"); Billing in the sidebar appears only with billing on.
Icons are Lucide (names read from the rendered SVG classes).

## Kira's build

- **Database** (`supabase/migrations/20261122000200_learn.sql`): `organizations.learn_hidden`, `learn_progress
  (org, section, in_progress|skipped|checked)`, functions `set_learn_hidden`, `skip_learn_section` (current section
  only), `start_learn_section` (current or skipped; never undoes checked), `check_learn_section` (for feature slices),
  all role-checked (owner/admin/member; viewers read only). `20261122000300_reserved_slugs.sql` keeps entity slugs
  off Kira's own paths (login, dashboard, new-org, …).
- **Frame**: `src/shared/shell/app-shell.tsx` + `nav.ts` (Lejar's chat-enabled nav, Lucide icons, longest-match
  highlighting, "N more…", collapse saved in localStorage, mobile drawer, menus, Ctrl K / Ctrl J), wrapped around
  every `/{slug}/…` page by `src/app/[org]/layout.tsx`. Texts: Lejar's `shell.*` strings, "Lejar" → "Kira".
- **Coming soon**: `src/app/[org]/[...rest]` and `/{slug}` (Dashboard) show a "not built yet" card in the frame
  (user's choice: full menu from day one).
- **Learn**: `src/features/learn/` (page, buttons, actions, section rules) with Lejar's 54 `learn.*` strings.
- **Language**: `?lang=ms|en` on any page sets the `kira_lang` cookie; signed-in pages read it (Lejar keeps the
  language in user settings).

### Assumed / left out

- "Use the sample" / practice copy not built (user's choice); its button and hint line are hidden.
- Checked sections show no buttons; the "What just happened" panel comes with the feature slices.
- No trial banner and no Billing item (Kira has no plans). Ask Kira, search, help articles and account settings open
  "coming soon". WhatsApp and "Replay app tour" are left out of the Help menu (no equivalents yet).
- Kira's "member" role is shown as Lejar's "Bookkeeper".

## Verified (2026-11-22, real Supabase project, temporary test user deleted afterwards)

Sign in → Terms → `/new-org` → Create entity → `/getting-started` → `/learn` (fresh: 1 Open, 2–7 Locked) → Skip 1
→ 1 Skipped, 2 Open → Start 2 → `/contacts?new=1` (coming soon) → back: 2 In progress → Hide → hidden notice +
"Show Learn Kira" → sidebar "6 more…" expands Sales. Database rows: receipt-to-bill skipped, add-contact in_progress,
learn_hidden true. `?lang=ms` switched the frame and the coming-soon page to Malay. Build, typecheck and lint pass.

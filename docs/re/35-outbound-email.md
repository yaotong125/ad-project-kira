# Slice 35 — Outbound Email Engine (Resend)

Adds transactional email delivery (with live PDF attachments) across Team invitations, Sales invoices, Quick invoices, and Quotes using Resend's REST API without adding extra npm dependencies.

## 1. Shared Mailer (`src/shared/email/`)

- **`mailer.ts`** (`server-only`):
  - `isEmailConfigured()` / `configuredFromAddress()` (`RESEND_API_KEY`, `RESEND_FROM`, defaulting to `Kira <onboarding@resend.dev>`).
  - `sendEmail({ to, subject, html, text, replyTo?, attachments? })`: posts directly to `https://api.resend.com/emails` with base64-encoded PDF attachments. When `RESEND_API_KEY` is unset, returns `{ status: "skipped", reason }` gracefully so every UI shows a clear fallback without crashing.
- **`templates.ts`**:
  - Kira-branded HTML + plain-text templates (`teamInviteEmail`, `documentEmail`) with Kira navy `#223358`, turquoise `#00d3c7` CTA, HTML escaping, and responsive table summaries.
- **`actions.ts`**:
  - `sendDocumentEmailAction(orgSlug, { docType, docId, toEmail, note? })` invokes the existing in-process PDF route handlers (`invoices/[id]/pdf`, `quick-invoices/[id]/pdf`, `quotes/[id]/pdf`), attaches `<docNumber>.pdf`, sends via Resend, and records the outcome via `log_org_email`.
- **`email-document-button.tsx`**:
  - Reusable `"Email customer"` button + accessible modal dialog pre-filled with customer email (when available), optional personal message, and live delivery status banner (`sent` / `skipped` / `error`).

## 2. Wired Screens

- **Team invitations** (`src/features/team/actions.ts`, `team-client.tsx`): `inviteMemberAction` emails the full `/invite/[token]` link automatically when `RESEND_API_KEY` is set, logs delivery to `org_email_logs`, and still displays the copyable share link as fallback.
- **Sales invoices** (`src/app/[org]/invoices/[id]/page.tsx`): `<EmailDocumentButton docType="invoice" />` pre-filled with `contact.email` beside `Download PDF`.
- **Quick invoices** (`src/features/quick-invoices/quick-invoices-client.tsx`, `quick-invoices-page.tsx`): `<EmailDocumentButton docType="quick_invoice" />` pre-filled with `customerEmail` beside `Download PDF`.
- **Quotes** (`src/features/quotes/quotes-pages.tsx`): `<EmailDocumentButton docType="quote" />` beside `Download PDF`.
- **Settings → Data & AI** (`src/features/settings-extras/load.ts`, `extras-pages.tsx`): displays an **Outbound email (Resend)** status card (`Configured` / `Not configured` chip, active `From` address, and recent `org_email_logs` table).

## 3. Database Migration (`supabase/migrations/20261124003200_outbound_email.sql`)

- Table `org_email_logs` (`org_id`, `doc_type`, `doc_id`, `recipient_email`, `subject`, `provider`, `provider_message_id`, `status`, `error_message`, `sent_by`, `sent_at`) with RLS member read policy.
- RPC `public.log_org_email` (org editors via `learn_org_for_editor`) writing to `org_email_logs` and logging sent emails to `org_activity_log`.

## 4. Verification

- `npx tsc --noEmit`, `npm run lint`, and `npx next build` passed with **0 errors and 0 warnings** across all **96 routes**.
- Run `npm run db:migrate` once connected to Postgres (IPv6 or IPv4 Session pooler URI) to apply `20261124003100_cron_automation.sql` and `20261124003200_outbound_email.sql`, and set `RESEND_API_KEY` + `RESEND_FROM` in `.env.local` / Vercel to enable live delivery.

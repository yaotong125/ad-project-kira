# Slice 34 — Scheduled Automation Cron Engine (`/api/cron/run-due` & Settings → Data & AI)

Adds unattended daily execution for Kira's 4 periodic accounting engines so recurring invoices, recurring bills, monthly fixed-asset depreciation, and auto-post prepaid amortisations run automatically without manual clicks.

## 1. Architecture

- **Cron HTTP Route (`src/app/api/cron/run-due/route.ts`):**
  - Accepts `GET` (Vercel Cron) and `POST` (GitHub Actions / external schedulers).
  - Exempted from cookie session redirects in `src/proxy.ts` (`/api/cron/`).
  - Enforces timing-safe `Authorization: Bearer <CRON_SECRET>` validation (`503` when `CRON_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` is unset; `401` on missing or invalid Bearer token).
  - Supports optional `?asOf=YYYY-MM-DD` and `?org=<slug>` query parameters for targeted backfills or single-org smoke runs.
  - Invokes `public.run_scheduled_automations_system` via the Supabase `service_role` client.
- **Vercel Cron Schedule (`vercel.json`):**
  - Configured to call `/api/cron/run-due` daily at `0 17 * * *` UTC (`01:00 MYT`, `Asia/Kuala_Lumpur`).
- **Database Migration (`supabase/migrations/20261124003100_cron_automation.sql`):**
  - `organizations.auto_run_enabled boolean not null default true`
  - `org_automation_runs` audit history table (RLS: `public.is_org_member(org_id)` read) tracking `trigger_source` (`cron` | `manual`), `as_of_date`, counts (`invoices_generated`, `bills_generated`, `depreciation_posted`, `prepaids_posted`), `status` (`ok` | `partial` | `failed`), JSON `details`, and `error_message`.
  - `public.set_auto_run_enabled(p_slug, p_enabled)` (Owner / Admin via `org_for_admin`).
  - `public.run_org_automations_now(p_slug, p_as_of)` (Owner / Admin / Bookkeeper via `learn_org_for_editor`) — runs all 4 idempotent engines in isolated error blocks and logs to `org_automation_runs` and `org_activity_log`.
  - `public.run_scheduled_automations_system(p_as_of, p_slug)` — revoked from `public, anon, authenticated`, granted strictly to `service_role`; establishes transaction-local owner JWT claims per enabled org so existing editor RPCs (`generate_due_recurring`, `run_depreciation`, `post_due_prepaids`) run safely without duplicating accounting logic.
- **Settings UI (`/{slug}/settings/data`):**
  - Added the **Scheduled automations** card in `src/features/settings-extras/extras-pages.tsx` & `extras-client.tsx` with a daily schedule Pause/Turn on toggle, an on-demand **Run due now** button, and a **Recent automation runs** table.

## 2. Deployment & Migration Note

- Set `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel / production environment variables (documented in `.env.example`).
- Apply `supabase/migrations/20261124003100_cron_automation.sql` with `npm run db:migrate` (note: direct `db.<ref>.supabase.co` hosts are IPv6-only; on IPv4-only networks use Supabase's Session pooler URI from **Supabase → Connect → Session pooler**).

## 3. Verification

- `npx tsc --noEmit`, `npm run lint`, and `npx next build` passed with **0 errors and 0 warnings** across all **96 routes** (including `ƒ /api/cron/run-due`).
- Verified `/api/cron/run-due` against the production server (`localhost:3100`):
  - No `Authorization` header → HTTP `401` (`Unauthorized`, no redirect to `/login`)
  - Wrong Bearer token → HTTP `401` (`Unauthorized`)
  - Valid Bearer token without `SUPABASE_SERVICE_ROLE_KEY` → HTTP `503` JSON with clear setup message.

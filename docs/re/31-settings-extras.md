# Slice 31 — Remaining Settings Tabs (API & webhooks, Data & AI, Account & security)

Reverse engineered from Lejar.ai's cached bundles (`0-eyswk7vufsj.js` help articles `security` and `data-and-privacy`, and `0sbs3p0t4lr74.js` i18n keys `settings.language.*`, `settings.aiMemory.*`, `pageTitle.settings.*`, and `onboarding.step.apiKey.*`).

Completes the final 3 of Lejar.ai's 7 top-level Settings tabs, eliminating every remaining "coming soon" route across the entire workspace.

## 1. Routes

| Route | Tab / Sub-tab | Purpose |
|---|---|---|
| `/{slug}/settings/api-keys` | **API & webhooks** → `API keys` | Mint `read` or `write` scoped API keys (`kira_live_...`, shown once on creation, stored as SHA-256 hash + prefix only) and revoke active keys. |
| `/{slug}/settings/webhooks` | **API & webhooks** → `Webhooks` | Register HTTPS webhook endpoints for accounting events (`invoice.recorded`, `bill.recorded`, `payment.recorded`, `myinvois.validated`, `stocktake.confirmed`), view one-time `whsec_...` signing secret, toggle enable/disable, and delete. |
| `/{slug}/settings/data` | **Data & AI** | Shortcut to Migration wizard, full organisation JSON export, Kira AI memory toggle & two-step clear-all-memory control, and Owner-only Danger zone for permanent organisation deletion (exact `legal_name` confirmation + 7-year Malaysian tax record reminder). |
| `/{slug}/settings/data/export` | *(GET Route Handler)* | Streams a downloadable `application/json` archive (`kira-<slug>-export-<YYYY-MM-DD>.json`) containing the organisation record, chart of accounts, contacts, invoices, bills, journal entries, fixed assets, prepaid schedules, stock items, MyInvois submissions, and activity log (Owner / Admin only). |
| `/{slug}/settings/account` | **Account & security** | Per-user Display language preference (`English` / `Bahasa Malaysia`, live cookie + profile update across workspaces), password change via Supabase Auth, 2FA status card, and Owner-only "Require 2FA for owners and admins" policy toggle. |

## 2. Database Schema & RPCs (`supabase/migrations/20261122002900_settings_extras.sql`)

- **`organizations` columns added:**
  - `ai_memory_enabled boolean not null default true`
  - `require_mfa_for_admins boolean not null default false`
- **Tables added (RLS: org members read; mutations via `security definer` RPCs):**
  - `org_api_keys` (`id`, `org_id`, `name`, `key_prefix`, `key_hash`, `scope` `read|write`, `created_by`, `created_at`, `last_used_at`, `revoked_at`)
  - `org_webhooks` (`id`, `org_id`, `url`, `events text[]`, `signing_secret_prefix`, `signing_secret_hash`, `enabled`, `created_by`, `created_at`)
- **RPCs (`security definer`, `set search_path = public`):**
  - `create_org_api_key`, `revoke_org_api_key` (Owner / Admin via `org_for_admin`)
  - `create_org_webhook`, `toggle_org_webhook`, `delete_org_webhook` (Owner / Admin via `org_for_admin`)
  - `set_ai_memory_enabled`, `clear_org_ai_memory` (Owner / Admin via `org_for_admin`)
  - `set_require_mfa_for_admins` (Owner-only via `org_for_owner`)
  - `delete_organization` (Owner-only via `org_for_owner`; requires exact match against `organizations.legal_name`, cascades all entity rows cleanly)
- All mutations write audit entries to `org_activity_log`. Secrets (`kira_live_...`, `whsec_...`) are generated and SHA-256 hashed in Node `crypto` inside Server Actions so raw secrets never touch the database.

## 3. Code Layout

- Feature module: `src/features/settings-extras/`
  - `types.ts` — `ApiKeyRow`, `WebhookRow`, `WEBHOOK_EVENTS`
  - `load.ts` — Server-side loaders for API keys, webhooks, Data & AI summary, and Account & security state
  - `actions.ts` — Server Actions for key mint/revoke, webhook CRUD, AI memory toggle/clear, org deletion, language preference, password change, and MFA enforcement
  - `extras-client.tsx` — Interactive forms, one-time secret reveal + Copy button, inline Clear memory confirmation, Danger zone exact-name guard, BM/EN switcher
  - `extras-pages.tsx` — Server page wrappers (`ApiKeysSettingsPage`, `WebhooksSettingsPage`, `DataAiSettingsPage`, `AccountSecuritySettingsPage`)
- App Router pages:
  - `src/app/[org]/settings/api-keys/page.tsx`
  - `src/app/[org]/settings/webhooks/page.tsx`
  - `src/app/[org]/settings/data/page.tsx`
  - `src/app/[org]/settings/data/export/route.ts`
  - `src/app/[org]/settings/account/page.tsx`

## 4. Verification

- `npx tsc --noEmit`, `npm run lint`, and `npx next build` passed with zero errors and zero warnings across all 88 routes.
- End-to-end Playwright run (`scratch/e2e31.js`) verified:
  - Minting `POS Sync` (`write`, `kira_live_...` one-time secret) and minting/revoking `BI Readonly` (`read` → `Revoked` chip).
  - Adding webhook `https://hooks.example.com/kira` (`whsec_...` one-time secret), disabling (`Disabled`), and re-enabling (`Active`).
  - `GET /{slug}/settings/data/export` returning HTTP `200`, `application/json`, matching `organization.legal_name`, `107` MPERS accounts, and `activityLog`.
  - Toggling Kira AI memory off/on and clearing all memory (`All memory is deleted.`).
  - Switching Display language to Bahasa Malaysia (`Bahasa disimpan`, live sidebar/topbar translation) and back to English (`Language saved`), plus toggling `Require 2FA for owners and admins`.
  - Exact legal-name guard on Danger zone + real permanent deletion of a second disposable entity (`kira-delete-me-sdn-bhd`) redirecting cleanly to `/dashboard`.
- Interactive click/hover browser audit confirmed all **7 Settings tabs** are live with zero "coming soon" placeholders, `0` console errors, and `0` HTTP `>= 400` responses.

# Slice 36 — Live LHDN MyInvois OAuth 2.0 & REST API Integration

Upgrades Slice 29's e-Invois module from sandbox-only UUID issuance to a full **LHDN MyInvois API v1.0/v1.1** client while preserving automatic Sandbox Simulation fallback whenever LHDN credentials are not configured.

## 1. LHDN API Client (`src/features/myinvois/lhdn-client.ts`)

- **Official LHDN Base URLs:**
  - Sandbox: `https://preprod-api.myinvois.hasil.gov.my` / portal `https://preprod.myinvois.hasil.gov.my`
  - Production: `https://api.myinvois.hasil.gov.my` / portal `https://myinvois.hasil.gov.my`
- **Encrypted Credential Storage (AES-256-GCM):**
  - Per-organisation Client Secrets are encrypted with AES-256-GCM (`MYINVOIS_ENCRYPTION_KEY`) before calling `save_myinvois_credentials`; only a masked last-4 hint (`••••xxxx`) is ever returned to the browser.
  - Supports platform-wide env credentials (`MYINVOIS_CLIENT_ID`, `MYINVOIS_CLIENT_SECRET`, optional `MYINVOIS_ON_BEHALF_OF`) as fallback when per-org credentials are not saved, and falls back transparently to Sandbox Simulation when neither is configured.
- **Endpoints Implemented:**
  - **OAuth 2.0 Token (`POST /connect/token`)**: `client_credentials` grant with `scope=InvoicingAPI`, optional `onbehalfof` intermediary header, and in-memory token caching until 60s before expiry.
  - **Document Submission (`POST /api/v1.0/documentsubmissions`)**: hashes the UBL-JSON v1.1 payload with SHA-256 (`documentHash`), encodes UTF-8 JSON to base64 (`document`), submits to LHDN, and parses `submissionUid`, `acceptedDocuments[0].uuid`, or `rejectedDocuments[0].error`.
  - **Status Polling (`GET /api/v1.0/documents/{uuid}/details`)**: retrieves `status` (`Valid`/`Invalid`/`Cancelled`/`Submitted`), `longId`, `dateTimeValidated`, and `validationResults` step errors.
  - **72-Hour Cancellation (`PUT /api/v1.0/documents/state/{uuid}/state`)**: transmits `{ status: "cancelled", reason }` to LHDN before recording the cancellation in Postgres.
  - **Live Taxpayer TIN Validation (`GET /api/v1.0/taxpayer/validate/{tin}?idType=&idValue=`)**: validates `BRN`, `NRIC`, `PASSPORT`, or `ARMY` against LHDN live.

## 2. Database Migration (`supabase/migrations/20261124003300_myinvois_live_api.sql`)

- Adds `myinvois_client_id`, `myinvois_client_secret_enc`, `myinvois_client_secret_hint`, and `myinvois_on_behalf_of` on `public.organizations`.
- Adds `save_myinvois_credentials` (Owner/Admin), `clear_myinvois_credentials` (Owner/Admin), and `record_myinvois_api_result` (Editor) RPCs with `org_activity_log` audit entries.

## 3. UI Additions

- **Settings → Tax & e-Invois → e-Invois (`/{slug}/settings/e-invoice`):**
  - Added **3. LHDN API credentials (OAuth 2.0)** card showing mode chip (`Live API (org credentials)` / `Live API (platform env)` / `Sandbox simulation`), Client ID, write-only Client Secret, optional On-behalf-of TIN, **Save credentials**, **Test LHDN connection**, **Clear**, and a **Quick live TIN check** tool.
- **e-Invois tracker (`/{slug}/myinvois`):**
  - Added **Sync** action button (`syncMyInvoisStatusAction`) for pending/valid submissions and a direct **LHDN portal** verification link (`/{uuid}/share/{longId}`) when LHDN returns a `longId`.

## 4. Verification

- `npx tsc --noEmit`, `npm run lint`, and `npx next build` passed cleanly (**0 errors, 0 warnings**, **96 routes**).
- Apply pending migrations (`20261124003100_cron_automation.sql`, `20261124003200_outbound_email.sql`, `20261124003300_myinvois_live_api.sql`) via `npm run db:migrate` once on an IPv6 network or IPv4 Session pooler URI.

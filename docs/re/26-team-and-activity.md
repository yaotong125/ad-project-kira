# Slice 26: Team & roles, Invitations & Activity log

Reverse engineered from lejar.ai on 2026-11-23, read-only.
- Extracted the `"team-and-roles"` help article (`appPath: "/settings/team"`) from Lejar's help chunk (`0-eyswk7vufsj.js`) and `pageTitle.settings.team`, `shell.role.*`, and `errors.membership.*` keys from Lejar's i18n chunk (`0sbs3p0t4lr74.js`).
- Matched the `Team & activity` tab in Lejar's Settings navigation bar (`src/features/settings/settings-header.tsx`).

Legend: **Observed** · **Inferred** · **Assumed** (Kira's choice).

## Observed on Lejar (i18n bundle + help article)

- **Route & Title:** `/{slug}/settings/team` — `Members` (BM: `Ahli`), under `Settings → Team & activity`.
- **Roles:**
  - **Owner** (`owner` / BM `Pemilik`): Everything, including the plan, billing, settings, and deleting the organisation. `"The owner role cannot be handed over from this page."`
  - **Admin** (`admin` / BM `Admin`): Everything a bookkeeper can, plus inviting, changing roles, and removing members.
  - **Bookkeeper** (`member` / BM `Pembuku`): Records invoices, bills, payments, and journals, but cannot manage members.
  - **Viewer** (`viewer` / BM `Pemerhati`): Reads everything, changes nothing. Good for a director, an investor, or an auditor.
- **Permission rules:** Only `owner` and `admin` can invite, change roles, or remove members; `owner` cannot be demoted or removed from the team page.

## Kira's build

- **Routes:**
  - `src/app/[org]/settings/team/page.tsx` (`TeamSettingsPage`) — `Members` sub-tab under `Settings → Team & activity`.
  - `src/app/[org]/settings/activity/page.tsx` (`ActivitySettingsPage`) — `Activity` sub-tab showing chronological `org_activity_log` events merged with recent ledger postings.
  - `src/app/invite/[token]/page.tsx` (`InviteAcceptPage`) — public invitation preview & acceptance page (enabled in `src/proxy.ts` for `/invite/*`), showing the Kira card, org name, role summary, sign-in/sign-up links with `?next=/invite/{token}`, email-mismatch guard, and one-click `"Accept invitation"`.
- **Feature module (`src/features/team/`):**
  - `types.ts`, `load.ts`, `actions.ts`, `team-client.tsx`, `team-page.tsx`.
  - **Assumed:** Shareable `/invite/{token}` links with `"Copy link"` buttons so invitations work cleanly end-to-end without requiring an external transactional SMTP provider; self role-change and self-removal are blocked to prevent accidental lockout.
- **Database (`supabase/migrations/20261122002400_team_and_activity.sql`):**
  - Added `organization_invitations` (48-char random hex token, 14-day expiry, partial unique index preventing duplicate pending invites per email per org) and `org_activity_log` with RLS member read policies.
  - Reused `public.org_for_admin(text)` from `20261122001200_ledger.sql`.
  - Added RPCs: `list_org_members`, `invite_org_member`, `revoke_org_invitation`, `update_org_member_role`, `remove_org_member`, `preview_org_invitation` (granted to `anon, authenticated`), and `accept_org_invitation`.

## Verified (2026-11-23, real Supabase project, temporary users deleted afterwards)

- **Multi-user Playwright E2E (2 real Supabase accounts: Owner + Staff):**
  - Verified self-invite (`already a member`) and duplicate pending invite (`already a pending invitation`) are blocked.
  - Invited `revoke-me@example.com` as `Viewer` and revoked the pending invite.
  - Invited `kira-e2e-staff@example.com` as `Bookkeeper`; staff visited `/invite/{token}` signed out → saw public invite preview card → signed in → accepted invite → landed in workspace with `Bookkeeper view` and saw read-only `Settings → Team & activity`.
  - Owner changed staff role `Bookkeeper → Viewer` (`Saved`) → staff sidebar updated to `Viewer view`.
  - Owner removed staff (two-step `Remove` → `Confirm remove`), re-invited as `Admin`, staff re-accepted (`Admin view`), and Owner left 1 pending `Viewer` invite (`auditor@example.com`).
  - Verified `Settings → Activity` recorded all 9 chronological `Team` events (`Invited`, `Revoked`, `joined`, `Changed`, `Removed`).
- **Interactive clicking/hovering browser audit:** Verified help disclosure, live role helper switching (`Bookkeeper` / `Admin` / `Viewer`), hover states across tabs/rows/buttons, inline `Remove` cancel, `Copy link` → `Copied` feedback, `/invite/[token]` email-mismatch card, and `Activity` log table with 0 console errors and 0 HTTP `>= 400` responses; aligned `"Send invite"` button height to `34px` and verified clean production build.

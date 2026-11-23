# Slice 33 — Auth Recovery & Legal Pages (`/auth/forgot`, `/auth/reset`, `/terms`, `/privacy`)

Completes the remaining public Auth and Legal routes recorded in [01-sign-in.md](01-sign-in.md) and linked from `/login`, `/signup`, and `/auth/terms`.

## 1. Routes

| Route | Purpose |
|---|---|
| `/auth/forgot` | Bilingual (EN / BM) password reset request form. Calls `supabase.auth.resetPasswordForEmail` with PKCE callback `redirectTo: /auth/callback?next=/auth/reset` and always responds with the neutral `reset_sent` notice without revealing account existence. |
| `/auth/reset` | Bilingual (EN / BM) "Choose a new password" page. Matches Lejar.ai's guard: visiting without an active Supabase recovery session redirects to `/auth/forgot?error=reset_link_needed`. Validates minimum 8 characters + password confirmation match, updates password via `supabase.auth.updateUser({ password })`, and redirects to `/login?notice=password_updated`. |
| `/terms` | Bilingual (EN / BM) Malaysian SME Terms of Service covering record ownership, 7-year LHDN retention, MPERS / SST-02 / MyInvois responsibility, team security, AI Inbox / Ask Kira draft review, and Malaysian governing law. |
| `/privacy` | Bilingual (EN / BM) Privacy Policy aligned with Malaysia's PDPA 2010, covering collected data, RLS isolation, SHA-256 secret hashing, Ask Kira memory controls, JSON export, organisation deletion, and cookies. |

## 2. Code Layout

- `src/shared/auth/notices.ts` — Added `password_mismatch`, `reset_failed`, and `password_updated` in EN and BM alongside existing `reset_link_needed` and `reset_sent`.
- `src/features/auth-recovery/` (`copy.ts`, `actions.ts`, `forgot-page.tsx`, `reset-page.tsx`)
- `src/features/legal/legal-pages.tsx`
- App Router pages:
  - `src/app/auth/forgot/page.tsx`
  - `src/app/auth/reset/page.tsx`
  - `src/app/terms/page.tsx`
  - `src/app/privacy/page.tsx`
- `src/proxy.ts` already listed all 4 routes in `PUBLIC_PATHS`.

## 3. Verification

- `npx tsc --noEmit`, `npm run lint`, and `npx next build` passed with zero errors and zero warnings across all **95 routes**.
- Playwright E2E (`scratch/e2e33.js`) verified signed-out `/auth/reset` → `/auth/forgot?error=reset_link_needed`, BM/EN switching across `/auth/forgot`, `/terms`, and `/privacy`, password mismatch rejection on `/auth/reset`, real Supabase password update → `/login?notice=password_updated`, and signing back in with the updated password.
- Interactive browser click/hover audit confirmed `/login` → `Forgot password?` → `/auth/forgot`, `/auth/reset` guard, and `/signup` → `/terms` & `/privacy` (EN/BM) with `0` console errors, `0` HTTP `>= 400` responses, and `0` layout defects.

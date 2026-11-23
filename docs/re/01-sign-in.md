# Slice 1 — Sign in (`/login`)

Reverse engineered from **https://lejar.ai/login** with REA (`capture_browser_scenario`, headless
Chrome, 1440×900) and plain GET requests, on 2026-11-21. Lejar's `/new-org` (the page originally
asked for) needs a signed-in account, so a signed-out visit lands here: `307 → /login?next=%2Fnew-org`.

Legend: **Observed**: seen in a capture. **Inferred**: concluded from evidence, not seen directly.
**Assumed**: a design choice where Lejar's behaviour could not be seen.

## Stack (observed)

| Layer | Lejar | Evidence |
|---|---|---|
| Framework | Next.js App Router, React Server Components, Turbopack build | `_next/static/immutable/chunks/turbopack-*.js`, `self.__next_f` flight data, `$ACTION_ID_…` form fields |
| Language | TypeScript (inferred: Next.js default; bundles are compiled JS) | — |
| Mutations | Server Actions (multipart POST to the page, `x-action-redirect` response header) | network capture, steps 5 and 9 |
| Styling | Tailwind CSS v4 (`color-mix(in oklab, …)`, `@theme` `--color-*` tokens) | `34gq8fim6ndn0.css` |
| Fonts | Geist / Geist Mono (`next/font`) | `Geist_Variable-*.woff2` |
| Auth | Supabase Auth, PKCE (project `xpmwknvaziegnccejjki`) with Google OAuth | `…supabase.co/auth/v1/authorize?provider=google&code_challenge_method=s256` |
| Hosting | Vercel | `x-vercel-id`, `x-vercel-cache` headers |
| Analytics | PostHog, proxied at `/_lj` | `/_lj/static/1.438.7/*.js` (not rebuilt in Kira) |

Kira uses the same stack: Next.js 16 (App Router, Server Actions, proxy), TypeScript,
Tailwind v4 and Supabase Auth via `@supabase/ssr`.

## Page (observed)

Server-rendered. The only client component is `SubmitButton` (Lejar chunk 635793: `useFormStatus`,
so it is `disabled` and `aria-busy` while the form's action runs). Order, top to bottom:

1. Language switch `BM / EN` (top right, 44px touch targets). The current language is a `<span aria-current>`;
   the other one is a link to the same URL with `lang=ms` added or removed, keeping `next` and `error`.
2. Logo (30px mark + wordmark, links to `/`; in BM to `/ms`, label "Lejar, laman utama").
3. Card (`max-w-[400px]`, `rounded-2xl`, `p-7`): **Sign in** / "Enter your email, then choose how to sign in."
4. Optional banner: red for `?error=`, brand colour for `?notice=`.
5. If there is an error: "Just signed up? You may need to confirm your email first. *Resend the confirmation link*." (`/auth/confirm`).
6. One form: hidden `next` (default `/post-auth`), hidden `lang` in BM, Email (`required`, `autofocus` unless an error is shown),
   **Send magic link** (primary) · "or" · Password (not `required`) · **Sign in with password** (secondary) · *Forgot password?*
   The two submit buttons post to two different Server Actions (`formAction`).
7. Divider, then a second form: hidden `next`, `returnTo=/login`, `lang` → **Continue with Google**.
8. Under the card: "New to Lejar? *Create your account*" (`/signup`, carries `lang` and a non-default `next`).

After any redirect the email field is empty (the email is not put back into the form).

## Behaviour (observed unless marked)

| Action | Result |
|---|---|
| Either button with an empty email | Browser's `required` check; no request |
| Password button, email but no password | `/login?error=credentials_missing` "Enter your email and password." |
| Password button, wrong password (`kira-test@example.com`) | `/login?error=invalid_credentials` "Invalid email or password." |
| Password, correct | redirect to `next` (**inferred**) |
| Magic link to `kira-test@example.com` | `/login?error=link_failed` "We could not send the sign-in link just now…" (Supabase rejected the address) |
| Magic link sent | `/login?notice=link_sent` "Check your email for the magic link." (text **observed** via URL; the redirect itself is **inferred**) |
| Google | Server Action redirect to `https://<ref>.supabase.co/auth/v1/authorize?provider=google&redirect_to=https://lejar.ai/auth/callback?next=%2Fpost-auth&code_challenge=…&code_challenge_method=s256` → Google (scopes `email profile`) |
| `/auth/callback` with no code | `307 → /login?error=link_invalid` |
| Any non-public path while signed out | `307 → /login?next=<path>` |

Public paths: `/`, `/login`, `/signup`, `/auth/forgot`, `/auth/confirm`, `/auth/callback`, `/auth/reset`
(`/auth/reset` without a token → `/auth/forgot?error=reset_link_needed`).

### Error and notice codes (every auth page; EN and BM texts in `src/shared/auth/notices.ts`)

Errors: `credentials_missing`, `email_missing`, `invalid_credentials`, `link_failed`, `link_expired`,
`link_invalid`, `google_failed`, `weak_password`, `reset_link_needed`. Notices: `link_sent`, `reset_sent`.
Found by requesting `/login?error=<guess>`; codes that were tried and show nothing include `otp_expired`,
`access_denied`, `rate_limited`, `email_not_confirmed`, `invalid_email`, `session_expired`.

## Kira design choices (assumed)

- **Magic link never creates an account** (`shouldCreateUser: false`); accounts come from `/signup`, which asks for the Terms first.
- **`email_not_confirmed`** shows "Invalid email or password.": the hint under the banner already covers it, and it does not reveal which emails have accounts.
- **Callback errors**: Supabase `otp_expired` / `flow_state_expired` → `link_expired`; anything else → `link_invalid`.
- **Signed-in users opening `/login`** still see the page (Lejar's behaviour was not checked).
- **`/`** redirects to `/login` (Lejar's `/` is its marketing site).
- **`/post-auth`** is a placeholder ("You are signed in" + Sign out) until the `/new-org` slice records what Lejar does there.
- `<main lang="ms">` in BM (Lejar keeps `lang="en"` on `<html>`).

## Look: Lejar layout, Kira palette

Class names are Lejar's, so spacing and sizes match (REA screenshots of both apps at 1440×900:
same card box 521–919 px, title at y 273, fields and buttons at the same y positions). Token values are Kira's:

| Token | Lejar | Kira |
|---|---|---|
| auth page background | `bg-bg` `#fafaf7` | white + Digits' sign-in glow behind the card (`.auth-glow`, from my.digits.com/login via Kira's `.ka-glow`; user's choice, 2026-11-21) |
| `bg` (app background token) | `#fafaf7` | `#f5f6f9` (secondary-05) |
| `ink` | `#0e1116` | `#223358` (secondary-dark) |
| primary button | `bg-ink`, white text | `#00d3c7` turquoise (Kira accent-turquoise), navy text, hover `#00c4b8` (user's choice, 2026-11-21); on /login all three buttons (magic link, password, Google) use it, where Lejar has one dark and two white |
| `ink-2` | `#3b4250` | `#32497f` (secondary) |
| `muted` | `#5c6370` | `#5f6f96` (Kira's `#7080a5` is 3.95:1 on white, below WCAG AA) |
| `border` / `border-strong` | `#e8e6de` / `#d7d4c9` | `#eaedf2` / `#c1c8d9` |
| `brand` | `#1f6f4e` | `#00a69c` |
| font | Geist | Avenir (Kira's files) |
| logo | lejar.ai mark + wordmark | KiraMark + "Kira" |

## Not covered yet

- Lejar's `/post-auth` routing and `/new-org` (need a signed-in session).
- Rate limiting and lockout behaviour (not probed, to avoid hammering Lejar's service).
- `/signup`, `/auth/forgot`, `/auth/confirm`, `/auth/reset`: recorded (text, fields, action IDs) but built in later slices.

# Slice 2 — Sign up (`/signup`, `/auth/confirm`)

Reverse engineered from **https://lejar.ai/signup** and **https://lejar.ai/auth/confirm** with REA
(`capture_browser_scenario`, headless Chrome, 1440×900) and plain GET requests, 2026-11-21.
Stack and conventions: see [01-sign-in.md](01-sign-in.md).

Legend: **Observed**: seen in a capture. **Inferred**: concluded from evidence. **Assumed**: Kira's choice.

## `/signup` page (observed)

Same frame as `/login` (language switch, logo, 400px card). Card contents in order:

1. **Create your account** / "14 days of Pro, free. After that you stay on Free unless you choose a plan. No card needed."
2. Optional red banner (`?error=`). No "Just signed up?" hint here (unlike `/login`).
3. One form: hidden `next` (default `/post-auth`), hidden `lang` in BM,
   **Work email** (`required`, `autofocus`),
   checkbox `tos` (`required`): "I agree to the *Terms of Service* (`/terms`) and *Privacy Policy* (`/privacy`)."
   with "We may email you product tips, at most once a week. You can unsubscribe at any time." under it,
   **Send sign-in link** (primary), "or", **Password** (`minlength=8`, `autocomplete=new-password`,
   help line "At least 8 characters." linked by `aria-describedby`), **Create account** (secondary).
   The two submit buttons post to two different Server Actions.
4. Divider, then the Google form: the **same Server Action as `/login`** with `returnTo=/signup` → **Sign up with Google**,
   followed by "By continuing with Google, you agree to the Terms of Service and Privacy Policy. We may email you product tips…".
5. Under the card: "Already have an account? *Sign in*" (`/login`, carries `lang` only).

Metadata: title "Create your free account · lejar.ai"; **indexable** (no `noindex`, unlike `/login`).

### `?notice=link_sent`: "Check your email" (observed)

The form is replaced (and the language switch disappears): **Check your email** / "We sent you a sign-in link. Open it to get started." /
"It can take a minute to arrive. Check your spam folder if you do not see it. Only the newest link works, so wait before you ask
for another one." / *Use a different email or send again* (`/signup`, keeps `lang` and `next`).

## Behaviour

| Action | Result |
|---|---|
| Either button with the Terms box unticked | Browser blocks the submit (`required`); no request (**observed**) |
| Create account with a 5-character password | Browser blocks it (`minlength`); no request (**observed**) |
| Create account with no password | `/signup?error=password_missing`; the email is **filled in again**, the Terms box is cleared (**observed**) |
| Send sign-in link, success | `/signup?notice=link_sent` (**inferred**: the page exists; not run, it would create a Lejar account) |
| Create account, success | `/auth/confirm` "Confirm your email" (**inferred**: not run for the same reason) |

The email comes back after an error although the URL does not carry it and the page has no client component, so the
server must keep it between the redirect and the next render (**inferred**; Kira uses a 2-minute HttpOnly cookie).

### Error codes shown on `/signup` (observed)

`email_missing`, `password_missing` ("Enter a password of at least 8 characters, or get a sign-in link by email instead."),
`password_short` ("Your password needs at least 8 characters."), `weak_password`, `account_exists`
("An account with this email already exists. Sign in instead."), `email_invalid`
("That email address does not look right. Check it and try again."). EN and BM texts in `src/shared/auth/notices.ts`.
Lejar's `/signup` shows **nothing** for `link_failed` or `google_failed`, although its actions can send them there.

## `/auth/confirm` (observed)

No language switch (but `?lang=ms` works). **Confirm your email** / "We sent a confirmation link to your inbox. Click it to finish
setting up your account." / banner / "It can take a minute to arrive. If you do not see it, check your spam folder." /
form (hidden `lang`): **Email** (`required`) + **Resend confirmation link** (secondary) / "Already confirmed? *Sign in*".
Shows the shared error list plus the notice `confirm_sent` "If that email needs confirming, a fresh link is on its way."

## Kira choices (assumed)

- **Supabase calls:** sign-in link = `signInWithOtp({ shouldCreateUser: true, data: { terms_accepted_at } })`;
  Create account = `signUp({ email, password, options: { emailRedirectTo: /auth/callback?next=…, data: { terms_accepted_at } } })`;
  resend = `auth.resend({ type: "signup" })`. All links come back through `/auth/callback` (slice 1).
- **Error mapping:** `user_already_exists`/`email_exists`, or a sign-up that returns a user with no identities (Supabase's
  way of hiding existing accounts when email confirmation is on) → `account_exists`; `weak_password` → `weak_password`;
  `email_address_invalid` → `email_invalid`; anything else → `signup_failed` (Kira text) or `link_failed`.
- **Google from `/signup` records the Terms acceptance** (user's request, 2026-11-21). Lejar posts both Google buttons to one
  action, and the sign-up page says "By continuing with Google, you agree to the Terms…". Kira's shared action adds
  `&terms=1` to the callback URL only when `returnTo=/signup`; `/auth/callback` then saves `terms_accepted_at` with
  `updateUser` if the account has none (never overwrites). "Continue with Google" on `/login` records nothing.
  Verified with the fake auth server: login → no update; first sign-up → one update; second sign-up → none.
- **One-time Terms page for everyone else** (`/auth/terms`, user's choice 2026-11-21). Accounts that never saw a Terms
  checkbox (Google from `/login`, users added in the Supabase dashboard, accounts made before this change) have no
  `terms_accepted_at`. `src/proxy.ts` sends any signed-in page load (GET) from such an account to
  `/auth/terms?next=<page>`: "Before you continue", the signed-in email, the same checkbox as `/signup`, Continue, and
  "Not you? Sign out". Continue saves the date (never overwrites) and refreshes the session. The real browser test
  (2026-11-22) showed that the refreshed cookie from that Server Action did not reach the browser, so the user was sent
  back to the Terms page. Fix in `src/shared/supabase/proxy-session.ts`: when the token has no Terms date, the proxy
  asks the auth server once and, if the date exists, refreshes the session itself (also covers acceptance on another
  device). Lejar's login page has the same gap
  (no Terms text under its Google button); whether Lejar asks later could not be seen without an account.
  Verified with the fake auth server: Google from `/login` → `/auth/terms`; opening `/post-auth` → back to the Terms page;
  Continue unticked → blocked by the browser; ticked → one metadata update + one token refresh → `/post-auth`, no loop;
  "Sign up with Google" → straight to `/post-auth`.
- **Server checks the Terms box too** (`terms_required`, Kira text); the browser normally stops it first.
- **Kira's `/signup` shows every auth error**, including `link_failed` and `google_failed`, which Lejar silently drops.
- If email confirmation is turned off in Supabase, Create account signs the user in and goes to `next`.
- Resend always answers `confirm_sent` (does not reveal whether the email has an account), matching Lejar's wording.
- Look: all three sign-up buttons and the resend button are Kira turquoise; the checkbox uses Kira teal (`accent-brand`);
  white page with Digits' glow (see 01).

## Verified in Kira (2026-11-21)

- Against the user's Supabase project: Terms unticked and 5-character password blocked by the browser; no password →
  `?error=password_missing` with the email filled in again.
- Against a local fake Supabase Auth server (no real accounts or email): sign-in link (BM) → "Semak e-mel anda";
  weak password → `weak_password`; existing account → `account_exists`; new account → `/auth/confirm`;
  resend → `?notice=confirm_sent`. Requests carried `create_user: true`, `terms_accepted_at` and the callback URL.
- Layout: same element positions as lejar.ai/signup at 1440×900 (title y 198, email 301–335, buttons 426 / 609 / 686, footer 841).

## Not covered

- Lejar's real success screens after a sign-up (would need a real Lejar account).
- `/terms` and `/privacy` pages (linked; return 404 until built).

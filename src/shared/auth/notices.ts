import type { Lang } from "@/shared/i18n";

/**
 * Error and notice banners shared by every auth page (login, signup, forgot, confirm).
 * lejar.ai shows them from `?error=<code>` / `?notice=<code>`; each text below was read
 * from its server-rendered pages in both languages (2026-11-21). Unknown codes show nothing.
 */
export const AUTH_ERRORS = {
  credentials_missing: {
    en: "Enter your email and password.",
    ms: "Masukkan e-mel dan kata laluan anda.",
  },
  email_missing: {
    en: "Enter your email address.",
    ms: "Masukkan alamat e-mel anda.",
  },
  invalid_credentials: {
    en: "Invalid email or password.",
    ms: "E-mel atau kata laluan tidak sah.",
  },
  link_failed: {
    en: "We could not send the sign-in link just now. Please try again in a moment.",
    ms: "Kami tidak dapat menghantar pautan log masuk sekarang. Sila cuba lagi sebentar nanti.",
  },
  link_expired: {
    en: "This sign-in link has expired or was already used. Request a new one.",
    ms: "Pautan log masuk ini telah tamat tempoh atau sudah digunakan. Minta pautan baharu.",
  },
  link_invalid: {
    en: "This sign-in link is invalid or has already been used. Request a new one.",
    ms: "Pautan log masuk ini tidak sah atau sudah digunakan. Minta pautan baharu.",
  },
  google_failed: {
    en: "Could not start Google sign-in. Please try again.",
    ms: "Tidak dapat memulakan log masuk Google. Sila cuba lagi.",
  },
  weak_password: {
    en: "That password is too easy to guess. Choose a stronger one.",
    ms: "Kata laluan itu terlalu mudah diteka. Pilih kata laluan yang lebih kuat.",
  },
  reset_link_needed: {
    en: "Open the reset link from your email to continue.",
    ms: "Buka pautan tetapan semula daripada e-mel anda untuk meneruskan.",
  },
  // Sign-up (lejar.ai /signup and /auth/confirm, read 2026-11-21).
  password_missing: {
    en: "Enter a password of at least 8 characters, or get a sign-in link by email instead.",
    ms: "Masukkan kata laluan sekurang-kurangnya 8 aksara, atau minta pautan log masuk melalui e-mel.",
  },
  password_short: {
    en: "Your password needs at least 8 characters.",
    ms: "Kata laluan anda perlu sekurang-kurangnya 8 aksara.",
  },
  account_exists: {
    en: "An account with this email already exists. Sign in instead.",
    ms: "Akaun dengan e-mel ini sudah wujud. Sila log masuk.",
  },
  email_invalid: {
    en: "That email address does not look right. Check it and try again.",
    ms: "Alamat e-mel itu tidak sah. Semak dan cuba lagi.",
  },
  // Kira additions (no lejar.ai equivalent was found).
  terms_required: {
    en: "Please agree to the Terms of Service and Privacy Policy to continue.",
    ms: "Sila bersetuju dengan Terma Perkhidmatan dan Dasar Privasi untuk meneruskan.",
  },
  terms_failed: {
    en: "We could not save your answer just now. Please try again in a moment.",
    ms: "Kami tidak dapat menyimpan jawapan anda sekarang. Sila cuba lagi sebentar nanti.",
  },
  signup_failed: {
    en: "We could not create your account just now. Please try again in a moment.",
    ms: "Kami tidak dapat mencipta akaun anda sekarang. Sila cuba lagi sebentar nanti.",
  },
  password_mismatch: {
    en: "The passwords do not match.",
    ms: "Kata laluan tidak sepadan.",
  },
  reset_failed: {
    en: "We could not update your password just now. Request a new reset link and try again.",
    ms: "Kami tidak dapat mengemas kini kata laluan anda sekarang. Minta pautan tetapan semula baharu dan cuba lagi.",
  },
} as const satisfies Record<string, Record<Lang, string>>;

export const AUTH_NOTICES = {
  link_sent: {
    en: "Check your email for the magic link.",
    ms: "Semak e-mel anda untuk pautan log masuk.",
  },
  reset_sent: {
    en: "If that email has an account, a password reset link is on its way.",
    ms: "Jika e-mel itu mempunyai akaun, pautan tetapan semula kata laluan sedang dihantar.",
  },
  confirm_sent: {
    en: "If that email needs confirming, a fresh link is on its way.",
    ms: "Jika e-mel itu perlu disahkan, pautan baharu sedang dihantar.",
  },
  password_updated: {
    en: "Your password has been updated. Sign in with your new password.",
    ms: "Kata laluan anda telah dikemas kini. Log masuk dengan kata laluan baharu anda.",
  },
} as const satisfies Record<string, Record<Lang, string>>;

export type AuthErrorCode = keyof typeof AUTH_ERRORS;
export type AuthNoticeCode = keyof typeof AUTH_NOTICES;

export function errorText(code: string | undefined, lang: Lang): string | null {
  return code && code in AUTH_ERRORS ? AUTH_ERRORS[code as AuthErrorCode][lang] : null;
}

export function noticeText(code: string | undefined, lang: Lang): string | null {
  return code && code in AUTH_NOTICES ? AUTH_NOTICES[code as AuthNoticeCode][lang] : null;
}

import type { Lang } from "@/shared/i18n";

/**
 * /auth/terms text. Kira's own page (lejar.ai has no equivalent that could be observed), worded
 * like the sign-up page's Terms checkbox so the two agreements read the same.
 */
export const TERMS_COPY = {
  en: {
    metaTitle: "Accept the Terms",
    title: "Before you continue",
    subtitle: "Please accept Kira's Terms of Service and Privacy Policy to use your account.",
    signedInAs: "Signed in as",
    agreePrefix: "I agree to the",
    terms: "Terms of Service",
    and: "and",
    privacy: "Privacy Policy",
    tips: "We may email you product tips, at most once a week. You can unsubscribe at any time.",
    continue: "Continue",
    notYou: "Not you?",
    signOut: "Sign out",
  },
  ms: {
    metaTitle: "Terima Terma",
    title: "Sebelum anda meneruskan",
    subtitle: "Sila terima Terma Perkhidmatan dan Dasar Privasi Kira untuk menggunakan akaun anda.",
    signedInAs: "Log masuk sebagai",
    agreePrefix: "Saya bersetuju dengan",
    terms: "Terma Perkhidmatan",
    and: "dan",
    privacy: "Dasar Privasi",
    tips: "Kami mungkin menghantar tip produk melalui e-mel, paling kerap seminggu sekali. Anda boleh berhenti melanggan bila-bila masa.",
    continue: "Teruskan",
    notYou: "Bukan anda?",
    signOut: "Log keluar",
  },
} satisfies Record<Lang, Record<string, string>>;

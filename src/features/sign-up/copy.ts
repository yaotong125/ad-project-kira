import type { Lang } from "@/shared/i18n";

/** /signup and /auth/confirm text: lejar.ai's EN and BM wording, "Lejar" replaced by "Kira". */
export const SIGNUP_COPY = {
  en: {
    metaTitle: "Create your free account",
    metaDescription:
      "Create your Kira account: accounting for Malaysian companies. Start with 14 days of Pro, free. No card required.",
    title: "Create your account",
    subtitle: "14 days of Pro, free. After that you stay on Free unless you choose a plan. No card needed.",
    email: "Work email",
    emailPlaceholder: "you@company.com",
    agreePrefix: "I agree to the",
    terms: "Terms of Service",
    and: "and",
    privacy: "Privacy Policy",
    tips: "We may email you product tips, at most once a week. You can unsubscribe at any time.",
    sendLink: "Send sign-in link",
    or: "or",
    password: "Password",
    passwordPlaceholder: "Create a password",
    passwordHint: "At least 8 characters.",
    createAccount: "Create account",
    google: "Sign up with Google",
    googlePrefix: "By continuing with Google, you agree to the",
    haveAccount: "Already have an account?",
    signIn: "Sign in",
    // "Check your email" (after the sign-in link is sent)
    sentTitle: "Check your email",
    sentSubtitle: "We sent you a sign-in link. Open it to get started.",
    sentBody:
      "It can take a minute to arrive. Check your spam folder if you do not see it. Only the newest link works, so wait before you ask for another one.",
    sentAgain: "Use a different email or send again",
  },
  ms: {
    metaTitle: "Cipta akaun percuma anda",
    metaDescription:
      "Cipta akaun Kira anda: perakaunan untuk syarikat Malaysia. Mulakan dengan 14 hari Pro, percuma. Tiada kad diperlukan.",
    title: "Cipta akaun anda",
    subtitle: "14 hari Pro, percuma. Selepas itu anda kekal pada Percuma melainkan anda pilih pelan. Tiada kad diperlukan.",
    email: "E-mel kerja",
    emailPlaceholder: "anda@syarikat.com",
    agreePrefix: "Saya bersetuju dengan",
    terms: "Terma Perkhidmatan",
    and: "dan",
    privacy: "Dasar Privasi",
    tips: "Kami mungkin menghantar tip produk melalui e-mel, paling kerap seminggu sekali. Anda boleh berhenti melanggan bila-bila masa.",
    sendLink: "Hantar pautan log masuk",
    or: "atau",
    password: "Kata laluan",
    passwordPlaceholder: "Cipta kata laluan",
    passwordHint: "Sekurang-kurangnya 8 aksara.",
    createAccount: "Cipta akaun",
    google: "Daftar dengan Google",
    googlePrefix: "Dengan meneruskan dengan Google, anda bersetuju dengan",
    haveAccount: "Sudah ada akaun?",
    signIn: "Log masuk",
    sentTitle: "Semak e-mel anda",
    sentSubtitle: "Kami telah menghantar pautan log masuk. Buka pautan itu untuk bermula.",
    sentBody:
      "Ia mungkin mengambil masa seminit. Semak folder spam jika tiada. Hanya pautan terbaharu yang berfungsi, jadi sila tunggu sebelum meminta pautan lain.",
    sentAgain: "Guna e-mel lain atau hantar semula",
  },
} satisfies Record<Lang, Record<string, string>>;

export const CONFIRM_COPY = {
  en: {
    metaTitle: "Confirm your email",
    title: "Confirm your email",
    subtitle: "We sent a confirmation link to your inbox. Click it to finish setting up your account.",
    body: "It can take a minute to arrive. If you do not see it, check your spam folder.",
    email: "Email",
    emailPlaceholder: "you@company.com",
    resend: "Resend confirmation link",
    already: "Already confirmed?",
    signIn: "Sign in",
  },
  ms: {
    metaTitle: "Sahkan e-mel anda",
    title: "Sahkan e-mel anda",
    subtitle: "Kami telah menghantar pautan pengesahan ke peti masuk anda. Klik pautan itu untuk melengkapkan persediaan akaun anda.",
    body: "Ia mungkin mengambil masa seminit. Jika tiada, semak folder spam anda.",
    email: "E-mel",
    emailPlaceholder: "anda@syarikat.com",
    resend: "Hantar semula pautan pengesahan",
    already: "Sudah disahkan?",
    signIn: "Log masuk",
  },
} satisfies Record<Lang, Record<string, string>>;

import type { Lang } from "@/shared/i18n";

/** Login page text: lejar.ai's EN and BM wording, with "Lejar" replaced by "Kira". */
export const LOGIN_COPY: Record<
  Lang,
  {
    metaTitle: string;
    metaDescription: string;
    title: string;
    subtitle: string;
    confirmHint: string;
    confirmLink: string;
    email: string;
    emailPlaceholder: string;
    sendMagicLink: string;
    or: string;
    password: string;
    passwordPlaceholder: string;
    signInWithPassword: string;
    forgotPassword: string;
    continueWithGoogle: string;
    newHere: string;
    createAccount: string;
  }
> = {
  en: {
    metaTitle: "Sign in",
    metaDescription: "Sign in to your Kira account to manage your Malaysian company books.",
    title: "Sign in",
    subtitle: "Enter your email, then choose how to sign in.",
    confirmHint: "Just signed up? You may need to confirm your email first.",
    confirmLink: "Resend the confirmation link",
    email: "Email",
    emailPlaceholder: "you@company.com",
    sendMagicLink: "Send magic link",
    or: "or",
    password: "Password",
    passwordPlaceholder: "Your password",
    signInWithPassword: "Sign in with password",
    forgotPassword: "Forgot password?",
    continueWithGoogle: "Continue with Google",
    newHere: "New to Kira?",
    createAccount: "Create your account",
  },
  ms: {
    metaTitle: "Log masuk",
    metaDescription: "Log masuk ke akaun Kira anda untuk mengurus buku syarikat Malaysia anda.",
    title: "Log masuk",
    subtitle: "Masukkan e-mel anda, kemudian pilih cara untuk log masuk.",
    confirmHint: "Baru mendaftar? Anda mungkin perlu mengesahkan e-mel anda dahulu.",
    confirmLink: "Hantar semula pautan pengesahan",
    email: "E-mel",
    emailPlaceholder: "anda@syarikat.com",
    sendMagicLink: "Hantar pautan log masuk",
    or: "atau",
    password: "Kata laluan",
    passwordPlaceholder: "Kata laluan anda",
    signInWithPassword: "Log masuk dengan kata laluan",
    forgotPassword: "Lupa kata laluan?",
    continueWithGoogle: "Teruskan dengan Google",
    newHere: "Baru menggunakan Kira?",
    createAccount: "Cipta akaun anda",
  },
};

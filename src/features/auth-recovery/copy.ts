import type { Lang } from "@/shared/i18n";

export const FORGOT_COPY = {
  en: {
    metaTitle: "Reset password",
    title: "Reset your password",
    subtitle: "Enter your email address and we will send you a link to set a new password.",
    email: "Email",
    emailPlaceholder: "you@company.com.my",
    submit: "Send reset link",
    remember: "Remembered your password?",
    signIn: "Back to sign in",
  },
  ms: {
    metaTitle: "Tetapkan semula kata laluan",
    title: "Tetapkan semula kata laluan",
    subtitle: "Masukkan alamat e-mel anda dan kami akan menghantar pautan untuk menetapkan kata laluan baharu.",
    email: "E-mel",
    emailPlaceholder: "anda@syarikat.com.my",
    submit: "Hantar pautan tetapan semula",
    remember: "Ingat kata laluan anda?",
    signIn: "Kembali ke log masuk",
  },
} as const satisfies Record<Lang, Record<string, string>>;

export const RESET_COPY = {
  en: {
    metaTitle: "Choose a new password",
    title: "Choose a new password",
    subtitle: "Enter a new password of at least 8 characters for your Kira account.",
    password: "New password",
    passwordPlaceholder: "At least 8 characters",
    confirm: "Confirm new password",
    confirmPlaceholder: "Repeat new password",
    submit: "Update password",
    back: "Back to sign in",
  },
  ms: {
    metaTitle: "Pilih kata laluan baharu",
    title: "Pilih kata laluan baharu",
    subtitle: "Masukkan kata laluan baharu sekurang-kurangnya 8 aksara untuk akaun Kira anda.",
    password: "Kata laluan baharu",
    passwordPlaceholder: "Sekurang-kurangnya 8 aksara",
    confirm: "Sahkan kata laluan baharu",
    confirmPlaceholder: "Ulang kata laluan baharu",
    submit: "Kemas kini kata laluan",
    back: "Kembali ke log masuk",
  },
} as const satisfies Record<Lang, Record<string, string>>;

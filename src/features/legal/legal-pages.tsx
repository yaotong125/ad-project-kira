import Link from "next/link";
import { href, type Lang } from "@/shared/i18n";
import { KiraLogo } from "@/shared/ui/kira-logo";

type Section = { heading: string; paragraphs: string[] };

const TERMS: Record<Lang, { metaTitle: string; title: string; updated: string; intro: string; sections: Section[]; otherLabel: string; signIn: string; signUp: string }> = {
  en: {
    metaTitle: "Terms of Service",
    title: "Terms of Service",
    updated: "Last updated: 23 November 2026",
    intro:
      "These Terms of Service govern your access to and use of Kira, our Malaysian SME accounting and bookkeeping software. By creating an account or accessing an organisation in Kira, you agree to these terms on behalf of yourself and your business.",
    sections: [
      {
        heading: "1. Your accounting records",
        paragraphs: [
          "You retain full ownership of all financial data, invoices, bills, bank statements, contacts, attachments, and ledger entries you upload or create in Kira.",
          "Malaysian tax law (Income Tax Act 1967 and Service Tax / Sales Tax Acts) generally requires businesses to retain accounting and tax records for at least 7 years. You may export your complete organisation records as JSON or PDF/CSV reports at any time from Settings → Data & AI before closing or deleting an organisation.",
        ],
      },
      {
        heading: "2. Accounting, SST & e-Invois responsibility",
        paragraphs: [
          "Kira provides tools designed around Malaysian Private Entities Reporting Standard (MPERS), Royal Malaysian Customs Department (RMCD) SST-02 reporting, and LHDN MyInvois v1.1 document formatting.",
          "Kira is accounting software and does not constitute licensed tax, audit, legal, or chartered accounting advice. You remain responsible for verifying draft entries (including AI-extracted drafts), reviewing tax calculations, and submitting statutory filings on time.",
        ],
      },
      {
        heading: "3. Team access & security",
        paragraphs: [
          "Organisation Owners and Admins are responsible for managing team memberships, role permissions (Owner, Admin, Bookkeeper, Viewer), API keys, and webhook endpoints.",
          "Keep your password, API keys, and signing secrets confidential. Notify us promptly if you suspect unauthorised access to your account.",
        ],
      },
      {
        heading: "4. AI features",
        paragraphs: [
          "AI Inbox document extraction and Ask Kira assistant features process your uploaded documents and ledger queries strictly to prepare draft transactions and answer your questions. Drafts are never posted to your general ledger until you review and record them.",
        ],
      },
      {
        heading: "5. Acceptable use & availability",
        paragraphs: [
          "You agree not to misuse the platform, attempt to bypass organisation isolation or access controls, or upload unlawful material. We aim for high availability and maintain automated backups, but occasional scheduled maintenance may occur.",
        ],
      },
      {
        heading: "6. Governing law",
        paragraphs: [
          "These terms are governed by the laws of Malaysia, and any disputes shall be subject to the jurisdiction of the courts of Malaysia.",
        ],
      },
    ],
    otherLabel: "Privacy Policy",
    signIn: "Sign in",
    signUp: "Create account",
  },
  ms: {
    metaTitle: "Terma Perkhidmatan",
    title: "Terma Perkhidmatan",
    updated: "Kemas kini terakhir: 23 November 2026",
    intro:
      "Terma Perkhidmatan ini mengawal akses dan penggunaan anda terhadap Kira, perisian perakaunan dan simpan kira untuk PKS Malaysia. Dengan mencipta akaun atau mengakses organisasi dalam Kira, anda bersetuju dengan terma ini bagi pihak diri anda dan perniagaan anda.",
    sections: [
      {
        heading: "1. Rekod perakaunan anda",
        paragraphs: [
          "Anda mengekalkan pemilikan penuh ke atas semua data kewangan, invois, bil, penyata bank, kenalan, lampiran dan catatan lejar yang anda muat naik atau cipta dalam Kira.",
          "Undang-undang cukai Malaysia (Akta Cukai Pendapatan 1967 serta Akta Cukai Perkhidmatan dan Cukai Jualan) secara amnya menghendaki perniagaan menyimpan rekod perakaunan sekurang-kurangnya 7 tahun. Anda boleh mengeksport keseluruhan rekod organisasi anda dalam format JSON atau laporan PDF/CSV pada bila-bila masa melalui Tetapan → Data & AI.",
        ],
      },
      {
        heading: "2. Tanggungjawab perakaunan, SST & e-Invois",
        paragraphs: [
          "Kira menyediakan alat yang direka bentuk mengikut MPERS, pelaporan SST-02 JKDM, dan format dokumen e-Invois LHDN v1.1.",
          "Kira ialah perisian perakaunan dan bukan nasihat cukai, audit atau perakaunan bertauliah. Anda kekal bertanggungjawab menyemak draf catatan (termasuk draf AI) serta menyerahkan pemfailan berkanun tepat pada masanya.",
        ],
      },
      {
        heading: "3. Akses pasukan & keselamatan",
        paragraphs: [
          "Pemilik dan Pentadbir organisasi bertanggungjawab mengurus keahlian pasukan, kebenaran peranan (Pemilik, Pentadbir, Penyimpan Kira, Pemerhati), kunci API, dan titik akhir webhook.",
          "Rahsiakan kata laluan, kunci API dan rahsia tandatangan anda.",
        ],
      },
      {
        heading: "4. Ciri AI",
        paragraphs: [
          "Pengekstrakan dokumen AI Inbox dan pembantu Tanya Kira memproses dokumen dan pertanyaan lejar anda semata-mata untuk menyediakan draf transaksi dan menjawab soalan anda. Draf tidak akan diposkan ke lejar sehingga anda menyemak dan merekodkannya.",
        ],
      },
      {
        heading: "5. Penggunaan wajar & ketersediaan",
        paragraphs: [
          "Anda bersetuju untuk tidak menyalahgunakan platform, memintas kawalan akses organisasi, atau memuat naik kandungan yang menyalahi undang-undang.",
        ],
      },
      {
        heading: "6. Undang-undang yang terpakai",
        paragraphs: [
          "Terma ini ditadbir oleh undang-undang Malaysia dan tertakluk kepada bidang kuasa mahkamah di Malaysia.",
        ],
      },
    ],
    otherLabel: "Dasar Privasi",
    signIn: "Log masuk",
    signUp: "Cipta akaun",
  },
};

const PRIVACY: Record<Lang, { metaTitle: string; title: string; updated: string; intro: string; sections: Section[]; otherLabel: string; signIn: string; signUp: string }> = {
  en: {
    metaTitle: "Privacy Policy",
    title: "Privacy Policy",
    updated: "Last updated: 23 November 2026",
    intro:
      "Kira respects your privacy and handles personal and business data in accordance with the Malaysian Personal Data Protection Act 2010 (PDPA). This policy explains what we collect, why we collect it, and how you control it.",
    sections: [
      {
        heading: "1. Data we collect",
        paragraphs: [
          "Account details: your email address, sign-in method, language preference, and Terms acceptance timestamp.",
          "Organisation & accounting data: company registration details (SSM BRN, TIN, SST number), chart of accounts, invoices, bills, bank statements, receipts, inventory records, contacts, and uploaded supporting files.",
          "Audit & security logs: team invitation events, role changes, API key creation/revocation, and ledger posting history.",
        ],
      },
      {
        heading: "2. How we use your data",
        paragraphs: [
          "We process your data solely to operate Kira: maintaining your double-entry ledger, generating financial reports and SST-02 summaries, preparing e-Invois payloads, and powering AI Inbox extraction and Ask Kira queries when you trigger them.",
          "We do not sell your accounting or contact data, and we do not use your private financial records to train public foundation models.",
        ],
      },
      {
        heading: "3. Security & isolation",
        paragraphs: [
          "Every organisation's data is isolated at the database layer using PostgreSQL Row-Level Security (RLS). API keys and webhook signing secrets are stored strictly as one-way SHA-256 hashes; raw secrets are shown once on creation and never stored in plaintext.",
          "All traffic is encrypted in transit over TLS, and authentication uses Supabase Auth with PKCE.",
        ],
      },
      {
        heading: "4. AI memory, export & deletion",
        paragraphs: [
          "You can turn Ask Kira chat memory on or off, or permanently clear stored chat summaries, at any time in Settings → Data & AI.",
          "Organisation Owners and Admins can export a complete JSON copy of all organisation data at any time. Owners can permanently delete an organisation and all associated records from the Danger zone in Settings → Data & AI.",
        ],
      },
      {
        heading: "5. Cookies",
        paragraphs: [
          "Kira uses strictly necessary session cookies for authentication and a preference cookie (kira_lang) to remember your English / Bahasa Malaysia display language.",
        ],
      },
    ],
    otherLabel: "Terms of Service",
    signIn: "Sign in",
    signUp: "Create account",
  },
  ms: {
    metaTitle: "Dasar Privasi",
    title: "Dasar Privasi",
    updated: "Kemas kini terakhir: 23 November 2026",
    intro:
      "Kira menghormati privasi anda dan mengendalikan data peribadi serta perniagaan selaras dengan Akta Perlindungan Data Peribadi 2010 (PDPA) Malaysia. Dasar ini menerangkan data yang kami kumpul dan cara anda mengawalnya.",
    sections: [
      {
        heading: "1. Data yang kami kumpul",
        paragraphs: [
          "Butiran akaun: alamat e-mel, kaedah log masuk, pilihan bahasa, dan masa persetujuan Terma.",
          "Data organisasi & perakaunan: butiran pendaftaran syarikat (BRN SSM, TIN, nombor SST), carta akaun, invois, bil, penyata bank, resit, rekod inventori, kenalan dan dokumen sokongan yang dimuat naik.",
          "Log audit & keselamatan: rekod jemputan pasukan, perubahan peranan, kunci API dan sejarah catatan lejar.",
        ],
      },
      {
        heading: "2. Cara kami menggunakan data anda",
        paragraphs: [
          "Kami memproses data anda semata-mata untuk mengendalikan Kira: menyelenggara lejar catatan bergu, menjana laporan kewangan dan ringkasan SST-02, menyediakan muatan e-Invois, serta menjalankan AI Inbox dan Tanya Kira apabila anda menggunakannya.",
          "Kami tidak menjual data perakaunan atau kenalan anda, dan kami tidak menggunakan rekod kewangan peribadi anda untuk melatih model AI awam.",
        ],
      },
      {
        heading: "3. Keselamatan & pengasingan",
        paragraphs: [
          "Data setiap organisasi diasingkan pada peringkat pangkalan data menggunakan Row-Level Security (RLS) PostgreSQL. Kunci API dan rahsia webhook disimpan secara cincangan SHA-256 sehala sahaja.",
        ],
      },
      {
        heading: "4. Memori AI, eksport & pemadaman",
        paragraphs: [
          "Anda boleh mematikan memori sembang Tanya Kira atau memadam semua ringkasan sembang pada bila-bila masa melalui Tetapan → Data & AI.",
          "Pemilik dan Pentadbir boleh mengeksport salinan penuh JSON bagi semua data organisasi pada bila-bila masa, dan Pemilik boleh memadam organisasi secara kekal.",
        ],
      },
      {
        heading: "5. Kuki",
        paragraphs: [
          "Kira menggunakan kuki sesi yang diperlukan untuk pengesahan log masuk dan kuki pilihan (kira_lang) bagi mengingati bahasa paparan Bahasa Inggeris / Bahasa Malaysia anda.",
        ],
      },
    ],
    otherLabel: "Terma Perkhidmatan",
    signIn: "Log masuk",
    signUp: "Cipta akaun",
  },
};

export function getLegalMeta(kind: "terms" | "privacy", lang: Lang) {
  return (kind === "terms" ? TERMS : PRIVACY)[lang].metaTitle;
}

export function LegalDocumentPage({ kind, lang }: { kind: "terms" | "privacy"; lang: Lang }) {
  const doc = (kind === "terms" ? TERMS : PRIVACY)[lang];
  const path = kind === "terms" ? "/terms" : "/privacy";
  const otherPath = kind === "terms" ? "/privacy" : "/terms";
  const ms = lang === "ms" ? "ms" : undefined;

  return (
    <main lang={lang} className="min-h-dvh bg-bg px-6 py-10">
      <div className="mx-auto max-w-[740px]">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <KiraLogo lang={lang} />
          <div className="flex items-center gap-4 text-[13px]">
            <Link className="text-muted hover:text-ink" href={href(otherPath, { lang: ms })}>
              {doc.otherLabel}
            </Link>
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
              {lang === "ms" ? (
                <>
                  <span aria-current="true" className="text-ink">BM</span>
                  <span aria-hidden="true">/</span>
                  <Link href={href(path, {})} className="hover:text-ink">EN</Link>
                </>
              ) : (
                <>
                  <Link href={href(path, { lang: "ms" })} className="hover:text-ink">BM</Link>
                  <span aria-hidden="true">/</span>
                  <span aria-current="true" className="text-ink">EN</span>
                </>
              )}
            </div>
          </div>
        </header>

        <article className="rounded-[var(--radius-xl)] border border-border bg-surface p-7 shadow-[var(--shadow-sm)] sm:p-9">
          <h1 className="m-0 text-[24px] font-semibold tracking-[-0.02em] text-ink">{doc.title}</h1>
          <p className="m-0 mt-1 text-[12.5px] text-muted">{doc.updated}</p>
          <p className="mt-5 text-[13.5px] leading-[1.65] text-ink-2">{doc.intro}</p>

          <div className="mt-6 flex flex-col gap-6">
            {doc.sections.map((s) => (
              <section key={s.heading}>
                <h2 className="m-0 text-[15px] font-semibold text-ink">{s.heading}</h2>
                <div className="mt-2 flex flex-col gap-2.5 text-[13.5px] leading-[1.65] text-ink-2">
                  {s.paragraphs.map((p, i) => (
                    <p key={i} className="m-0">
                      {p}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted">
          <div className="flex items-center gap-4">
            <Link className="font-medium text-ink hover:underline" href={href("/login", { lang: ms })}>
              {doc.signIn}
            </Link>
            <Link className="font-medium text-ink hover:underline" href={href("/signup", { lang: ms })}>
              {doc.signUp}
            </Link>
          </div>
          <Link className="hover:text-ink hover:underline" href={href(otherPath, { lang: ms })}>
            {doc.otherLabel}
          </Link>
        </footer>
      </div>
    </main>
  );
}

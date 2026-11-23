import type { Lang } from "@/shared/i18n";
import type { Frequency, RecurringKind } from "./types";

/**
 * EN & BM copy extracted from lejar.ai's i18n bundle (0sbs3p0t4lr74.js) and help articles
 * (0-eyswk7vufsj.js), with "Lejar" renamed to "Kira".
 */
export function recurringCopy(kind: RecurringKind, lang: Lang) {
  const ms = lang === "ms";
  const inv = kind === "invoice";

  return {
    title: inv ? (ms ? "Invois berulang" : "Recurring invoices") : ms ? "Bil berulang" : "Recurring bills",
    subHint: inv
      ? ms
        ? "invois pelanggan berjadual"
        : "scheduled customer invoices"
      : ms
        ? "bil pembekal berjadual"
        : "scheduled supplier bills",
    learnToggle: ms ? "Ketahui tentang halaman ini" : "Learn about this page",
    helpLead: inv
      ? ms
        ? "Invois berulang ialah templat yang anda sediakan sekali untuk perkara yang anda bilkan kepada pelanggan yang sama berulang kali, seperti yuran tetap bulanan atau langganan. Kira menjana invois seterusnya mengikut jadual."
        : "A recurring invoice is a template you set up once, for something you bill the same customer over and over, like a monthly retainer or subscription. Kira generates the next invoice from it on schedule instead of you re-typing it."
      : ms
        ? "Bil berulang ialah templat yang anda sediakan sekali untuk perkara yang anda bayar kepada pembekal yang sama berulang kali, seperti sewa bulanan atau langganan perisian. Kira menjana bil seterusnya mengikut jadual."
        : "A recurring bill is a template you set up once, for something you pay the same supplier over and over, like monthly rent or a software subscription. Kira generates the next bill from it on schedule instead of you re-entering it.",
    helpBullets: inv
      ? [
          "Set the customer, lines, and how often it repeats: weekly, monthly, quarterly, or yearly.",
          "Click Generate due now to generate every invoice due on or before today immediately. Re-running is safe: an occurrence already generated is never invoiced twice.",
          "Turn auto-record on to have due invoices posted straight to the ledger, or leave it off to review each draft before recording.",
          "Pause a template to skip upcoming runs without losing it, or cancel one that has run its course. An end date or a fixed number of occurrences stops it automatically.",
        ]
      : [
          "Set the supplier, lines, and how often it repeats: weekly, monthly, quarterly, or yearly.",
          "Click Generate due now to generate every bill due on or before today immediately. Re-running is safe: an occurrence already generated is never billed twice.",
          "Turn auto-record on to have due bills posted straight to the ledger, or leave it off to review each draft before recording.",
          "Pause a template to skip upcoming runs without losing it, or cancel one that has run its course. An end date or a fixed number of occurrences stops it automatically.",
        ],
    statActive: ms ? "Templat aktif" : "Active templates",
    statNextRun: ms ? "Larian seterusnya" : "Next run",
    statNoneScheduled: ms ? "Tiada jadual" : "None scheduled",
    statGenerated: ms ? "Dijana bulan ini" : "Generated this month",
    statGeneratedSub: ms ? "Daripada lejar larian terkini" : "From the recent run ledger",
    setupTitle: inv
      ? ms
        ? "Sediakan invois berulang"
        : "Set up a recurring invoice"
      : ms
        ? "Sediakan bil berulang"
        : "Set up a recurring bill",
    setupLead: inv
      ? ms
        ? "Templat menjana invois pelanggan sebenar mengikut jadualnya. Dengan rekod automatik dihidupkan, setiap invois yang dijana akan direkodkan; jika tidak, ia disimpan sebagai draf untuk semakan."
        : "A template generates a real customer invoice on its schedule. With auto-record on, each generated invoice is recorded; otherwise it is left as a draft for review."
      : ms
        ? "Templat menjana bil pembekal sebenar mengikut jadualnya. Dengan rekod automatik dihidupkan, setiap bil yang dijana akan direkodkan; jika tidak, ia disimpan sebagai draf untuk semakan."
        : "A template generates a real supplier bill on its schedule. With auto-record on, each generated bill is recorded; otherwise it is left as a draft for review.",
    generateTitle: inv
      ? ms
        ? "Jana invois matang"
        : "Generate due invoices"
      : ms
        ? "Jana bil matang"
        : "Generate due bills",
    generateLead: inv
      ? ms
        ? "Menjana setiap invois yang matang pada atau sebelum hari ini bagi seluruh organisasi ini. Menjalankan semula adalah selamat: kejadian yang sudah dijana tidak akan diinvois dua kali."
        : "Generates every invoice due on or before today across this organization. Re-running is safe: an occurrence already generated is never invoiced twice."
      : ms
        ? "Menjana setiap bil yang matang pada atau sebelum hari ini bagi seluruh organisasi ini. Menjalankan semula adalah selamat: kejadian yang sudah dijana tidak akan dibilkan dua kali."
        : "Generates every bill due on or before today across this organization. Re-running is safe: an occurrence already generated is never billed twice.",
    generateNow: ms ? "Jana yang matang sekarang" : "Generate due now",
    generating: ms ? "Menjana..." : "Generating...",
    templatesHeading: ms ? "Templat" : "Templates",
    emptyTitle: inv
      ? ms
        ? "Belum ada invois berulang"
        : "No recurring invoices yet"
      : ms
        ? "Belum ada bil berulang"
        : "No recurring bills yet",
    emptyBody: inv
      ? ms
        ? "Sediakan invois berulang di atas untuk berhenti menaip semula langganan bulanan dan yuran tetap."
        : "Set up a recurring invoice above to stop re-keying monthly subscriptions and retainers."
      : ms
        ? "Sediakan bil berulang di atas untuk berhenti menaip semula sewa bulanan dan langganan."
        : "Set up a recurring bill above to stop re-keying monthly rent and subscriptions.",
    thTemplate: ms ? "Templat" : "Template",
    thParty: inv ? (ms ? "Pelanggan" : "Customer") : ms ? "Pembekal" : "Supplier",
    thFrequency: ms ? "Kekerapan" : "Frequency",
    thNextRun: ms ? "Larian seterusnya" : "Next run",
    thAmount: ms ? "Amaun / larian" : "Amount / run",
    thRecording: ms ? "Rakaman" : "Recording",
    thStatus: ms ? "Status" : "Status",
    thControls: ms ? "Kawalan" : "Controls",
    autoRecord: ms ? "Rekod automatik" : "Auto-record",
    draft: ms ? "Draf" : "Draft",
    recorded: ms ? "Direkodkan" : "Recorded",
    failed: ms ? "Gagal" : "Failed",
    runsHeading: ms ? "Larian terkini" : "Recent runs",
    runsEmptyTitle: ms ? "Belum ada larian" : "No runs yet",
    runsEmptyBody: inv
      ? ms
        ? "Invois yang dijana muncul di sini sebaik sahaja templat berjalan, secara manual atau mengikut jadual."
        : "Generated invoices appear here once a template fires, manually or on its schedule."
      : ms
        ? "Bil yang dijana muncul di sini sebaik sahaja templat berjalan, secara manual atau mengikut jadual."
        : "Generated bills appear here once a template fires, manually or on its schedule.",
    thScheduled: ms ? "Tarikh jadual" : "Scheduled date",
    thDoc: inv ? (ms ? "Invois" : "Invoice") : ms ? "Bil" : "Bill",
    thDetail: ms ? "Perincian" : "Detail",
    viewDoc: inv ? (ms ? "Lihat invois" : "View invoice") : ms ? "Lihat bil" : "View bill",
    pause: ms ? "Jeda" : "Pause",
    resume: ms ? "Sambung" : "Resume",
    cancel: ms ? "Batal" : "Cancel",
    noAccounts: inv
      ? ms
        ? "Tambah akaun hasil pada carta akaun sebelum menyediakan invois berulang."
        : "Add a revenue account to the chart of accounts before setting up a recurring invoice."
      : ms
        ? "Tambah akaun perbelanjaan atau aset pada carta akaun sebelum menyediakan bil berulang."
        : "Add an expense or asset account to the chart of accounts before setting up a recurring bill.",
    templateName: ms ? "Nama templat" : "Template name",
    templateNamePlaceholder: inv
      ? ms
        ? "cth. Yuran tetap bulanan - Acme"
        : "e.g. Monthly retainer - Acme"
      : ms
        ? "cth. Sewa pejabat bulanan"
        : "e.g. Monthly office rent",
    partyHint: inv
      ? ms
        ? "Cari, atau taip nama baharu untuk menambah pelanggan."
        : "Search, or type a new name to add a customer."
      : ms
        ? "Cari, atau taip nama baharu untuk menambah pembekal."
        : "Search, or type a new name to add a supplier.",
    partyPlaceholder: inv
      ? ms
        ? "Cari atau tambah pelanggan..."
        : "Search or add a customer..."
      : ms
        ? "Cari atau tambah pembekal..."
        : "Search or add a supplier...",
    frequency: ms ? "Kekerapan" : "Frequency",
    every: ms ? "Setiap" : "Every",
    everyHint: ms ? "Berulang setiap N tempoh" : "Repeats every N periods",
    startDate: ms ? "Tarikh mula" : "Start date",
    startDateHint: inv ? (ms ? "Tarikh invois pertama" : "First invoice date") : ms ? "Tarikh bil pertama" : "First bill date",
    endDate: ms ? "Tarikh tamat" : "End date",
    endDateHint: ms ? "Pilihan - biarkan kosong jika tiada tarikh tamat" : "Optional - leave blank for no end",
    occurrences: ms ? "Had kejadian" : "Occurrences limit",
    occurrencesHint: inv
      ? ms
        ? "Pilihan - berhenti selepas bilangan invois ini"
        : "Optional - stop after this many invoices"
      : ms
        ? "Pilihan - berhenti selepas bilangan bil ini"
        : "Optional - stop after this many bills",
    dueOffset: ms ? "Tempoh tarikh akhir (hari)" : "Due-date offset (days)",
    dueOffsetHint: inv
      ? ms
        ? "Hari selepas tarikh invois"
        : "Days after the invoice date"
      : ms
        ? "Hari selepas tarikh bil"
        : "Days after the bill date",
    prefix: ms ? "Awalan nombor" : "Number prefix",
    prefixHint: inv
      ? ms
        ? "Nombor invois = awalan + tarikh"
        : "Invoice number = prefix + date"
      : ms
        ? "Nombor bil = awalan + tarikh"
        : "Bill number = prefix + date",
    autoRecordHint: inv
      ? ms
        ? "Rekod setiap invois yang dijana"
        : "Record each generated invoice"
      : ms
        ? "Rekod setiap bil yang dijana"
        : "Record each generated bill",
    recordAutomatically: ms ? "Rekod secara automatik" : "Record automatically",
    lines: ms ? "Baris" : "Lines",
    description: ms ? "Keterangan" : "Description",
    account: ms ? "Akaun" : "Account",
    amount: ms ? "Amaun (RM)" : "Amount (RM)",
    tax: ms ? "Cukai" : "Tax",
    remove: ms ? "Buang" : "Remove",
    addLine: ms ? "Tambah baris" : "Add line",
    notes: ms ? "Nota" : "Notes",
    notesHint: inv
      ? ms
        ? "Pilihan - disalin ke setiap invois yang dijana"
        : "Optional - copied onto every generated invoice"
      : ms
        ? "Pilihan - disalin ke setiap bil yang dijana"
        : "Optional - copied onto every generated bill",
    notesPlaceholder: ms ? "pilihan" : "optional",
    saving: ms ? "Menyimpan..." : "Saving...",
    createBtn: inv
      ? ms
        ? "Cipta invois berulang"
        : "Create recurring invoice"
      : ms
        ? "Cipta bil berulang"
        : "Create recurring bill",
    taxOptions: [
      { value: "none", label: ms ? "Tiada SST" : "No SST" },
      { value: "sst_6", label: "SST 6%" },
      { value: "sst_8", label: "SST 8%" },
      { value: "sales_5", label: ms ? "Cukai jualan 5%" : "Sales tax 5%" },
      { value: "sales_10", label: ms ? "Cukai jualan 10%" : "Sales tax 10%" },
      { value: "exempt", label: ms ? "Dikecualikan" : "Exempt" },
    ],
    freqLabel(f: Frequency, n: number) {
      if (n <= 1) {
        const one: Record<Frequency, [string, string]> = {
          weekly: ["Weekly", "Mingguan"],
          monthly: ["Monthly", "Bulanan"],
          quarterly: ["Quarterly", "Suku tahunan"],
          yearly: ["Yearly", "Tahunan"],
        };
        return one[f][ms ? 1 : 0];
      }
      const multi: Record<Frequency, [string, string]> = {
        weekly: [`Every ${n} weeks`, `Setiap ${n} minggu`],
        monthly: [`Every ${n} months`, `Setiap ${n} bulan`],
        quarterly: [`Every ${n} quarters`, `Setiap ${n} suku tahun`],
        yearly: [`Every ${n} years`, `Setiap ${n} tahun`],
      };
      return multi[f][ms ? 1 : 0];
    },
    resultText(evaluated: number, generated: number, recorded: number) {
      if (ms) {
        const rec = recorded > 0 ? `, ${recorded} direkodkan` : "";
        return `Dinilai ${evaluated} templat: dijana ${generated} ${inv ? "invois" : "bil"}${rec}.`;
      }
      const tWord = evaluated === 1 ? "1 template" : `${evaluated} templates`;
      const dWord = inv
        ? generated === 1
          ? "1 invoice"
          : `${generated} invoices`
        : generated === 1
          ? "1 bill"
          : `${generated} bills`;
      const rec = recorded > 0 ? `, ${recorded} recorded` : "";
      return `Evaluated ${tWord}: generated ${dWord}${rec}.`;
    },
  };
}

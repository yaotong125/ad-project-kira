/** lejar.ai's customer-credit strings (EN / BM from its i18n bundle, read 2026-11-23), "Lejar" → "Kira". */
export const CREDIT_TEXT = {
  "contacts.prepay.amount": { en: "Amount (MYR)", ms: "Amaun (MYR)" },
  "contacts.prepay.cancel": { en: "Cancel", ms: "Batal" },
  "contacts.prepay.date": { en: "Date", ms: "Tarikh" },
  "contacts.prepay.done": { en: "Prepayment recorded and kept as customer credit.", ms: "Pembayaran pendahuluan direkodkan dan disimpan sebagai kredit pelanggan." },
  "contacts.prepay.noBank": { en: "Add a cash or bank account to the chart of accounts first.", ms: "Tambah akaun tunai atau bank ke carta akaun dahulu." },
  "contacts.prepay.open": { en: "Receive a prepayment", ms: "Terima pembayaran pendahuluan" },
  "contacts.prepay.optional": { en: "Optional", ms: "Pilihan" },
  "contacts.prepay.receivedInto": { en: "Received into", ms: "Diterima ke dalam" },
  "contacts.prepay.recording": { en: "Recording...", ms: "Merekod..." },
  "contacts.prepay.reference": { en: "Reference", ms: "Rujukan" },
  "contacts.prepay.sstNote": { en: "Kira posts no SST and sends no e-invoice for a deposit. If you charge service tax, it can be due when the payment is received: check this with your tax agent.", ms: "Kira tidak merekod SST dan tidak menghantar e-invois untuk deposit. Jika anda mengenakan cukai perkhidmatan, cukai itu boleh perlu dibayar apabila pembayaran diterima. Semak perkara ini dengan ejen cukai anda." },
  "contacts.prepay.submit": { en: "Record prepayment", ms: "Rekod pembayaran pendahuluan" },
  "invoices.detail.applied": { en: "applied", ms: "digunakan" },
  "invoices.detail.applyCredit": { en: "Apply credit ({amount} available)", ms: "Guna kredit ({amount} tersedia)" },
  "invoices.detail.creditApplied": { en: "Customer credit applied", ms: "Kredit pelanggan digunakan" },
  "invoices.detail.creditApplied.on": { en: "Customer credit applied {date}", ms: "Kredit pelanggan digunakan {date}" },
  "invoices.detail.customerCredit": { en: "Customer credit", ms: "Kredit pelanggan" },
  "invoices.detail.undone": { en: "undone", ms: "dibatalkan" },
  "receipts.form.applyCredit": { en: "Apply MYR {amount} to {number}", ms: "Gunakan MYR {amount} pada {number}" },
  "receipts.form.creditKept": { en: "Receipt recorded. MYR {amount} was more than the invoice owed, so Kira kept it as customer credit.", ms: "Resit direkodkan. MYR {amount} melebihi amaun yang terhutang pada invois, jadi Kira menyimpannya sebagai kredit pelanggan." },
  "receipts.form.extraCredit": { en: "MYR {amount} is more than the invoice owes. Kira keeps it as customer credit. You can apply it to another invoice after you save.", ms: "MYR {amount} melebihi amaun yang terhutang pada invois. Kira menyimpannya sebagai kredit pelanggan. Anda boleh menggunakannya pada invois lain selepas menyimpan." },
  "receipts.form.extraCreditFor": { en: "MYR {amount} is more than the invoice owes. Kira keeps it as customer credit for {name}. You can apply it to another invoice after you save.", ms: "MYR {amount} melebihi amaun yang terhutang pada invois. Kira menyimpannya sebagai kredit pelanggan untuk {name}. Anda boleh menggunakannya pada invois lain selepas menyimpan." },
  "receipts.form.keepCredit": { en: "Keep as credit", ms: "Simpan sebagai kredit" },
} as const;

export type CreditTextKey = keyof typeof CREDIT_TEXT;

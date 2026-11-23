import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { fromSen } from "@/features/books/money";
import { loadQuickInvoiceDetail } from "@/features/quick-invoices/load";
import { createSupabaseServerClient } from "@/shared/supabase/server";

const INK = rgb(0.133, 0.2, 0.345);
const MUTED = rgb(0.42, 0.45, 0.52);
const LINE = rgb(0.86, 0.87, 0.9);
const TURQUOISE = rgb(0, 0.827, 0.78);

const safe = (s: string) =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7e\xa0-\xff]/g, "?");

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of safe(text).split(/\n/)) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

async function tryEmbedImage(
  pdf: PDFDocument,
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  storagePath: string | null,
): Promise<PDFImage | null> {
  if (!storagePath) return null;
  try {
    const { data } = await supabase.storage.from("org-assets").download(storagePath);
    if (!data) return null;
    const bytes = new Uint8Array(await data.arrayBuffer());
    const lower = storagePath.toLowerCase();
    if (lower.endsWith(".png") || (bytes[0] === 0x89 && bytes[1] === 0x50)) {
      return await pdf.embedPng(bytes);
    }
    return await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

/** GET /{slug}/quick-invoices/{id}/pdf: A4 PDF with org logo, bank/DuitNow details, and Payment QR. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ org: string; id: string }> },
) {
  const { org, id } = await params;
  const url = new URL(request.url);
  const inline = url.searchParams.get("inline") === "1";

  const supabase = await createSupabaseServerClient();
  const { data: orgRow } = await supabase
    .from("organizations")
    .select(
      "id, legal_name, registration_type, registration_number, sst_number, tin, address, postcode, city, state, phone, bank_name, bank_account_name, bank_account_number, duitnow_id, payment_note, logo_path, payment_qr_path",
    )
    .eq("slug", org)
    .maybeSingle();
  if (!orgRow) return new Response("Not found", { status: 404 });

  const qi = await loadQuickInvoiceDetail(supabase, orgRow.id, id);
  if (!qi) return new Response("Not found", { status: 404 });

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Invoice ${qi.invoiceNumber}`);
  pdf.setProducer("Kira");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [logoImg, qrImg] = await Promise.all([
    tryEmbedImage(pdf, supabase, orgRow.logo_path),
    tryEmbedImage(pdf, supabase, orgRow.payment_qr_path),
  ]);

  const W = 595.28;
  const H = 841.89;
  const M = 48;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  const text = (
    s: string,
    x: number,
    yy: number,
    o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; right?: boolean } = {},
  ) => {
    const size = o.size ?? 9.5;
    const font = o.font ?? regular;
    const str = safe(s);
    const xx = o.right ? x - font.widthOfTextAtSize(str, size) : x;
    page.drawText(str, { x: xx, y: yy, size, font, color: o.color ?? INK });
  };

  // Optional org logo above seller name
  if (logoImg) {
    const maxH = 38;
    const maxW = 140;
    const scale = Math.min(maxW / logoImg.width, maxH / logoImg.height, 1);
    const dw = logoImg.width * scale;
    const dh = logoImg.height * scale;
    page.drawImage(logoImg, { x: M, y: y - dh + 10, width: dw, height: dh });
    y -= dh + 4;
  }

  // Seller details
  text(orgRow.legal_name, M, y, { size: 15, font: bold });
  y -= 15;
  const ids = [
    orgRow.registration_number ? `${orgRow.registration_type ?? "BRN"} ${orgRow.registration_number}` : null,
    orgRow.tin ? `TIN ${orgRow.tin}` : null,
    orgRow.sst_number ? `SST ${orgRow.sst_number}` : null,
  ].filter(Boolean);
  if (ids.length) {
    text(ids.join("   "), M, y, { size: 8.5, color: MUTED });
    y -= 12;
  }
  const addrLines = [
    orgRow.address,
    [orgRow.postcode, orgRow.city, orgRow.state].filter(Boolean).join(", "),
    orgRow.phone ? `Tel: ${orgRow.phone}` : null,
  ].filter(Boolean) as string[];
  for (const al of addrLines) {
    for (const w of wrap(al, regular, 8.5, 290)) {
      text(w, M, y, { size: 8.5, color: MUTED });
      y -= 11;
    }
  }

  // Right title & metadata
  const titleLabel = qi.status === "draft" ? "DRAFT INVOICE" : "INVOICE";
  text(titleLabel, W - M, H - M, { size: 18, font: bold, right: true, color: INK });
  const meta: [string, string][] = [
    ["Invoice no.", qi.invoiceNumber],
    ["Invoice date", qi.invoiceDate],
    ["Due date", qi.dueDate ?? "-"],
  ];
  let my = H - M - 22;
  for (const [k, v] of meta) {
    text(k, W - M - 150, my, { color: MUTED });
    text(v, W - M, my, { right: true, font: bold });
    my -= 13;
  }

  y = Math.min(y, my) - 14;
  page.drawRectangle({ x: M, y, width: W - 2 * M, height: 2, color: TURQUOISE });
  y -= 20;

  // Bill to
  text("BILL TO", M, y, { size: 8, font: bold, color: MUTED });
  y -= 14;
  text(qi.customerName, M, y, { size: 11, font: bold });
  y -= 13;
  if (qi.customerEmail) {
    text(qi.customerEmail, M, y, { color: MUTED });
    y -= 13;
  }
  y -= 10;

  // Lines
  const cols = { desc: M, qty: 320, price: 385, tax: 440, amount: W - M };
  const header = () => {
    page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: rgb(0.96, 0.97, 0.98) });
    text("Description", cols.desc + 6, y, { size: 8.5, font: bold, color: MUTED });
    text("Qty", cols.qty, y, { size: 8.5, font: bold, color: MUTED, right: true });
    text("Unit price", cols.price + 40, y, { size: 8.5, font: bold, color: MUTED, right: true });
    text("SST", cols.tax, y, { size: 8.5, font: bold, color: MUTED });
    text("Amount (RM)", cols.amount - 6, y, { size: 8.5, font: bold, color: MUTED, right: true });
    y -= 22;
  };
  header();

  const TAX: Record<string, string> = {
    none: "-",
    sst_6: "SST 6%",
    sst_8: "SST 8%",
    sales_5: "Sales 5%",
    sales_10: "Sales 10%",
    exempt: "Exempt",
  };

  for (const l of qi.lines) {
    const desc = wrap(l.description, regular, 9.5, cols.qty - cols.desc - 56);
    if (y - desc.length * 12 < M + 150) {
      page = pdf.addPage([W, H]);
      y = H - M;
      header();
    }
    const unit = l.discountMode ? fromSen(l.discountedUnitPriceSen) : fromSen(l.unitPriceSen);
    text(desc[0], cols.desc + 6, y);
    text(String(l.quantity), cols.qty, y, { right: true });
    text(unit, cols.price + 40, y, { right: true });
    text(TAX[l.taxCode] ?? "-", cols.tax, y);
    text(fromSen(l.amountSen), cols.amount - 6, y, { right: true });
    y -= 12;
    for (const d of desc.slice(1)) {
      text(d, cols.desc + 6, y);
      y -= 12;
    }
    if (l.discountMode) {
      text(
        `Was ${fromSen(l.unitPriceSen)}${l.discountPercent != null ? `, less ${l.discountPercent}%` : ""}`,
        cols.desc + 6,
        y,
        { size: 8, color: MUTED },
      );
      y -= 11;
    }
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.5, color: LINE });
    y -= 8;
  }

  // Totals
  y -= 6;
  const totals: [string, string, boolean][] = [
    [qi.pricingMode === "inclusive" ? "Total excluding SST" : "Subtotal before SST", fromSen(qi.subtotalSen), false],
    [qi.pricingMode === "inclusive" ? "SST included" : "SST", fromSen(qi.taxTotalSen), false],
    ["Total (RM)", fromSen(qi.totalSen), true],
  ];
  for (const [k, v, strong] of totals) {
    text(k, W - M - 180, y, { font: strong ? bold : regular, color: strong ? INK : MUTED, size: strong ? 11 : 9.5 });
    text(v, W - M - 6, y, { right: true, font: strong ? bold : regular, size: strong ? 11 : 9.5 });
    y -= strong ? 18 : 14;
  }

  // Notes
  if (qi.notes) {
    y -= 8;
    text("NOTES", M, y, { size: 8, font: bold, color: MUTED });
    y -= 13;
    for (const w of wrap(qi.notes, regular, 9, W - 2 * M)) {
      text(w, M, y, { size: 9, color: MUTED });
      y -= 12;
    }
  }

  // Payment details & Payment QR
  const payLines = [
    orgRow.bank_name ? `Bank: ${orgRow.bank_name}` : null,
    orgRow.bank_account_name ? `Account name: ${orgRow.bank_account_name}` : null,
    orgRow.bank_account_number ? `Account no.: ${orgRow.bank_account_number}` : null,
    orgRow.duitnow_id ? `DuitNow ID: ${orgRow.duitnow_id}` : null,
    orgRow.payment_note ? orgRow.payment_note : null,
  ].filter(Boolean) as string[];

  if (payLines.length > 0 || qrImg) {
    if (y < M + 125) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
    y -= 14;
    page.drawLine({ start: { x: M, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.5, color: LINE });
    const blockTop = y;
    text("PAYMENT DETAILS", M, y, { size: 8, font: bold, color: MUTED });
    y -= 13;
    for (const pl of payLines) {
      for (const w of wrap(pl, regular, 9, qrImg ? W - 2 * M - 110 : W - 2 * M)) {
        text(w, M, y, { size: 9, color: INK });
        y -= 12;
      }
    }
    if (qrImg) {
      const box = 88;
      const scale = Math.min(box / qrImg.width, box / qrImg.height);
      const dw = qrImg.width * scale;
      const dh = qrImg.height * scale;
      page.drawImage(qrImg, { x: W - M - dw, y: blockTop - dh + 4, width: dw, height: dh });
      text("Scan to pay", W - M - dw / 2 + 22, blockTop - dh - 8, { size: 7.5, color: MUTED, right: true });
    }
  }

  for (const p of pdf.getPages()) {
    p.drawSvgPath("M5 3v14M15 3.5 8 10l7 6.5", { x: M, y: M - 6, scale: 0.6, borderColor: MUTED, borderWidth: 1.6 });
    p.drawText("Made with Kira", { x: M + 16, y: M - 15, size: 7.5, font: regular, color: MUTED });
  }

  const bytes = await pdf.save();
  const filename = `${safe(qi.invoiceNumber).replace(/[^A-Za-z0-9._-]/g, "_")}.pdf`;
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}

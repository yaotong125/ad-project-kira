import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { fromSen, toSen } from "@/features/books/money";
import { loadInvoice } from "@/features/invoices/load";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/**
 * GET /{slug}/invoices/{id}/pdf: the invoice as an A4 PDF ("Download PDF"). lejar.ai's PDF was not
 * observed, so this layout is Kira's: seller block, "INVOICE", customer, lines, totals, notes.
 */
const INK = rgb(0.133, 0.2, 0.345); // Kira navy #223358
const MUTED = rgb(0.42, 0.45, 0.52);
const LINE = rgb(0.86, 0.87, 0.9);
const TURQUOISE = rgb(0, 0.827, 0.78);

/** Standard PDF fonts only cover Latin-1: replace anything else so the file always builds. */
const safe = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
const money = (v: string | number) => fromSen(toSen(String(v)) ?? 0);

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

export async function GET(_request: Request, { params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: orgRow } = await supabase.from("organizations").select("id, legal_name, registration_type, registration_number, sst_number, tin").eq("slug", org).maybeSingle();
  if (!orgRow) return new Response("Not found", { status: 404 });
  const inv = await loadInvoice(supabase, orgRow.id, id);
  if (!inv) return new Response("Not found", { status: 404 });

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Invoice ${inv.invoice_number}`);
  pdf.setProducer("Kira");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28;
  const H = 841.89;
  const M = 48;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const text = (s: string, x: number, yy: number, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const size = o.size ?? 9.5;
    const font = o.font ?? regular;
    const str = safe(s);
    const xx = o.right ? x - font.widthOfTextAtSize(str, size) : x;
    page.drawText(str, { x: xx, y: yy, size, font, color: o.color ?? INK });
  };

  // Seller
  text(orgRow.legal_name, M, y, { size: 15, font: bold });
  y -= 16;
  const ids = [
    orgRow.registration_number ? `${orgRow.registration_type ?? "BRN"} ${orgRow.registration_number}` : null,
    orgRow.tin ? `TIN ${orgRow.tin}` : null,
    orgRow.sst_number ? `SST ${orgRow.sst_number}` : null,
  ].filter(Boolean);
  if (ids.length) {
    text(ids.join("   "), M, y, { color: MUTED });
    y -= 14;
  }
  // Title block (right)
  const status = inv.status === "draft" ? "DRAFT INVOICE" : inv.status === "void" ? "VOID INVOICE" : "INVOICE";
  text(status, W - M, H - M, { size: 18, font: bold, right: true, color: inv.status === "void" ? MUTED : INK });
  const meta: [string, string][] = [
    ["Invoice no.", inv.invoice_number],
    ["Invoice date", inv.invoice_date],
    ["Due date", inv.due_date ?? "-"],
  ];
  let my = H - M - 22;
  for (const [k, v] of meta) {
    text(k, W - M - 150, my, { color: MUTED });
    text(v, W - M, my, { right: true, font: bold });
    my -= 13;
  }
  y = Math.min(y, my) - 18;
  page.drawRectangle({ x: M, y, width: W - 2 * M, height: 2, color: TURQUOISE });
  y -= 22;

  // Customer
  const c = inv.contacts;
  text("BILL TO", M, y, { size: 8, font: bold, color: MUTED });
  y -= 14;
  text(c.name, M, y, { size: 11, font: bold });
  y -= 13;
  for (const l of [c.address, [c.postcode, c.city].filter(Boolean).join(" "), c.state, c.tin ? `TIN ${c.tin}` : null, c.email].filter(Boolean) as string[]) {
    for (const w of wrap(l, regular, 9.5, 280)) {
      text(w, M, y, { color: MUTED });
      y -= 12;
    }
  }
  y -= 14;

  // Lines
  const cols = { desc: M, qty: 320, price: 385, tax: 440, amount: W - M };
  const header = () => {
    page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: rgb(0.96, 0.97, 0.98) });
    text("Description", cols.desc + 6, y, { size: 8.5, font: bold, color: MUTED });
    text("Qty", cols.qty, y, { size: 8.5, font: bold, color: MUTED, right: true });
    text("Unit price", cols.price + 40, y, { size: 8.5, font: bold, color: MUTED, right: true });
    text("Tax", cols.tax, y, { size: 8.5, font: bold, color: MUTED });
    text("Amount (RM)", cols.amount - 6, y, { size: 8.5, font: bold, color: MUTED, right: true });
    y -= 22;
  };
  header();
  const TAX: Record<string, string> = { none: "-", sst_6: "SST 6%", sst_8: "SST 8%", sales_5: "Sales 5%", sales_10: "Sales 10%" };
  for (const l of inv.invoice_lines) {
    const desc = wrap(l.description, regular, 9.5, cols.qty - cols.desc - 60);
    if (y - desc.length * 12 < M + 120) {
      page = pdf.addPage([W, H]);
      y = H - M;
      header();
    }
    const unit = l.discount_mode ? `${money(l.discounted_unit_price)}` : money(l.unit_price);
    text(desc[0], cols.desc + 6, y);
    text(String(Number(l.quantity)), cols.qty, y, { right: true });
    text(unit, cols.price + 40, y, { right: true });
    text(TAX[l.tax_code] ?? "-", cols.tax, y);
    text(money(l.amount), cols.amount - 6, y, { right: true });
    y -= 12;
    for (const d of desc.slice(1)) {
      text(d, cols.desc + 6, y);
      y -= 12;
    }
    if (l.discount_mode) {
      text(`Was ${money(l.unit_price)}${l.discount_percent ? `, less ${Number(l.discount_percent)}%` : ""}`, cols.desc + 6, y, { size: 8, color: MUTED });
      y -= 11;
    }
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.5, color: LINE });
    y -= 8;
  }

  // Totals
  y -= 6;
  const totals: [string, string, boolean][] = [
    [inv.pricing_mode === "inclusive" ? "Total excluding SST" : "Subtotal", money(inv.subtotal), false],
    [inv.pricing_mode === "inclusive" ? "SST included" : "SST", money(inv.tax_total), false],
    ["Total (RM)", money(inv.total), true],
  ];
  for (const [k, v, strong] of totals) {
    text(k, W - M - 170, y, { font: strong ? bold : regular, color: strong ? INK : MUTED, size: strong ? 11 : 9.5 });
    text(v, W - M - 6, y, { right: true, font: strong ? bold : regular, size: strong ? 11 : 9.5 });
    y -= strong ? 18 : 14;
  }
  if (inv.notes) {
    y -= 10;
    text("NOTES", M, y, { size: 8, font: bold, color: MUTED });
    y -= 13;
    for (const w of wrap(inv.notes, regular, 9.5, W - 2 * M)) {
      text(w, M, y, { color: MUTED });
      y -= 12;
    }
  }
  if (inv.status === "void") {
    text(`Voided on ${inv.voided_on ?? ""}: ${inv.void_reason ?? ""}`, M, M + 20, { color: MUTED });
  }
  for (const p of pdf.getPages()) {
    p.drawSvgPath("M5 3v14M15 3.5 8 10l7 6.5", { x: M, y: M - 6, scale: 0.6, borderColor: MUTED, borderWidth: 1.6 });
    p.drawText("Made with Kira", { x: M + 16, y: M - 15, size: 7.5, font: regular, color: MUTED });
  }

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${safe(inv.invoice_number).replace(/[^A-Za-z0-9._-]/g, "_")}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
